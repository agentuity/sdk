/**
 * Framework detection database.
 *
 * Package detection rules (which npm packages and config files identify each
 * framework) were informed by the @vercel/frameworks package (Apache-2.0,
 * Copyright 2017 Vercel Inc, github.com/vercel/vercel/tree/main/packages/frameworks).
 *
 * All Vercel-specific properties (logos, CDN URLs, runtime config, routing
 * rules, deploy targets) have been stripped. Only generic framework facts
 * remain: package names, config filenames, default build commands, and output
 * directories as documented by each framework's own docs.
 *
 * Framework entries are ordered by specificity — more specific frameworks
 * (e.g., SvelteKit) should be listed before generic ones (e.g., Vite).
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DetectorRule {
	/** Match a package in dependencies or devDependencies */
	matchPackage?: string;
	/** Match a file path (relative to project root) */
	path?: string;
	/** Regex pattern to match against file content (requires `path`) */
	matchContent?: string;
}

export interface FrameworkDefinition {
	/** Human-readable name */
	name: string;
	/** Unique slug identifier */
	slug: string;
	/** Default build command (null = no build step) */
	buildCommand: string | null;
	/** Default output directory for static assets */
	outputDirectory: string | null;
	/** Command to launch the copied build output */
	startCommand?: string;
	/** Server entrypoint after the output directory is copied */
	serverEntry?: string;
	/** Runtime used by the launch command */
	runtime?: 'node' | 'bun';
	/**
	 * Static/CDN asset directory, relative to the project root.
	 *
	 * Points to the directory containing files suitable for CDN upload
	 * (JS bundles, CSS, images, fonts, etc.) after the build runs.
	 *
	 * - `null` means the entire outputDirectory IS the static output
	 *   (pure static-site generators, SPAs) — resolved to outputDirectory.
	 * - A string path (e.g., `.next/static`, `.output/public`) is resolved
	 *   relative to the project root, since some frameworks put static
	 *   assets outside their main output directory.
	 * - `undefined` (omitted) means no known static asset directory.
	 */
	staticDir?: string | null;
	/** Environment variable prefix for browser-inlined values */
	envPrefix?: string;
	/**
	 * Detection rules.
	 * - `every`: ALL must match for the framework to be detected.
	 * - `some`: at least ONE must match (in addition to all `every` rules).
	 */
	detectors: {
		every?: DetectorRule[];
		some?: DetectorRule[];
	};
}

// ─── Framework Database ──────────────────────────────────────────────────────

/**
 * JS/TS framework definitions for detection.
 *
 * Order matters — first match wins. More specific frameworks come first,
 * generic catch-alls (Vite, Parcel) come last.
 */
