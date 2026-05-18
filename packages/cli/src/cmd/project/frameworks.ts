/**
 * Framework scaffolding catalog.
 *
 * Maps supported frameworks to their official create CLI commands
 * and the augmentation steps needed to integrate with Agentuity.
 *
 * AI examples and landing pages are provided as template overlay
 * directories under templates/<slug>/ that get copied on top of
 * the scaffolded project. This approach is more maintainable than
 * inline code snippets and produces complete, working files.
 */

import { cpSync } from 'node:fs';
import { join } from 'node:path';
import type { PackageManager } from '../build/detect/types.ts';
import { currentDir } from '../../node-compat/runtime-info.ts';

// Resolve the templates directory relative to this file.
//
// Layouts to handle:
//
//   - Running from source (bun packages/cli/src/main.ts):
//       thisDir = packages/cli/src/cmd/project/
//       templates at thisDir/templates/
//
//   - Running from compiled dist (e.g. installed npm package):
//       thisDir = packages/cli/dist/cmd/project/
//       templates copied by scripts/copy-assets.ts to
//       packages/cli/dist/cmd/project/templates/
//
// The same `thisDir/templates` path resolves correctly under both
// layouts because the dist tree mirrors the source tree (rootDir is
// `./src` so dist/cmd/... = src/cmd/...).
const templatesDir = join(currentDir(import.meta), 'templates');

export interface FrameworkScaffold {
	/** Unique slug (matches detect/frameworks.ts where applicable) */
	slug: string;

	/** Human-readable name */
	name: string;

	/** Short description for the select prompt */
	description: string;

	/**
	 * Build the create command.
	 *
	 * @param projectDir - The target directory name (relative, e.g. "my-app")
	 * @param pm - The package manager the user chose. Frameworks should
	 *   honor it where they have a flag for it (each tool spells the
	 *   flag differently); if a framework has no `--package-manager`
	 *   equivalent, render the bare command and let it pick the pm via
	 *   lockfile-detection.
	 * @returns The full command as an argv array (e.g. ["bunx", "create-next-app", "my-app", ...])
	 */
	createCommand: (projectDir: string, pm: PackageManager) => string[];

	/**
	 * Agentuity packages to add as dependencies after scaffolding.
	 * `@agentuity/cli` is always added as a devDependency automatically.
	 */
	dependencies?: string[];

	/**
	 * Extra devDependencies to add (beyond @agentuity/cli).
	 */
	devDependencies?: string[];

	/**
	 * Scripts to merge into package.json.
	 * These are merged on top of whatever the framework CLI created.
	 */
	scripts?: Record<string, string>;

	/**
	 * Template overlay directory name (relative to templates/).
	 *
	 * When set, the contents of templates/<overlayDir>/ are recursively
	 * copied on top of the scaffolded project after the framework CLI runs.
	 * Existing files are overwritten; new files are created.
	 */
	overlayDir?: string;
}

/**
 * Apply a template overlay directory on top of a scaffolded project.
 */
export function applyOverlay(dest: string, overlayDir: string): void {
	const overlayPath = join(templatesDir, overlayDir);
	cpSync(overlayPath, dest, { recursive: true, dereference: true, force: true });
}

// ─── Per-package-manager helpers ────────────────────────────────────────────────

/**
 * The command to invoke a remote npm package without installing it
 * (the modern equivalent of `npx`). Each package manager spells
 * this slightly differently. We hardcode the canonical pair for
 * the four supported managers.
 */
function dlxCommand(pm: PackageManager): string[] {
	switch (pm) {
		case 'bun':
			return ['bunx'];
		case 'pnpm':
			return ['pnpm', 'dlx'];
		case 'yarn':
			return ['yarn', 'dlx'];
		default:
			return ['npx'];
	}
}

// ─── Framework Catalog ───────────────────────────────────────────────────────────

