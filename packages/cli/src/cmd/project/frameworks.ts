/**
 * Framework scaffolding catalog.
 *
 * Maps supported frameworks to their official create CLI commands
 * and the augmentation steps needed to integrate with Agentuity.
 *
 * Each entry describes:
 * - How to scaffold the project (create CLI + args)
 * - What Agentuity dependencies to add
 * - How to inject a simple AI SDK example
 */

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
	 * Generate a small Agentuity badge/link to add to the framework's default page.
	 *
	 * Returns a map of relative file paths to file contents.
	 * Files are written (or appended) after scaffolding to add an
	 * "Powered by Agentuity" link on the default landing page.
	 */
	brandSnippet?: () => Record<string, string>;
}

// ─── Agentuity Badge ─────────────────────────────────────────────────────────

// ─── AI Example Helpers ──────────────────────────────────────────────────────

function nextjsAiExample(): Record<string, string> {
	return {
		'app/api/chat/route.ts': `import OpenAI from 'openai';
import { NextResponse } from 'next/server';

const openai = new OpenAI();

export async function POST(request: Request) {
\tconst { message } = await request.json();

\tconst completion = await openai.chat.completions.create({
\t\tmodel: 'gpt-4o-mini',
\t\tmessages: [
\t\t\t{ role: 'system', content: 'You are a helpful assistant.' },
\t\t\t{ role: 'user', content: message },
\t\t],
\t});

\treturn NextResponse.json({
\t\treply: completion.choices[0]?.message?.content ?? '',
\t});
}
`,
	};
}

function nuxtAiExample(): Record<string, string> {
	return {
		'server/api/chat.post.ts': `import OpenAI from 'openai';

const openai = new OpenAI();

export default defineEventHandler(async (event) => {
\tconst { message } = await readBody(event);

\tconst completion = await openai.chat.completions.create({
\t\tmodel: 'gpt-4o-mini',
\t\tmessages: [
\t\t\t{ role: 'system', content: 'You are a helpful assistant.' },
\t\t\t{ role: 'user', content: message },
\t\t],
\t});

\treturn {
\t\treply: completion.choices[0]?.message?.content ?? '',
\t};
});
`,
	};
}

function remixAiExample(): Record<string, string> {
	return {
		'app/routes/api.chat.ts': `import { type ActionFunctionArgs, json } from '@remix-run/node';
import OpenAI from 'openai';

const openai = new OpenAI();

export async function action({ request }: ActionFunctionArgs) {
\tconst { message } = await request.json();

\tconst completion = await openai.chat.completions.create({
\t\tmodel: 'gpt-4o-mini',
\t\tmessages: [
\t\t\t{ role: 'system', content: 'You are a helpful assistant.' },
\t\t\t{ role: 'user', content: message },
\t\t],
\t});

\treturn json({
\t\treply: completion.choices[0]?.message?.content ?? '',
\t});
}
`,
	};
}

function sveltekitAiExample(): Record<string, string> {
	return {
		'src/routes/api/chat/+server.ts': `import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import OpenAI from 'openai';

const openai = new OpenAI();

export const POST: RequestHandler = async ({ request }) => {
\tconst { message } = await request.json();

\tconst completion = await openai.chat.completions.create({
\t\tmodel: 'gpt-4o-mini',
\t\tmessages: [
\t\t\t{ role: 'system', content: 'You are a helpful assistant.' },
\t\t\t{ role: 'user', content: message },
\t\t],
\t});

\treturn json({
\t\treply: completion.choices[0]?.message?.content ?? '',
\t});
};
`,
	};
}

function astroAiExample(): Record<string, string> {
	return {
		'src/pages/api/chat.ts': `import type { APIRoute } from 'astro';
import OpenAI from 'openai';

const openai = new OpenAI();

export const POST: APIRoute = async ({ request }) => {
\tconst { message } = await request.json();

\tconst completion = await openai.chat.completions.create({
\t\tmodel: 'gpt-4o-mini',
\t\tmessages: [
\t\t\t{ role: 'system', content: 'You are a helpful assistant.' },
\t\t\t{ role: 'user', content: message },
\t\t],
\t});

\treturn new Response(
\t\tJSON.stringify({ reply: completion.choices[0]?.message?.content ?? '' }),
\t\t{ headers: { 'Content-Type': 'application/json' } }
\t);
};
`,
	};
}

