import { describe, test, expect } from 'bun:test';
import { transformPackageJsonV3 } from '../../src/transforms/v3/package-json';

function parse(source: string): Record<string, unknown> {
	return JSON.parse(source) as Record<string, unknown>;
}

describe('transformPackageJsonV3 — rewrites v2-era agentuity CLI scripts', () => {
	test('removes `build: "agentuity build"` (v3 Hono apps have no build step)', () => {
		const source = JSON.stringify(
			{
				name: 'demo',
				scripts: { build: 'agentuity build', start: 'agentuity start' },
				dependencies: { '@agentuity/runtime': '^2.0.0' },
			},
			null,
			2
		);

		const result = transformPackageJsonV3(source, [], [], { removeRuntime: true });

		expect(result.content).not.toBeNull();
		const scripts = parse(result.content!).scripts as Record<string, string>;
		expect(scripts.build).toBeUndefined();
		// start gets rewritten to the Hono entry point in the same pass
		expect(scripts.start).toBe('bun src/index.ts');
		expect(result.changes.some((c) => c.includes('Removed build script'))).toBe(true);
	});

	test('rewrites `dev: "agentuity dev"` to `bun --hot src/index.ts` when no dev-setup override', () => {
		const source = JSON.stringify(
			{
				name: 'demo',
				scripts: { dev: 'agentuity dev' },
			},
			null,
			2
		);

		const result = transformPackageJsonV3(source, [], []);

		const scripts = parse(result.content!).scripts as Record<string, string>;
		expect(scripts.dev).toBe('bun --hot src/index.ts');
		expect(result.changes.some((c) => c.includes('Replaced dev script'))).toBe(true);
	});

	test('leaves `dev` alone when dev-setup transform supplied an override', () => {
		const source = JSON.stringify(
			{
				name: 'demo',
				scripts: { dev: 'agentuity dev' },
			},
			null,
			2
		);

		const result = transformPackageJsonV3(source, [], [], {
			devScripts: {
				dev: 'bun run server:api & vite dev',
				'server:api': 'PORT=3001 bun --hot src/index.ts',
			},
		});

		const scripts = parse(result.content!).scripts as Record<string, string>;
		expect(scripts.dev).toBe('bun run server:api & vite dev');
		expect(scripts['server:api']).toBe('PORT=3001 bun --hot src/index.ts');
	});

	test('leaves non-agentuity scripts untouched', () => {
		const source = JSON.stringify(
			{
				name: 'demo',
				scripts: { build: 'vite build', dev: 'vite dev', start: 'bun src/index.ts' },
			},
			null,
			2
		);

		const result = transformPackageJsonV3(source, [], []);

		// content may be null (no changes) or the same scripts preserved
		if (result.content) {
			const scripts = parse(result.content).scripts as Record<string, string>;
			expect(scripts.build).toBe('vite build');
			expect(scripts.dev).toBe('vite dev');
			expect(scripts.start).toBe('bun src/index.ts');
		}
	});

	test('catches wrapped invocations (npx / bunx / pnpm dlx / env vars)', () => {
		for (const invocation of [
			'npx agentuity build',
			'bunx agentuity build',
			'pnpm dlx agentuity build',
			'NODE_ENV=production agentuity build',
			'cross-env NODE_ENV=production agentuity build',
			'./node_modules/.bin/agentuity build',
		]) {
			const source = JSON.stringify({ name: 'demo', scripts: { build: invocation } }, null, 2);
			const result = transformPackageJsonV3(source, [], []);
			const scripts = parse(result.content!).scripts as Record<string, string>;
			expect(scripts.build).toBeUndefined();
		}
	});
});
