/**
 * Framework scaffolding catalog.
 *
 * Maps supported frameworks to their official create CLI commands
 * and the augmentation steps needed to integrate with Agentuity.
 *
 * AI examples and landing pages are in separate files to keep
 * this catalog focused on framework configuration.
 */

import {
	nextjsAiExample,
	nuxtAiExample,
	remixAiExample,
	sveltekitAiExample,
	astroAiExample,
	honoAiExample,
	viteReactAiExample,
} from './frameworks-ai-examples';

import {
	nextjsLandingPage,
	nuxtLandingPage,
	remixLandingPage,
	sveltekitLandingPage,
	astroLandingPage,
	viteReactLandingPage,
} from './frameworks-landing-pages';

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
	 * Generate AI SDK example files for this framework.
	 *
	 * Returns a map of relative file paths to file contents.
	 * Only called if the user opts in to the AI example.
	 */
	aiExample?: () => Record<string, string>;

	/**
	 * Replace the framework's default landing page with an Agentuity-branded page.
	 *
	 * Returns a map of relative file paths to file contents.
	 * Files overwrite the framework's default page after scaffolding.
	 */
	landingPage?: () => Record<string, string>;
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
		dependencies: ['ai', '@ai-sdk/openai'],
		scripts: {
			deploy: 'agentuity deploy',
		},
		aiExample: nextjsAiExample,
		landingPage: nextjsLandingPage,
	},
	{
		slug: 'nuxt',
		name: 'Nuxt',
		description: 'Full-stack Vue framework with server routes',
		createCommand: (dir) => ['bunx', 'nuxi@latest', 'init', dir, '--packageManager', 'bun'],
		dependencies: ['ai', '@ai-sdk/openai'],
		scripts: {
			deploy: 'agentuity deploy',
		},
		aiExample: nuxtAiExample,
		landingPage: nuxtLandingPage,
	},
	{
		slug: 'remix',
		name: 'Remix',
		description: 'Full-stack React framework with nested routing',
		createCommand: (dir) => [
			'bunx',
			'create-remix@latest',
			dir,
			'--yes',
			'--install',
			'--package-manager',
			'bun',
		],
		dependencies: ['ai', '@ai-sdk/openai'],
		scripts: {
			deploy: 'agentuity deploy',
		},
		aiExample: remixAiExample,
		landingPage: remixLandingPage,
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
		],
		dependencies: ['ai', '@ai-sdk/openai'],
		scripts: {
			deploy: 'agentuity deploy',
		},
		aiExample: sveltekitAiExample,
		landingPage: sveltekitLandingPage,
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
		dependencies: ['ai', '@ai-sdk/openai'],
		scripts: {
			deploy: 'agentuity deploy',
		},
		aiExample: astroAiExample,
		landingPage: astroLandingPage,
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
		dependencies: ['ai', '@ai-sdk/openai'],
		scripts: {
			deploy: 'agentuity deploy',
		},
		aiExample: honoAiExample,
	},
	{
		slug: 'vite-react',
		name: 'Vite + React',
		description: 'React SPA with Vite bundler',
		createCommand: (dir) => ['bunx', 'create-vite@latest', dir, '--template', 'react-ts'],
		dependencies: ['ai', '@ai-sdk/openai'],
		scripts: {
			deploy: 'agentuity deploy',
		},
		aiExample: viteReactAiExample,
		landingPage: viteReactLandingPage,
	},
];

/**
 * Find a framework scaffold by slug.
 */
export function getFrameworkBySlug(slug: string): FrameworkScaffold | undefined {
	return frameworkCatalog.find((f) => f.slug === slug);
}