function honoAiExample(): Record<string, string> {
	return {
		'src/index.ts': `import { Hono } from 'hono';
import OpenAI from 'openai';

const app = new Hono();
const openai = new OpenAI();

app.get('/', (c) => c.text('Hello from Hono + Agentuity!'));

app.post('/api/chat', async (c) => {
\tconst { message } = await c.req.json();

\tconst completion = await openai.chat.completions.create({
\t\tmodel: 'gpt-4o-mini',
\t\tmessages: [
\t\t\t{ role: 'system', content: 'You are a helpful assistant.' },
\t\t\t{ role: 'user', content: message },
\t\t],
\t});

\treturn c.json({
\t\treply: completion.choices[0]?.message?.content ?? '',
\t});
});

export default app;
`,
	};
}

function viteReactAiExample(): Record<string, string> {
	return {
		'server.ts': `import OpenAI from 'openai';

const openai = new OpenAI();

Bun.serve({
\tport: process.env.PORT ?? 3000,
\tasync fetch(request) {
\t\tconst url = new URL(request.url);

\t\tif (url.pathname === '/api/chat' && request.method === 'POST') {
\t\t\tconst { message } = await request.json();

\t\t\tconst completion = await openai.chat.completions.create({
\t\t\t\tmodel: 'gpt-4o-mini',
\t\t\t\tmessages: [
\t\t\t\t\t{ role: 'system', content: 'You are a helpful assistant.' },
\t\t\t\t\t{ role: 'user', content: message },
\t\t\t\t],
\t\t\t});

\t\t\treturn Response.json({
\t\t\t\treply: completion.choices[0]?.message?.content ?? '',
\t\t\t});
\t\t}

\t\treturn new Response('Not Found', { status: 404 });
\t},
});

console.log('Server running on http://localhost:' + (process.env.PORT ?? 3000));
`,
	};
}

// ─── Brand Snippet Helpers ────────────────────────────────────────────────────

function nextjsBrandSnippet(): Record<string, string> {
	return {
		'src/components/AgentuityBadge.tsx': `export function AgentuityBadge() {
	return (
		<a
			href="https://agentuity.dev/"
			target="_blank"
			rel="noopener noreferrer"
			style={{
				position: 'fixed',
				bottom: '1rem',
				right: '1rem',
				display: 'flex',
				alignItems: 'center',
				gap: '0.5rem',
				padding: '0.5rem 0.75rem',
				background: '#09090b',
				border: '1px solid #27272a',
				borderRadius: '0.5rem',
				color: '#a1a1aa',
				fontSize: '0.75rem',
				textDecoration: 'none',
				transition: 'border-color 0.2s',
				zIndex: 50,
			}}
			onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#00FFFF')}
			onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#27272a')}
		>
			<svg xmlns="http://www.w3.org/2000/svg" width="16" height="14" viewBox="0 0 220 191" fill="none">
				<path fillRule="evenodd" clipRule="evenodd" d="M220 191H0L31.427 136.5H0L8 122.5H180.5L220 191ZM47.588 136.5L24.234 177H195.766L172.412 136.5H47.588Z" fill="#00FFFF" />
				<path fillRule="evenodd" clipRule="evenodd" d="M110 0L157.448 82.5H189L197 96.5H54.5L110 0ZM78.702 82.5L110 28.081L141.298 82.5H78.702Z" fill="#00FFFF" />
			</svg>
			Powered by Agentuity
		</a>
	);
}
`,
	};
}

