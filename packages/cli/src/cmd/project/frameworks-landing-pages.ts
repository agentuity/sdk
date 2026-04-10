/**
 * Agentuity-branded landing page generators for each framework.
 *
 * Each function returns a map of relative file paths to file contents
 * that replace the framework's default landing page with a dark-themed
 * Agentuity welcome page matching the brand design system.
 *
 * Design: dark background (#09090b), cyan accent (#00FFFF), Agentuity
 * logo, "Welcome to Agentuity" heading, and framework-specific next steps.
 */

// ─── Shared ──────────────────────────────────────────────────────────────────

const AGENTUITY_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="42" viewBox="0 0 220 191" fill="none">
	<path fill-rule="evenodd" clip-rule="evenodd" d="M220 191H0L31.427 136.5H0L8 122.5H180.5L220 191ZM47.588 136.5L24.234 177H195.766L172.412 136.5H47.588Z" fill="#00FFFF"/>
	<path fill-rule="evenodd" clip-rule="evenodd" d="M110 0L157.448 82.5H189L197 96.5H54.5L110 0ZM78.702 82.5L110 28.081L141.298 82.5H78.702Z" fill="#00FFFF"/>
</svg>`;

const SHARED_STYLES = `
<style>
	* { margin: 0; padding: 0; box-sizing: border-box; }
	body { background: #09090b; color: #a1a1aa; font-family: system-ui, -apple-system, sans-serif; min-height: 100vh; display: flex; justify-content: center; }
	.wrap { max-width: 48rem; width: 100%; padding: 4rem; display: flex; flex-direction: column; gap: 1rem; }
	.header { text-align: center; margin-bottom: 2rem; }
	.header svg { margin-bottom: 1rem; }
	.header h1 { font-size: 3rem; font-weight: 100; color: #fff; }
	.header p { font-size: 1.125rem; color: #71717a; }
	.header em { font-style: italic; font-family: Georgia, serif; }
	.card { background: #000; border: 1px solid #1c1c1e; border-radius: 0.5rem; padding: 2rem; }
	.card h3 { color: #fff; font-size: 1.25rem; font-weight: 400; margin-bottom: 1.5rem; }
	.step { display: flex; gap: 0.75rem; align-items: flex-start; margin-bottom: 1.25rem; }
	.step:last-child { margin-bottom: 0; }
	.check { width: 1rem; height: 1rem; border: 1px solid #22c55e; background: #052e16; border-radius: 0.25rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 0.1rem; }
	.check svg { width: 0.625rem; height: 0.625rem; }
	.step h4 { color: #fff; font-size: 0.875rem; font-weight: 400; margin-bottom: 0.25rem; }
	.step p { font-size: 0.75rem; }
	code { color: #fff; background: #1c1c1e; padding: 0.125rem 0.375rem; border-radius: 0.25rem; font-size: 0.75rem; }
	a.badge { position: fixed; bottom: 1rem; right: 1rem; display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; background: #09090b; border: 1px solid #27272a; border-radius: 0.5rem; color: #a1a1aa; font-size: 0.75rem; text-decoration: none; transition: border-color 0.2s; z-index: 50; }
	a.badge:hover { border-color: #00FFFF; }
	a.badge svg { width: 16px; height: 14px; }
</style>`;

const CHECK_SVG =
	'<svg fill="none" stroke="#22c55e" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>';

const BADGE_SVG =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 191" fill="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M220 191H0L31.427 136.5H0L8 122.5H180.5L220 191ZM47.588 136.5L24.234 177H195.766L172.412 136.5H47.588Z" fill="#00FFFF"/><path fill-rule="evenodd" clip-rule="evenodd" d="M110 0L157.448 82.5H189L197 96.5H54.5L110 0ZM78.702 82.5L110 28.081L141.298 82.5H78.702Z" fill="#00FFFF"/></svg>';

function buildPage(frameworkLabel: string, steps: { title: string; text: string }[]): string {
	const stepsHtml = steps
		.map(
			(s) => `
			<div class="step">
				<div class="check">${CHECK_SVG}</div>
				<div><h4>${s.title}</h4><p>${s.text}</p></div>
			</div>`
		)
		.join('');

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="utf-8"/>
	<meta name="viewport" content="width=device-width, initial-scale=1"/>
	<title>Agentuity + ${frameworkLabel}</title>
	${SHARED_STYLES}
</head>
<body>
	<div class="wrap">
		<div class="header">
			${AGENTUITY_LOGO_SVG}
			<h1>Welcome to Agentuity</h1>
			<p><em>${frameworkLabel}</em> + AI Gateway</p>
		</div>
		<div class="card">
			<h3>Getting started</h3>
			${stepsHtml}
		</div>
	</div>
	<a class="badge" href="https://agentuity.dev/" target="_blank" rel="noopener noreferrer">${BADGE_SVG} Powered by Agentuity</a>
</body>
</html>`;
}

// ─── Framework-specific Landing Pages ────────────────────────────────────────

export function nextjsLandingPage(): Record<string, string> {
	return {
		'src/app/page.tsx': `export default function Home() {
	return (
		<div
			style={{ background: '#09090b', color: '#a1a1aa', fontFamily: 'system-ui, -apple-system, sans-serif', minHeight: '100vh', display: 'flex', justifyContent: 'center' }}
			dangerouslySetInnerHTML={{
				__html: \`${buildReactInnerHtml('Next.js', [
					{
						title: 'AI Gateway',
						text: 'Run <code>agentuity dev</code> to start with AI Gateway routing.',
					},
					{
						title: 'API route',
						text: 'Edit <code>app/api/chat/route.ts</code> to customize the AI endpoint.',
					},
					{
						title: 'Deploy',
						text: 'Run <code>agentuity deploy</code> to ship to production.',
					},
				])}\`
			}}
		/>
	);
}
`,
		'src/app/globals.css': `body { margin: 0; }
`,
	};
}

export function nuxtLandingPage(): Record<string, string> {
	return {
		'app.vue': `<template>
	<div v-html="html" />
</template>

<script setup lang="ts">
const html = \`${buildPage('Nuxt', [
			{
				title: 'AI Gateway',
				text: 'Run <code>agentuity dev</code> to start with AI Gateway routing.',
			},
			{
				title: 'Server route',
				text: 'Edit <code>server/api/chat.post.ts</code> to customize the AI endpoint.',
			},
			{ title: 'Deploy', text: 'Run <code>agentuity deploy</code> to ship to production.' },
		])}\`;
</script>
`,
	};
}

export function remixLandingPage(): Record<string, string> {
	return {
		'app/routes/_index.tsx': `export default function Index() {
	return (
		<div
			style={{ background: '#09090b', color: '#a1a1aa', fontFamily: 'system-ui, -apple-system, sans-serif', minHeight: '100vh', display: 'flex', justifyContent: 'center' }}
			dangerouslySetInnerHTML={{
				__html: \`${buildReactInnerHtml('Remix', [
					{
						title: 'AI Gateway',
						text: 'Run <code>agentuity dev</code> to start with AI Gateway routing.',
					},
					{
						title: 'Action route',
						text: 'Edit <code>app/routes/api.chat.ts</code> to customize the AI endpoint.',
					},
					{
						title: 'Deploy',
						text: 'Run <code>agentuity deploy</code> to ship to production.',
					},
				])}\`
			}}
		/>
	);
}
`,
	};
}

export function sveltekitLandingPage(): Record<string, string> {
	return {
		'src/routes/+page.svelte': `{@html \`${buildPage('SvelteKit', [
			{
				title: 'AI Gateway',
				text: 'Run <code>agentuity dev</code> to start with AI Gateway routing.',
			},
			{
				title: 'Server route',
				text: 'Edit <code>src/routes/api/chat/+server.ts</code> to customize the AI endpoint.',
			},
			{ title: 'Deploy', text: 'Run <code>agentuity deploy</code> to ship to production.' },
		])}\`}
`,
	};
}

export function astroLandingPage(): Record<string, string> {
	return {
		'src/pages/index.astro': `---
---
${buildPage('Astro', [
	{
		title: 'AI Gateway',
		text: 'Run <code>agentuity dev</code> to start with AI Gateway routing.',
	},
	{
		title: 'API route',
		text: 'Edit <code>src/pages/api/chat.ts</code> to customize the AI endpoint.',
	},
	{ title: 'Deploy', text: 'Run <code>agentuity deploy</code> to ship to production.' },
])}
`,
	};
}

export function viteReactLandingPage(): Record<string, string> {
	return {
		'src/App.tsx': `export default function App() {
	return (
		<div
			style={{ background: '#09090b', color: '#a1a1aa', fontFamily: 'system-ui, -apple-system, sans-serif', minHeight: '100vh', display: 'flex', justifyContent: 'center' }}
			dangerouslySetInnerHTML={{
				__html: \`${buildReactInnerHtml('Vite + React', [
					{
						title: 'AI Gateway',
						text: 'Run <code>agentuity dev</code> to start with AI Gateway routing.',
					},
					{
						title: 'Server',
						text: 'Edit <code>server.ts</code> to customize the AI endpoint.',
					},
					{
						title: 'Deploy',
						text: 'Run <code>agentuity deploy</code> to ship to production.',
					},
				])}\`
			}}
		/>
	);
}
`,
		'src/index.css': `body { margin: 0; }
`,
	};
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build inner HTML for React's dangerouslySetInnerHTML (no <html>/<body> wrapper) */
function buildReactInnerHtml(
	frameworkLabel: string,
	steps: { title: string; text: string }[]
): string {
	const stepsHtml = steps
		.map(
			(s) => `
			<div class="step">
				<div class="check">${CHECK_SVG}</div>
				<div><h4>${s.title}</h4><p>${s.text}</p></div>
			</div>`
		)
		.join('');

	return `${SHARED_STYLES}
	<div class="wrap">
		<div class="header">
			${AGENTUITY_LOGO_SVG}
			<h1>Welcome to Agentuity</h1>
			<p><em>${frameworkLabel}</em> + AI Gateway</p>
		</div>
		<div class="card">
			<h3>Getting started</h3>
			${stepsHtml}
		</div>
	</div>
	<a class="badge" href="https://agentuity.dev/" target="_blank" rel="noopener noreferrer">${BADGE_SVG} Powered by Agentuity</a>`;
}
