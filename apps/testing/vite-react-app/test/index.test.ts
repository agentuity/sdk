import { describe, test, expect } from 'bun:test';
import { existsSync } from 'fs';

describe('vite-react-app', () => {
	test('index.html exists', () => {
		expect(existsSync('index.html')).toBe(true);
	});

	test('vite.config.ts has react plugin', async () => {
		const config = await import('../vite.config.ts');
		expect(config.default).toBeDefined();
	});
});

describe.skip('deploy', () => {
	test('agentuity build detects Vite and injects static server', async () => {
		// TODO: Verify launch.json framework.name === 'vite'
		// TODO: Verify _serve.js is injected (static app, no start command)
	});

	test('agentuity deploy succeeds', async () => {
		// TODO: Deploy and verify
	});
});