function nuxtBrandSnippet(): Record<string, string> {
	return {
		'components/AgentuityBadge.vue': `<template>
	<a
		href="https://agentuity.dev/"
		target="_blank"
		rel="noopener noreferrer"
		class="agentuity-badge"
	>
		<svg xmlns="http://www.w3.org/2000/svg" width="16" height="14" viewBox="0 0 220 191" fill="none">
			<path fill-rule="evenodd" clip-rule="evenodd" d="M220 191H0L31.427 136.5H0L8 122.5H180.5L220 191ZM47.588 136.5L24.234 177H195.766L172.412 136.5H47.588Z" fill="#00FFFF" />
			<path fill-rule="evenodd" clip-rule="evenodd" d="M110 0L157.448 82.5H189L197 96.5H54.5L110 0ZM78.702 82.5L110 28.081L141.298 82.5H78.702Z" fill="#00FFFF" />
		</svg>
		Powered by Agentuity
	</a>
</template>

<style scoped>
.agentuity-badge {
	position: fixed;
	bottom: 1rem;
	right: 1rem;
	display: flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0.5rem 0.75rem;
	background: #09090b;
	border: 1px solid #27272a;
	border-radius: 0.5rem;
	color: #a1a1aa;
	font-size: 0.75rem;
	text-decoration: none;
	transition: border-color 0.2s;
	z-index: 50;
}
.agentuity-badge:hover {
	border-color: #00FFFF;
}
</style>
`,
	};
}

function remixBrandSnippet(): Record<string, string> {
	return {
		'app/components/AgentuityBadge.tsx': `export function AgentuityBadge() {
	return (
		<a
			href="https://agentuity.dev/"
			target="_blank"
			rel="noopener noreferrer"
			style={{
				position: 'fixed',
				bottom: '1rem',
				right: '1rem',
				display: 'flex',
				alignItems: 'center',
				gap: '0.5rem',
				padding: '0.5rem 0.75rem',
				background: '#09090b',
				border: '1px solid #27272a',
				borderRadius: '0.5rem',
				color: '#a1a1aa',
				fontSize: '0.75rem',
				textDecoration: 'none',
				transition: 'border-color 0.2s',
				zIndex: 50,
			}}
			onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#00FFFF')}
			onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#27272a')}
		>
			<svg xmlns="http://www.w3.org/2000/svg" width="16" height="14" viewBox="0 0 220 191" fill="none">
				<path fillRule="evenodd" clipRule="evenodd" d="M220 191H0L31.427 136.5H0L8 122.5H180.5L220 191ZM47.588 136.5L24.234 177H195.766L172.412 136.5H47.588Z" fill="#00FFFF" />
				<path fillRule="evenodd" clipRule="evenodd" d="M110 0L157.448 82.5H189L197 96.5H54.5L110 0ZM78.702 82.5L110 28.081L141.298 82.5H78.702Z" fill="#00FFFF" />
			</svg>
			Powered by Agentuity
		</a>
	);
}
`,
	};
}

function sveltekitBrandSnippet(): Record<string, string> {
	return {
		'src/lib/AgentuityBadge.svelte': `<a
	href="https://agentuity.dev/"
	target="_blank"
	rel="noopener noreferrer"
	class="agentuity-badge"
>
	<svg xmlns="http://www.w3.org/2000/svg" width="16" height="14" viewBox="0 0 220 191" fill="none">
		<path fill-rule="evenodd" clip-rule="evenodd" d="M220 191H0L31.427 136.5H0L8 122.5H180.5L220 191ZM47.588 136.5L24.234 177H195.766L172.412 136.5H47.588Z" fill="#00FFFF" />
		<path fill-rule="evenodd" clip-rule="evenodd" d="M110 0L157.448 82.5H189L197 96.5H54.5L110 0ZM78.702 82.5L110 28.081L141.298 82.5H78.702Z" fill="#00FFFF" />
	</svg>
	Powered by Agentuity
</a>

<style>
.agentuity-badge {
	position: fixed;
	bottom: 1rem;
	right: 1rem;
	display: flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0.5rem 0.75rem;
	background: #09090b;
	border: 1px solid #27272a;
	border-radius: 0.5rem;
	color: #a1a1aa;
	font-size: 0.75rem;
	text-decoration: none;
	transition: border-color 0.2s;
	z-index: 50;
}
.agentuity-badge:hover {
	border-color: #00FFFF;
}
</style>
`,
	};
}

