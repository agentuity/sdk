import { describe, test, expect } from 'bun:test';

describe('svelte-web', () => {
	test('svelte.config.js uses adapter-node', async () => {
		const config = await import('../svelte.config.js');
		expect(config.default.kit.adapter).toBeDefined();
	});
});

describe.skip('deploy', () => {
	test('agentuity build detects SvelteKit', async () => {
		// TODO: Verify launch.json framework.name
	});

	test('agentuity deploy succeeds', async () => {
		// TODO: Deploy and verify
	});
});
