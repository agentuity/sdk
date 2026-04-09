import { describe, test, expect } from 'bun:test';
import { existsSync } from 'fs';

describe('tanstack-start', () => {
	test('project has package.json with tanstack deps', async () => {
		const pkg = await import('../package.json');
		expect(pkg.dependencies['@tanstack/start']).toBeDefined();
		expect(pkg.dependencies['@tanstack/react-router']).toBeDefined();
	});

	test('src/routes/index.tsx exists', () => {
		expect(existsSync('src/routes/index.tsx')).toBe(true);
	});
});

describe.skip('deploy', () => {
	test('agentuity build detects TanStack Start', async () => {
		// TODO: Verify launch.json framework detection
	});

	test('agentuity deploy succeeds', async () => {
		// TODO: Deploy and verify
	});
});