export const frameworkCatalog: FrameworkScaffold[] = [
	{
		slug: 'nextjs',
		name: 'Next.js',
		description: 'Full-stack React framework with App Router',
		createCommand: (dir, pm) => [
			...dlxCommand(pm),
			'create-next-app@latest',
			dir,
			'--ts',
			'--app',
			'--tailwind',
			'--eslint',
			'--src-dir',
			'--import-alias',
			'@/*',
			`--use-${pm}`,
		],
		dependencies: ['@agentuity/aigateway', 'swr'],
		scripts: {
			build: 'next build --webpack',
			deploy: 'agentuity deploy',
		},
		overlayDir: 'nextjs',
	},
	{
		slug: 'nuxt',
		name: 'Nuxt',
		description: 'Full-stack Vue framework with server routes',
		// `nuxi init` has multiple interactive prompts:
		//   1. template selection — `--template minimal` skips it.
		//   2. git initialization — `--gitInit=false` skips it.
		//   3. "would you like to browse and install modules?" — there’s no
		//      flag for this one. We rely on the runner to deny stdin
		//      so nuxi accepts the (No) default.
		createCommand: (dir, pm) => [
			...dlxCommand(pm),
			'nuxi@latest',
			'init',
			dir,
			'--template',
			'minimal',
			'--gitInit=false',
			'--packageManager',
			pm,
		],
		dependencies: ['@agentuity/aigateway'],
		devDependencies: ['@tailwindcss/vite', 'tailwindcss'],
		scripts: {
			deploy: 'agentuity deploy',
			// Nitro's default `node-server` preset emits a self-listening
			// Node entry at `.output/server/index.mjs`. Nuxi doesn't ship
			// a `start` script by default, so the deploy pipeline falls
			// back to a static-file server — wrong for SSR. Set it here
			// so the user gets a working production process out of the box.
			start: 'HOST=0.0.0.0 node .output/server/index.mjs',
		},
		overlayDir: 'nuxt',
	},
	{
		slug: 'sveltekit',
		name: 'SvelteKit',
		description: 'Full-stack Svelte framework',
		// `sv create` would otherwise hang on its add-ons prompt;
		// `--no-add-ons` skips it. `--install <pm>` passes the chosen
		// pm directly.
		createCommand: (dir, pm) => [
			...dlxCommand(pm),
			'sv@latest',
			'create',
			dir,
			'--template',
			'minimal',
			'--types',
			'ts',
			'--no-add-ons',
			'--install',
			pm,
		],
		dependencies: ['@agentuity/aigateway'],
		// Swap sv's default `@sveltejs/adapter-auto` (which can't detect
		// our runtime) for `@sveltejs/adapter-node`, which emits a
		// self-listening Node server at `build/index.js`. The overlay
		// drops a matching svelte.config.js. @agentuity/vite configures
		// Vite dev/HMR for `agentuity dev --public`.
		devDependencies: [
			'@agentuity/vite',
			'@sveltejs/adapter-node',
			'@tailwindcss/vite',
			'tailwindcss',
		],
		scripts: {
			deploy: 'agentuity deploy',
			start: 'node build/index.js',
		},
		overlayDir: 'sveltekit',
	},
	{
		slug: 'astro',
		name: 'Astro',
		description: 'Content-focused framework with island architecture',
		createCommand: (dir, pm) => [
			...dlxCommand(pm),
			'create-astro@latest',
			dir,
			'--template',
			'basics',
			'--install',
			'--package-manager',
			pm,
			'--yes',
			'--typescript',
			'strict',
		],
		dependencies: ['@agentuity/aigateway'],
		// Astro defaults to a static SPA build. We swap to SSR via
		// `@astrojs/node` (standalone mode) so the deploy can host
		// server-rendered pages and API routes. The overlay drops a
		// matching `astro.config.mjs`. @agentuity/vite configures Vite
		// dev/HMR for `agentuity dev --public`.
		devDependencies: ['@agentuity/vite', '@astrojs/node', '@tailwindcss/vite', 'tailwindcss'],
		scripts: {
			deploy: 'agentuity deploy',
			start: 'node ./dist/server/entry.mjs',
		},
		overlayDir: 'astro',
	},
	{
		slug: 'hono',
		name: 'Hono',
		description: 'Lightweight, fast web framework for the edge',
		// Use create-hono's Node template regardless of package manager.
		// The Bun template intentionally has no build script and runs
		// TypeScript directly; our package smoke tests and deploy pipeline
		// expect a real build artifact. Package-manager selection still
		// controls install/lockfile behavior via `--pm`.
		createCommand: (dir, pm) => [
			...dlxCommand(pm),
			'create-hono@latest',
			dir,
			'--template',
			'nodejs',
			'--install',
			'--pm',
			pm,
		],
		dependencies: ['@agentuity/aigateway'],
		devDependencies: ['esbuild'],
		scripts: {
			build: 'esbuild src/index.ts --bundle --platform=node --format=cjs --target=node22 --outfile=dist/src/index.cjs',
			deploy: 'agentuity deploy',
			start: 'node dist/src/index.cjs',
		},
		overlayDir: 'hono',
	},
];

/**
 * Find a framework scaffold by slug.
 */
export function getFrameworkBySlug(slug: string): FrameworkScaffold | undefined {
	return frameworkCatalog.find((f) => f.slug === slug);
}