function astroBrandSnippet(): Record<string, string> {
	return {
		'src/components/AgentuityBadge.astro': `---
---
<a
	href="https://agentuity.dev/"
	target="_blank"
	rel="noopener noreferrer"
	class="agentuity-badge"
>
	<svg xmlns="http://www.w3.org/2000/svg" width="16" height="14" viewBox="0 0 220 191" fill="none">
		<path fill-rule="evenodd" clip-rule="evenodd" d="M220 191H0L31.427 136.5H0L8 122.5H180.5L220 191ZM47.588 136.5L24.234 177H195.766L172.412 136.5H47.588Z" fill="#00FFFF" />
		<path fill-rule="evenodd" clip-rule="evenodd" d="M110 0L157.448 82.5H189L197 96.5H54.5L110 0ZM78.702 82.5L110 28.081L141.298 82.5H78.702Z" fill="#00FFFF" />
	</svg>
	Powered by Agentuity
</a>

<style>
.agentuity-badge {
	position: fixed;
	bottom: 1rem;
	right: 1rem;
	display: flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0.5rem 0.75rem;
	background: #09090b;
	border: 1px solid #27272a;
	border-radius: 0.5rem;
	color: #a1a1aa;
	font-size: 0.75rem;
	text-decoration: none;
	transition: border-color 0.2s;
	z-index: 50;
}
.agentuity-badge:hover {
	border-color: #00FFFF;
}
</style>
`,
	};
}

function viteReactBrandSnippet(): Record<string, string> {
	return {
		'src/AgentuityBadge.tsx': `export function AgentuityBadge() {
	return (
		<a
			href="https://agentuity.dev/"
			target="_blank"
			rel="noopener noreferrer"
			style={{
				position: 'fixed',
				bottom: '1rem',
				right: '1rem',
				display: 'flex',
				alignItems: 'center',
				gap: '0.5rem',
				padding: '0.5rem 0.75rem',
				background: '#09090b',
				border: '1px solid #27272a',
				borderRadius: '0.5rem',
				color: '#a1a1aa',
				fontSize: '0.75rem',
				textDecoration: 'none',
				transition: 'border-color 0.2s',
				zIndex: 50,
			}}
			onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#00FFFF')}
			onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#27272a')}
		>
			<svg xmlns="http://www.w3.org/2000/svg" width="16" height="14" viewBox="0 0 220 191" fill="none">
				<path fillRule="evenodd" clipRule="evenodd" d="M220 191H0L31.427 136.5H0L8 122.5H180.5L220 191ZM47.588 136.5L24.234 177H195.766L172.412 136.5H47.588Z" fill="#00FFFF" />
				<path fillRule="evenodd" clipRule="evenodd" d="M110 0L157.448 82.5H189L197 96.5H54.5L110 0ZM78.702 82.5L110 28.081L141.298 82.5H78.702Z" fill="#00FFFF" />
			</svg>
			Powered by Agentuity
		</a>
	);
}
`,
	};
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
		dependencies: ['openai'],
		scripts: {
			deploy: 'agentuity deploy',
		},
		aiExample: nextjsAiExample,
		brandSnippet: nextjsBrandSnippet,
	},
	{
		slug: 'nuxt',
		name: 'Nuxt',
		description: 'Full-stack Vue framework with server routes',
		createCommand: (dir) => ['bunx', 'nuxi@latest', 'init', dir, '--packageManager', 'bun'],
		dependencies: ['openai'],
		scripts: {
			deploy: 'agentuity deploy',
		},
		aiExample: nuxtAiExample,
		brandSnippet: nuxtBrandSnippet,
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
		dependencies: ['openai'],
		scripts: {
			deploy: 'agentuity deploy',
		},
		aiExample: remixAiExample,
		brandSnippet: remixBrandSnippet,
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
		dependencies: ['openai'],
		scripts: {
			deploy: 'agentuity deploy',
		},
		aiExample: sveltekitAiExample,
		brandSnippet: sveltekitBrandSnippet,
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
		dependencies: ['openai'],
		scripts: {
			deploy: 'agentuity deploy',
		},
		aiExample: astroAiExample,
		brandSnippet: astroBrandSnippet,
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
		dependencies: ['openai'],
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
		dependencies: ['openai'],
		scripts: {
			deploy: 'agentuity deploy',
		},
		aiExample: viteReactAiExample,
		brandSnippet: viteReactBrandSnippet,
	},
];

/**
 * Find a framework scaffold by slug.
 */
export function getFrameworkBySlug(slug: string): FrameworkScaffold | undefined {
	return frameworkCatalog.find((f) => f.slug === slug);
}
