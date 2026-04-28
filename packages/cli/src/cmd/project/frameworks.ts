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

import { join } from 'node:path';
import { cpSync, existsSync } from 'node:fs';

// Resolve the templates directory relative to this file.
// When running from src/ (via bun), import.meta.dir is src/cmd/project/.
// When running from dist/ (via compiled JS), import.meta.dir is dist/cmd/project/.
// Templates live under src/cmd/project/templates/ but are also shipped
// in the npm package at that path. We check both locations.
const templatesDir = (() => {
	const srcDir = join(import.meta.dir, 'templates');
	if (existsSync(join(srcDir, 'nextjs'))) return srcDir;
	// Fallback: from dist/cmd/project/ → src/cmd/project/templates/
	const fallbackDir = join(import.meta.dir, '..', '..', 'src', 'cmd', 'project', 'templates');
	if (existsSync(join(fallbackDir, 'nextjs'))) return fallbackDir;
	return srcDir; // will fail with a clear error if neither exists
})();

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
	 * @returns The full command as an argv array (e.g. ["bunx", "create-next-app", "my-app", ...])
	 */
	createCommand: (projectDir: string) => string[];

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

// ─── Framework Catalog ───────────────────────────────────────────────────────

export const frameworkCatalog: FrameworkScaffold[] = [
	{
		slug: 'nextjs',
		name: 'Next.js',
		description: 'Full-stack React framework with App Router',
		createCommand: (dir) => [
			'bunx',
			'create-next-app@latest',
			dir,
			'--ts',
			'--app',
			'--tailwind',
			'--eslint',
			'--src-dir',
			'--import-alias',
			'@/*',
			'--use-bun',
		],
		dependencies: ['openai', '@agentuity/keyvalue', 'swr'],
		scripts: {
			deploy: 'agentuity deploy',
		},
		overlayDir: 'nextjs',
	},
	{
		slug: 'nuxt',
		name: 'Nuxt',
		description: 'Full-stack Vue framework with server routes',
		createCommand: (dir) => [
			'bunx',
			'nuxi@latest',
			'init',
			dir,
			'--template',
			'minimal',
			'--packageManager',
			'bun',
		],
		dependencies: ['openai', '@agentuity/keyvalue'],
		scripts: {
			deploy: 'agentuity deploy',
		},
		overlayDir: 'nuxt',
	},
	{
		slug: 'remix',
		name: 'React Router',
		description: 'Full-stack React framework with nested routing',
		createCommand: (dir) => [
			'bunx',
			'create-react-router@latest',
			dir,
			'--yes',
			'--install',
			'--package-manager',
			'bun',
		],
		dependencies: ['openai', '@agentuity/keyvalue'],
		scripts: {
			deploy: 'agentuity deploy',
		},
		overlayDir: 'remix',
	},
	{
		slug: 'sveltekit',
		name: 'SvelteKit',
		description: 'Full-stack Svelte framework',
		createCommand: (dir) => [
			'bunx',
			'sv@latest',
			'create',
			dir,
			'--template',
			'minimal',
			'--types',
			'ts',
			'--no-add-ons',
			'--install',
			'bun',
		],
		dependencies: ['openai', '@agentuity/keyvalue'],
		devDependencies: ['@sveltejs/adapter-node'],
		scripts: {
			deploy: 'agentuity deploy',
		},
		overlayDir: 'sveltekit',
	},
	{
		slug: 'astro',
		name: 'Astro',
		description: 'Content-focused framework with island architecture',
		createCommand: (dir) => [
			'bunx',
			'create-astro@latest',
			dir,
			'--template',
			'basics',
			'--install',
			'--yes',
			'--typescript',
			'strict',
		],
		dependencies: ['openai', '@agentuity/keyvalue', '@astrojs/node'],
		scripts: {
			deploy: 'agentuity deploy',
		},
		overlayDir: 'astro',
	},
	{
		slug: 'hono',
		name: 'Hono',
		description: 'Lightweight, fast web framework for the edge',
		createCommand: (dir) => [
			'bunx',
			'create-hono@latest',
			dir,
			'--template',
			'bun',
			'--install',
			'--pm',
			'bun',
		],
		dependencies: ['openai', '@agentuity/keyvalue'],
		scripts: {
			build: 'bun build src/index.ts --target=bun --outdir=dist',
			start: 'bun dist/index.js',
			deploy: 'agentuity deploy',
		},
		overlayDir: 'hono',
	},
	{
		slug: 'vite-react',
		name: 'Vite + React',
		description: 'React SPA with Vite bundler',
		createCommand: (dir) => ['bunx', 'create-vite@latest', dir, '--template', 'react-ts'],
		dependencies: ['openai', '@agentuity/keyvalue', '@tanstack/react-query'],
		devDependencies: ['tailwindcss', '@tailwindcss/vite'],
		scripts: {
			build: 'tsc -b && vite build && bun build server.ts --target=bun --outfile=dist/server.js',
			start: 'NODE_ENV=production bun dist/server.js',
			deploy: 'agentuity deploy',
		},
		overlayDir: 'vite-react',
	},
];

/**
 * Find a framework scaffold by slug.
 */
export function getFrameworkBySlug(slug: string): FrameworkScaffold | undefined {
	return frameworkCatalog.find((f) => f.slug === slug);
}
