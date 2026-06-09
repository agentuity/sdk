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
	/** Default start command when package.json has no start script. */
	defaultStartCommand?: {
		command: string;
		/** Only use this default when the package is present in dependencies or devDependencies. */
		whenPackage?: string;
	};
	/**
	 * Always use `defaultStartCommand` even when the project ships its
	 * own `start` script. Useful for frameworks whose scaffolded `start`
	 * invokes a dev-only CLI (e.g. `nest start`, `mastra start`) that
	 * is not present in the production runtime (devDependency only).
	 */
	preferDefaultStart?: boolean;
	/**
	 * Server-adapter requirement. Some frameworks only emit a deployable
	 * Node server when a server/SSR adapter is configured; for the
	 * Vite-based ones (TanStack Start) that's the `nitro()` plugin from
	 * the `nitro` package. Without it, `vite build` emits a client-only
	 * SPA, the `defaultStartCommand` server entry never exists, and any
	 * backend routes (and SSR) are dropped. When `package` is absent from
	 * the project's dependencies we surface `warning` at detect time so
	 * the user can add it before they ship a broken deploy.
	 */
	requiresServerAdapter?: {
		/** Package whose presence indicates the server adapter is configured. */
		package: string;
		/** Actionable guidance shown when the package is missing. */
		warning: string;
	};
	/**
	 * Override `outputDirectory` at detect time by inspecting the project.
	 * Used by frameworks whose output path is determined by a config file
	 * the user owns (e.g. Angular's `angular.json` for v17+ where the
	 * applicationBuilder emits `dist/<project>/browser/`).
	 * Returning `null` falls back to `outputDirectory`.
	 */
	resolveOutputDirectory?: (projectDir: string) => Promise<string | null>;
	/** Commands that generate framework virtual TypeScript files before tsc runs. */
	typegenCommand?: string | string[];
	/** Packages required by the built runtime even if templates install them as devDependencies. */
	runtimeDependencies?: string[];
	/** Dev dependencies to install transiently before build without persisting to package.json. */
	buildPreinstallDevDependencies?: string[];
	/** Temporary source-file replacements applied before build and reverted after build. */
	buildFileReplacements?: Array<{
		path: string;
		search: string;
		replacement: string;
	}>;
	/** Default output directory for static assets */
	outputDirectory: string | null;
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
	/**
	 * Public URL path prefix for files inside staticDir.
	 * Use an empty string when staticDir is the public web root.
	 */
	staticAssetPublicPath?: string;
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
		staticAssetPublicPath: '_next/static',
		envPrefix: 'NEXT_PUBLIC_',
		detectors: {
			every: [{ matchPackage: 'next' }],
		},
	},
	{
		name: 'Nuxt',
		slug: 'nuxt',
		buildCommand: 'nuxt build',
		defaultStartCommand: { command: 'HOST=0.0.0.0 node .output/server/index.mjs' },
		// Nitro's default `node-server` preset emits a self-listening
		// Node entry at `.output/server/index.mjs` plus static assets
		// at `.output/public/`. The user's `start` script
		// (`node .output/server/index.mjs`) runs from the deploy root,
		// so we preserve the .output/ tree intact.
		outputDirectory: '.output',
		staticDir: '.output/public',
		staticAssetPublicPath: '',
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
		staticAssetPublicPath: 'build',
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
		staticDir: 'build/client', // Client-side assets
		staticAssetPublicPath: '',
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
		defaultStartCommand: { command: 'node build/index.js' },
		typegenCommand: 'svelte-kit sync',
		buildPreinstallDevDependencies: ['@sveltejs/adapter-node'],
		buildFileReplacements: [
			{
				path: 'svelte.config.js',
				search: '@sveltejs/adapter-auto',
				replacement: '@sveltejs/adapter-node',
			},
		],
		// SvelteKit's `adapter-node` (the self-hosting default) writes a
		// self-listening Node server to `build/index.js` plus client
		// assets at `build/client/`. The user's `start` script is what
		// we run.
		outputDirectory: 'build',
		staticDir: 'build/client',
		staticAssetPublicPath: '',
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
		defaultStartCommand: {
			command: 'node ./dist/server/entry.mjs',
			whenPackage: '@astrojs/node',
		},
		typegenCommand: 'astro sync',
		runtimeDependencies: ['@astrojs/node'],
		outputDirectory: 'dist',
		staticDir: null, // Entire dist/ is static (SSG default); dist/client/ for SSR
		staticAssetPublicPath: '',
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
		staticAssetPublicPath: '',
		envPrefix: 'VITE_',
		detectors: {
			every: [{ matchPackage: 'solid-js' }, { matchPackage: '@solidjs/start' }],
		},
	},
	{
		name: 'TanStack Start',
		slug: 'tanstack-start',
		buildCommand: 'vite build',
		defaultStartCommand: { command: 'HOST=0.0.0.0 node .output/server/index.mjs' },
		requiresServerAdapter: {
			package: 'nitro',
			warning:
				'TanStack Start needs the Nitro Vite plugin to build a deployable server. ' +
				'Without it, `vite build` produces a client-only SPA and your SSR + server ' +
				'routes are dropped, so the deploy 404s every route. Install `nitro` and add ' +
				"`import { nitro } from 'nitro/vite'` to the plugins in your vite.config.ts.",
		},
		// With the `nitro()` Vite plugin (see hosting docs), TanStack
		// Start emits a self-listening Node server at
		// `.output/server/index.mjs` plus static assets under
		// `.output/public/` — the same Nitro `node-server` preset Nuxt
		// uses. The hosting docs don't add a `start` script, so we
		// default to launching that server entry; a user-supplied
		// production `start` script still wins via the resolver. Without
		// this default, a project with no `start` script falls through to
		// the static-file server injector, which has no root index.html
		// for an SSR build and 404s every route.
		outputDirectory: '.output',
		staticDir: '.output/public',
		staticAssetPublicPath: '',
		detectors: {
			every: [{ matchPackage: '@tanstack/react-start' }],
		},
	},
	{
		name: 'RedwoodJS',
		slug: 'redwoodjs',
		buildCommand: 'yarn rw build',
		outputDirectory: null, // Dynamic — depends on target
		staticDir: 'web/dist', // Redwood web-side build output
		staticAssetPublicPath: '',
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
		staticAssetPublicPath: '',
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
		staticAssetPublicPath: '',
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
		staticAssetPublicPath: '',
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
		staticAssetPublicPath: '',
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
		staticAssetPublicPath: '',
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
		staticAssetPublicPath: '',
		detectors: {
			every: [{ matchPackage: 'hexo' }],
		},
	},

	// ── UI frameworks (with CLI build) ──

	{
		name: 'Angular',
		slug: 'angular',
		buildCommand: 'ng build',
		// Angular's actual output path is `dist/<project>/browser/` for
		// the v17+ applicationBuilder; for legacy browserBuilder it's
		// `dist/<project>/`. We resolve it dynamically from angular.json.
		outputDirectory: 'dist',
		resolveOutputDirectory: async (projectDir) => {
			const { readFile } = await import('node:fs/promises');
			const { join } = await import('node:path');
			try {
				const raw = await readFile(join(projectDir, 'angular.json'), 'utf-8');
				const cfg = JSON.parse(raw) as {
					defaultProject?: string;
					projects?: Record<
						string,
						{
							architect?: {
								build?: {
									builder?: string;
									options?: { outputPath?: string };
								};
							};
						}
					>;
				};
				const projects = cfg.projects ?? {};
				const name = cfg.defaultProject ?? Object.keys(projects)[0];
				if (!name) return null;
				const build = projects[name]?.architect?.build;
				const base = build?.options?.outputPath ?? `dist/${name}`;
				// The modern applicationBuilder always writes a `browser/`
				// subdir alongside server assets. Detect it by builder name.
				const isApplicationBuilder =
					typeof build?.builder === 'string' &&
					build.builder.includes('@angular/build:application');
				return isApplicationBuilder ? `${base}/browser` : base;
			} catch {
				return null;
			}
		},
		staticDir: null, // Entire output dir is static (browser/ for v17+, project root pre-17)
		staticAssetPublicPath: '',
		// `ng serve` is the dev server — never a production start.
		// Angular ships static assets; the generic adapter injects a
		// static file server when `startCommand` is absent.
		preferDefaultStart: true,
		detectors: {
			every: [{ matchPackage: '@angular/cli' }],
		},
	},
	{
		name: 'NestJS',
		slug: 'nestjs',
		// `nest build` invokes the Nest CLI (devDependency). The compiled
		// entry lands at `dist/main.js`. The scaffolded `start` is
		// `nest start`, which requires `@nestjs/cli` at runtime — a
		// devDependency, stripped by `--omit=dev` on the deploy host.
		// Always run the compiled artifact instead.
		buildCommand: 'nest build',
		outputDirectory: 'dist',
		defaultStartCommand: { command: 'node dist/main.js' },
		preferDefaultStart: true,
		detectors: {
			some: [{ matchPackage: '@nestjs/core' }, { matchPackage: '@nestjs/common' }],
		},
	},
	{
		name: 'Mastra',
		slug: 'mastra',
		// `mastra build` bundles into `.mastra/output/`. The scaffolded
		// `start` is `mastra start`, which shells out to the Mastra CLI
		// (devDependency) at runtime — same problem as Nest. Run the
		// bundled entry directly.
		buildCommand: 'mastra build',
		outputDirectory: '.mastra/output',
		defaultStartCommand: { command: 'node .mastra/output/index.mjs' },
		preferDefaultStart: true,
		detectors: {
			some: [{ matchPackage: '@mastra/core' }, { matchPackage: 'mastra' }],
		},
	},
	{
		name: 'Vue.js',
		slug: 'vue',
		buildCommand: 'vue-cli-service build',
		outputDirectory: 'dist',
		staticDir: null, // Entire dist/ is static output
		staticAssetPublicPath: '',
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
		staticAssetPublicPath: '',
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
		staticAssetPublicPath: '',
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
		staticAssetPublicPath: '',
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
		staticDir: null, // Entire dist/ is static output
		staticAssetPublicPath: '',
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
		staticAssetPublicPath: '',
		detectors: {
			every: [{ matchPackage: 'parcel' }],
		},
	},
];
