import { describe, test, expect } from 'bun:test';

describe('nextjs-app', () => {
	// Next.js apps can't be tested with direct fetch like Hono.
	// These verify the project structure is correct for the buildpack pipeline.

	test('next.config.ts exists and exports standalone', async () => {
		const config = await import('../next.config.ts');
		expect(config.default.output).toBe('standalone');
	});

	test('app/layout.tsx exists', async () => {
		const layout = await import('../app/layout.tsx');
		expect(layout.default).toBeDefined();
	});

	test('app/page.tsx exists', async () => {
		const page = await import('../app/page.tsx');
		expect(page.default).toBeDefined();
	});
});

describe.skip('deploy', () => {
	test('agentuity build detects Next.js and produces standalone output', async () => {
		// TODO: Run `agentuity build`, verify:
		// - launch.json has framework.name === 'nextjs'
		// - launch.json has processes[0].command containing 'node server.js'
		// - .next/standalone/ exists
	});

	test('agentuity deploy succeeds', async () => {
		// TODO: Deploy and verify the app is reachable
	});

	test('deployed app serves pages and API routes', async () => {
		// TODO: Hit /, /api/health, /api/echo
	});
});
