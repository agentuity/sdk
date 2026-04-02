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
		envPrefix: 'NEXT_PUBLIC_',
		detectors: {
			every: [{ matchPackage: 'next' }],
		},
	},
	{
		name: 'Nuxt',
		slug: 'nuxt',
		buildCommand: 'nuxt build',
		outputDirectory: 'dist',
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
		outputDirectory: 'public',
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
		detectors: {
			every: [{ matchPackage: '@tanstack/router-plugin' }, { matchPackage: 'nitro' }],
		},
	},
	{
		name: 'RedwoodJS',
		slug: 'redwoodjs',
		buildCommand: 'yarn rw build',
		outputDirectory: null, // Dynamic — depends on target
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
		detectors: {
			every: [{ matchPackage: '@11ty/eleventy' }],
		},
	},
	{
		name: 'VitePress',
		slug: 'vitepress',
		buildCommand: 'vitepress build docs',
		outputDirectory: 'docs/.vitepress/dist',
		detectors: {
			every: [{ matchPackage: 'vitepress' }],
		},
	},
	{
		name: 'VuePress',
		slug: 'vuepress',
		buildCommand: 'vuepress build src',
		outputDirectory: 'src/.vuepress/dist',
		detectors: {
			every: [{ matchPackage: 'vuepress' }],
		},
	},
	{
		name: 'Docusaurus',
		slug: 'docusaurus',
		buildCommand: 'docusaurus build',
		outputDirectory: 'build',
		detectors: {
			some: [{ matchPackage: '@docusaurus/core' }],
		},
	},
	{
		name: 'Hexo',
		slug: 'hexo',
		buildCommand: 'hexo generate',
		outputDirectory: 'public',
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
		detectors: {
			every: [{ matchPackage: '@angular/cli' }],
		},
	},
	{
		name: 'Vue.js',
		slug: 'vue',
		buildCommand: 'vue-cli-service build',
		outputDirectory: 'dist',
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
		detectors: {
			every: [{ matchPackage: 'parcel' }],
		},
	},
];