export const frameworkDefinitions: FrameworkDefinition[] = [
	// ── Meta-frameworks (most specific, check first) ──

	{
		name: 'Next.js',
		slug: 'nextjs',
		buildCommand: 'next build',
		outputDirectory: null, // Dynamic — reads from next.config
		staticDir: '.next/static', // Relative to project root (adapter handles standalone copy)
		envPrefix: 'NEXT_PUBLIC_',
		detectors: {
			every: [{ matchPackage: 'next' }],
		},
	},
	{
		name: 'Nuxt',
		slug: 'nuxt',
		buildCommand: 'nuxt build',
		outputDirectory: '.output',
		startCommand: 'node server/index.mjs',
		serverEntry: 'server/index.mjs',
		staticDir: '.output/public', // Nitro output; static assets served from here
		envPrefix: 'NUXT_ENV_',
		detectors: {
			some: [
				{ matchPackage: 'nuxt' },
				{ matchPackage: 'nuxt3' },
				{ matchPackage: 'nuxt-edge' },
				{ matchPackage: 'nuxt-nightly' },
			],
		},
	},
	{
		name: 'Remix',
		slug: 'remix',
		buildCommand: 'remix build',
		outputDirectory: 'public',
		staticDir: 'public/build', // Built browser bundles
		detectors: {
			some: [
				{ matchPackage: '@remix-run/dev' },
				{ path: 'remix.config.js' },
				{ path: 'remix.config.mjs' },
			],
		},
	},
	{
		name: 'React Router',
		slug: 'react-router',
		buildCommand: 'react-router build',
		outputDirectory: 'build',
		startCommand: 'node node_modules/.bin/react-router-serve ./server/index.js',
		serverEntry: 'server/index.js',
		staticDir: 'build/client', // Client-side assets
		detectors: {
			some: [
				{ path: 'react-router.config.js' },
				{ path: 'react-router.config.ts' },
				{ path: 'vite.config.js', matchContent: '@react-router/dev/vite' },
				{ path: 'vite.config.ts', matchContent: '@react-router/dev/vite' },
			],
		},
	},
	{
		name: 'SvelteKit',
		slug: 'sveltekit',
		buildCommand: 'vite build',
		outputDirectory: 'build',
		startCommand: 'node index.js',
		serverEntry: 'index.js',
		staticDir: 'build/client', // adapter-node client assets
		detectors: {
			every: [
				{
					path: 'package.json',
					matchContent: '"(dev)?(d|D)ependencies":\\s*{[^}]*"@sveltejs\\/kit":\\s*".+?"[^}]*}',
				},
			],
		},
	},
	{
		name: 'Astro',
		slug: 'astro',
		buildCommand: 'astro build',
		outputDirectory: 'dist',
		startCommand: 'node server/entry.mjs',
		serverEntry: 'server/entry.mjs',
		staticDir: 'dist/client',
		envPrefix: 'PUBLIC_',
		detectors: {
			every: [{ matchPackage: 'astro' }],
		},
	},
	{
		name: 'SolidStart',
		slug: 'solidstart',
		buildCommand: 'vinxi build',
		outputDirectory: '.output',
		staticDir: '.output/public', // Nitro-based static assets
		envPrefix: 'VITE_',
		detectors: {
			every: [{ matchPackage: 'solid-js' }, { matchPackage: '@solidjs/start' }],
		},
	},
	{
		name: 'TanStack Start',
		slug: 'tanstack-start',
		buildCommand: 'vite build',
		outputDirectory: 'dist',
		staticDir: '.output/public', // Nitro-based; similar to Nuxt/SolidStart
		detectors: {
			every: [{ matchPackage: '@tanstack/router-plugin' }, { matchPackage: 'nitro' }],
		},
	},
	{
		name: 'RedwoodJS',
		slug: 'redwoodjs',
		buildCommand: 'yarn rw build',
		outputDirectory: null, // Dynamic — depends on target
		staticDir: 'web/dist', // Redwood web-side build output
		envPrefix: 'REDWOOD_ENV_',
		detectors: {
			every: [{ matchPackage: '@redwoodjs/core' }],
		},
	},

	// ── Static site generators ──

	{
		name: 'Gatsby.js',
		slug: 'gatsby',
		buildCommand: 'gatsby build',
		outputDirectory: 'public',
		staticDir: null, // Entire public/ is static output
		envPrefix: 'GATSBY_',
		detectors: {
			every: [{ matchPackage: 'gatsby' }],
		},
	},
	{
		name: 'Eleventy',
		slug: 'eleventy',
		buildCommand: 'npx @11ty/eleventy',
		outputDirectory: '_site',
		staticDir: null, // Entire _site/ is static output
		detectors: {
			every: [{ matchPackage: '@11ty/eleventy' }],
		},
	},
	{
		name: 'VitePress',
		slug: 'vitepress',
		buildCommand: 'vitepress build docs',
		outputDirectory: 'docs/.vitepress/dist',
		staticDir: null, // Entire output is static
		detectors: {
			every: [{ matchPackage: 'vitepress' }],
		},
	},
	{
		name: 'VuePress',
		slug: 'vuepress',
		buildCommand: 'vuepress build src',
		outputDirectory: 'src/.vuepress/dist',
		staticDir: null, // Entire output is static
		detectors: {
			every: [{ matchPackage: 'vuepress' }],
		},
	},
	{
		name: 'Docusaurus',
		slug: 'docusaurus',
		buildCommand: 'docusaurus build',
		outputDirectory: 'build',
		staticDir: null, // Entire build/ is static output
		detectors: {
			some: [{ matchPackage: '@docusaurus/core' }],
		},
	},
	{
		name: 'Hexo',
		slug: 'hexo',
		buildCommand: 'hexo generate',
		outputDirectory: 'public',
		staticDir: null, // Entire public/ is static output
		detectors: {
			every: [{ matchPackage: 'hexo' }],
		},
	},

	// ── UI frameworks (with CLI build) ──

	{
		name: 'Angular',
		slug: 'angular',
		buildCommand: 'ng build',
		outputDirectory: 'dist',
		staticDir: null, // Entire dist/ is static output (browser subfolder in v17+)
		detectors: {
			every: [{ matchPackage: '@angular/cli' }],
		},
	},
	{
		name: 'Vue.js',
		slug: 'vue',
		buildCommand: 'vue-cli-service build',
		outputDirectory: 'dist',
		staticDir: null, // Entire dist/ is static output
		envPrefix: 'VUE_APP_',
		detectors: {
			every: [{ matchPackage: '@vue/cli-service' }],
		},
	},
	{
		name: 'Create React App',
		slug: 'create-react-app',
		buildCommand: 'react-scripts build',
		outputDirectory: 'build',
		staticDir: null, // Entire build/ is static output
		envPrefix: 'REACT_APP_',
		detectors: {
			some: [{ matchPackage: 'react-scripts' }, { matchPackage: 'react-dev-utils' }],
		},
	},
	{
		name: 'Preact',
		slug: 'preact',
		buildCommand: 'preact build',
		outputDirectory: 'build',
		staticDir: null, // Entire build/ is static output
		detectors: {
			every: [{ matchPackage: 'preact-cli' }],
		},
	},

	// ── Server frameworks (no default build step) ──

	{
		name: 'Nitro',
		slug: 'nitro',
		buildCommand: 'nitro build',
		outputDirectory: 'dist',
		staticDir: '.output/public', // Nitro static assets
		detectors: {
			some: [{ matchPackage: 'nitropack' }, { matchPackage: 'nitro' }],
		},
	},

	// ── Generic bundlers (least specific, check last) ──

	{
		name: 'Vite',
		slug: 'vite',
		buildCommand: 'vite build',
		outputDirectory: 'dist',
		startCommand: 'NODE_ENV=production bun server.js',
		serverEntry: 'server.js',
		runtime: 'bun',
		staticDir: null, // Entire dist/ is static output
		envPrefix: 'VITE_',
		detectors: {
			every: [{ matchPackage: 'vite' }],
		},
	},
	{
		name: 'Parcel',
		slug: 'parcel',
		buildCommand: 'parcel build',
		outputDirectory: 'dist',
		staticDir: null, // Entire dist/ is static output
		detectors: {
			every: [{ matchPackage: 'parcel' }],
		},
	},
];
