import { describe, expect, test } from 'bun:test';

describe('svelte-web', () => {
	test('svelte.config.js uses adapter-node', async () => {
		const config = await import('../svelte.config.js');
		expect(config.default.kit.adapter).toBeDefined();
	});

	test('app.html contains SvelteKit placeholders', async () => {
		const file = Bun.file('src/app.html');
		const contents = await file.text();
		expect(contents).toContain('%sveltekit.head%');
		expect(contents).toContain('%sveltekit.body%');
	});

	test('src/routes/+page.svelte exists', async () => {
		const file = Bun.file('src/routes/+page.svelte');
		expect(await file.exists()).toBe(true);
	});

	test('src/routes/api/translate/+server.ts exists', async () => {
		const file = Bun.file('src/routes/api/translate/+server.ts');
		expect(await file.exists()).toBe(true);
	});
});

describe.skip('deploy', () => {
	test('agentuity build detects SvelteKit', async () => {
		// TODO: Verify launch.json framework.name === 'sveltekit'
	});

	test('agentuity deploy succeeds', async () => {
		// TODO: Deploy and verify
	});
});
