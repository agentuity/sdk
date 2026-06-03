import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectFramework, detectFrameworkWithPackageJson } from '../../../../src/cmd/build/detect';

function createTestDir(): string {
	const dir = join(tmpdir(), `detect-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(dir, { recursive: true });
	return dir;
}

function writePackageJson(dir: string, content: Record<string, unknown>) {
	writeFileSync(join(dir, 'package.json'), JSON.stringify(content, null, 2));
}

describe('Framework Detection', () => {
	let testDir: string;

	beforeEach(() => {
		testDir = createTestDir();
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	// ── No project ──

	test('returns null when no package.json or index.html exists', async () => {
		const result = await detectFramework(testDir);
		expect(result).toBeNull();
	});

	test('detects bare index.html project without package.json', async () => {
		writeFileSync(join(testDir, 'index.html'), '<h1>Hello</h1>');

		const result = await detectFramework(testDir);
		expect(result).not.toBeNull();
		expect(result!.name).toBe('static-html');
		expect(result!.runtime).toBe('node');
		expect(result!.packageManager).toBe('npm');
		expect(result!.buildCommand).toBe('__agentuity_internal__');
		expect(result!.buildOutput).toBe('.');
		expect(result!.staticDir).toBe('.');
		expect(result!.startCommand).toBe('npx serve');
	});

	test('returns null when package.json has no scripts or main', async () => {
		writePackageJson(testDir, { name: 'empty-project', version: '1.0.0' });
		const result = await detectFramework(testDir);
		expect(result).toBeNull();
	});

	// ── Custom launcher (user-supplied launch.json) ──

	describe('Custom launcher', () => {
		test('detects custom launcher when no framework matches but launch.json exists', async () => {
			writePackageJson(testDir, { name: 'custom-app', version: '1.0.0' });
			writeFileSync(
				join(testDir, 'launch.json'),
				JSON.stringify({
					processes: [{ type: 'web', command: 'node dist/server.js', default: true }],
					runtime: { name: 'node', port: 4000 },
				})
			);

			const result = await detectFramework(testDir);
			expect(result).not.toBeNull();
			expect(result!.name).toBe('custom');
			expect(result!.buildCommand).toBe('__agentuity_internal__');
			expect(result!.startCommand).toBe('node dist/server.js');
			expect(result!.runtime).toBe('node');
			expect(result!.port).toBe(4000);
		});

		test('detects custom launcher without package.json', async () => {
			writeFileSync(
				join(testDir, 'launch.json'),
				JSON.stringify({
					processes: [{ type: 'web', command: 'bun run server.ts', default: true }],
				})
			);

			const result = await detectFramework(testDir);
			expect(result).not.toBeNull();
			expect(result!.name).toBe('custom');
			expect(result!.runtime).toBe('bun');
			expect(result!.startCommand).toBe('bun run server.ts');
		});

		test('prefers detected framework over custom launcher', async () => {
			writePackageJson(testDir, {
				name: 'my-next-app',
				dependencies: { next: '15.0.0' },
				scripts: { build: 'next build', start: 'next start' },
			});
			writeFileSync(
				join(testDir, 'launch.json'),
				JSON.stringify({ processes: [{ type: 'web', command: 'bun run x', default: true }] })
			);

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('nextjs');
		});
	});

	// ── Next.js ──

	describe('Next.js', () => {
		test('detects next dependency', async () => {
			writePackageJson(testDir, {
				name: 'my-next-app',
				dependencies: { next: '^15.3.0', react: '^19.0.0' },
				scripts: { build: 'next build', start: 'next start' },
			});

			const result = await detectFramework(testDir);
			expect(result).not.toBeNull();
			expect(result!.name).toBe('nextjs');
			expect(result!.runtime).toBe('node');
		});

		test('uses package.json build script if available', async () => {
			writePackageJson(testDir, {
				name: 'my-next-app',
				dependencies: { next: '^15.0.0' },
				scripts: { build: 'next build && do-something-else' },
			});

			const result = await detectFramework(testDir);
			expect(result!.buildCommand).toBe('next build && do-something-else');
		});

		test('ignores `agentuity build` script (v2 leftover) and falls back to framework default', async () => {
			writePackageJson(testDir, {
				name: 'my-next-app',
				dependencies: { next: '^15.0.0' },
				scripts: { build: 'agentuity build' },
			});

			const result = await detectFramework(testDir);
			expect(result!.buildCommand).toBe('next build');
		});
	});

	// ── Nuxt ──

	describe('Nuxt', () => {
		test('detects nuxt dependency', async () => {
			writePackageJson(testDir, {
				name: 'my-nuxt-app',
				dependencies: { nuxt: '^3.10.0' },
				scripts: { build: 'nuxt build' },
			});

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('nuxt');
			expect(result!.runtime).toBe('node');
		});

		test('detects nuxt3 dependency', async () => {
			writePackageJson(testDir, {
				name: 'my-nuxt-app',
				dependencies: { nuxt3: '^3.0.0' },
				scripts: { build: 'nuxt build' },
			});

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('nuxt');
		});
	});

	// ── SvelteKit ──

	describe('SvelteKit', () => {
		test('detects @sveltejs/kit in package.json', async () => {
			writePackageJson(testDir, {
				name: 'my-svelte-app',
				devDependencies: { '@sveltejs/kit': '^2.0.0', svelte: '^5.0.0' },
				scripts: { build: 'vite build' },
			});

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('sveltekit');
		});
	});

	// ── Astro ──

	describe('Astro', () => {
		test('detects astro dependency', async () => {
			writePackageJson(testDir, {
				name: 'my-astro-app',
				dependencies: { astro: '^4.0.0' },
				scripts: { build: 'astro build' },
			});

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('astro');
		});
	});

	// ── Remix ──

	describe('Remix', () => {
		test('detects @remix-run/dev dependency', async () => {
			writePackageJson(testDir, {
				name: 'my-remix-app',
				devDependencies: { '@remix-run/dev': '^2.0.0' },
				dependencies: { '@remix-run/node': '^2.0.0', '@remix-run/react': '^2.0.0' },
				scripts: { build: 'remix build' },
			});

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('remix');
		});

		test('detects remix.config.js', async () => {
			writePackageJson(testDir, {
				name: 'my-remix-app',
				dependencies: { '@remix-run/react': '^2.0.0' },
				scripts: { build: 'remix build' },
			});
			writeFileSync(join(testDir, 'remix.config.js'), 'module.exports = {};');

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('remix');
		});
	});

	// ── Vite ──

	describe('Vite', () => {
		test('detects vite dependency', async () => {
			writePackageJson(testDir, {
				name: 'my-vite-app',
				devDependencies: { vite: '^5.0.0' },
				scripts: { build: 'vite build' },
			});

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('vite');
		});

		test('has lower priority than specific frameworks', async () => {
			// SvelteKit also uses vite but should be detected as SvelteKit
			writePackageJson(testDir, {
				name: 'my-svelte-app',
				devDependencies: { '@sveltejs/kit': '^2.0.0', vite: '^5.0.0' },
				scripts: { build: 'vite build' },
			});

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('sveltekit'); // NOT 'vite'
		});
	});

	// ── React Router ──

	describe('React Router', () => {
		test('detects react-router.config.ts', async () => {
			writePackageJson(testDir, {
				name: 'my-rr-app',
				dependencies: { 'react-router': '^7.0.0' },
				scripts: { build: 'react-router build' },
			});
			writeFileSync(join(testDir, 'react-router.config.ts'), 'export default {};');

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('react-router');
		});
	});

	// ── SolidStart ──

	describe('SolidStart', () => {
		test('detects solid-js + @solidjs/start', async () => {
			writePackageJson(testDir, {
				name: 'my-solid-app',
				dependencies: { 'solid-js': '^1.8.0', '@solidjs/start': '^1.0.0' },
				scripts: { build: 'vinxi build' },
			});

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('solidstart');
		});

		test('does not detect with solid-js alone', async () => {
			writePackageJson(testDir, {
				name: 'my-solid-app',
				dependencies: { 'solid-js': '^1.8.0' },
				scripts: { build: 'vite build' },
			});

			const result = await detectFramework(testDir);
			expect(result?.name).not.toBe('solidstart');
		});
	});

	// ── TanStack Start ──

	describe('TanStack Start', () => {
		test('detects @tanstack/react-start', async () => {
			// TanStack Start removed Nitro from its default setup; we now
			// match on the @tanstack/react-start package alone. Users add
			// `nitro()` to vite.config.ts for Node hosting per their
			// hosting docs, and we honor whatever `start` script they wrote.
			writePackageJson(testDir, {
				name: 'my-tanstack-app',
				dependencies: {
					'@tanstack/react-start': '^1.0.0',
					'@tanstack/router-plugin': '^1.0.0',
				},
				scripts: {
					build: 'vite build',
					start: 'node .output/server/index.mjs',
				},
			});

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('tanstack-start');
			expect(result!.startCommand).toBe('node .output/server/index.mjs');
			expect(result!.buildOutput).toBe('.output');
		});

		test('defaults to the Nitro server entry when no start script exists', async () => {
			// The hosting docs don't add a `start` script. Without a
			// framework default, detection yields no start command and the
			// generic adapter injects a static-file server, which 404s every
			// route for an SSR build (no root index.html).
			writePackageJson(testDir, {
				name: 'my-tanstack-app',
				dependencies: {
					'@tanstack/react-start': '^1.0.0',
					'@tanstack/router-plugin': '^1.0.0',
				},
				scripts: {
					build: 'vite build',
				},
			});

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('tanstack-start');
			expect(result!.startCommand).toBe('HOST=0.0.0.0 node .output/server/index.mjs');
			expect(result!.buildOutput).toBe('.output');
		});

		test('warns when nitro is missing (client-only SPA build)', async () => {
			writePackageJson(testDir, {
				name: 'my-tanstack-app',
				dependencies: { '@tanstack/react-start': '^1.0.0' },
				scripts: { build: 'vite build' },
			});

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('tanstack-start');
			expect(result!.warnings?.some((w) => w.includes('Nitro'))).toBe(true);
		});

		test('does not warn when nitro is configured', async () => {
			writePackageJson(testDir, {
				name: 'my-tanstack-app',
				dependencies: { '@tanstack/react-start': '^1.0.0', nitro: 'npm:nitro-nightly@latest' },
				scripts: { build: 'vite build' },
			});

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('tanstack-start');
			expect(result!.warnings).toBeUndefined();
		});
	});

	// ── Agentuity v2 runtime ──

	describe('Agentuity v2 runtime', () => {
		test('detects a v2 app by @agentuity/runtime and builds via the v2 CLI', async () => {
			writePackageJson(testDir, {
				name: 'v2-app',
				scripts: { build: 'agentuity build', start: 'bun .agentuity/app.js' },
				dependencies: { '@agentuity/runtime': '^2.0.0' },
			});

			const result = await detectFramework(testDir);
			expect(result).not.toBeNull();
			expect(result!.name).toBe('agentuity-v2');
			expect(result!.runtime).toBe('bun');
			expect(result!.packageManager).toBe('bun');
			expect(result!.buildOutput).toBe('.agentuity');
			expect(result!.staticDir).toBe(join('.agentuity', 'client'));
			expect(result!.startCommand).toBe(`bun ${join('.agentuity', 'app.js')}`);
			// No local CLI installed in the test dir → falls back to bare command
			// and surfaces a hint.
			expect(result!.buildCommand).toBe('agentuity build');
			expect(result!.warnings?.[0]).toContain('@agentuity/cli is not installed locally');
		});

		test('takes precedence over generic/vite detection', async () => {
			writePackageJson(testDir, {
				name: 'v2-vite-app',
				scripts: { build: 'vite build' },
				dependencies: { '@agentuity/runtime': '~2.1.0' },
				devDependencies: { vite: '^7.0.0' },
			});
			writeFileSync(join(testDir, 'vite.config.ts'), 'export default {}');

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('agentuity-v2');
		});

		test('does not claim a floating runtime spec (e.g. "latest")', async () => {
			writePackageJson(testDir, {
				name: 'ambiguous',
				scripts: { build: 'vite build' },
				dependencies: { '@agentuity/runtime': 'latest' },
				devDependencies: { vite: '^7.0.0' },
			});
			writeFileSync(join(testDir, 'vite.config.ts'), 'export default {}');

			const result = await detectFramework(testDir);
			expect(result!.name).not.toBe('agentuity-v2');
		});

		test('does not claim a v3 app (no @agentuity/runtime)', async () => {
			writePackageJson(testDir, {
				name: 'v3-app',
				scripts: { build: 'vite build' },
				devDependencies: { vite: '^7.0.0' },
			});
			writeFileSync(join(testDir, 'vite.config.ts'), 'export default {}');

			const result = await detectFramework(testDir);
			expect(result!.name).not.toBe('agentuity-v2');
		});
	});

	// ── Generic ──

	describe('Generic fallback', () => {
		test('detects project with build + start scripts', async () => {
			writePackageJson(testDir, {
				name: 'my-express-app',
				scripts: { build: 'tsc', start: 'node dist/index.js' },
				dependencies: { express: '^4.0.0' },
			});

			// Express has a detector in the database, but it requires matchContent in files.
			// Without the actual source files, it falls through to generic.
			const result = await detectFramework(testDir);
			expect(result).not.toBeNull();
			expect(result!.confidence).toBe('low');
			expect(result!.buildCommand).toBe('build');
		});

		test('returns null when the only build script just invokes agentuity', async () => {
			writePackageJson(testDir, {
				name: 'orphan-v2-project',
				scripts: { build: 'agentuity build', start: 'agentuity start' },
			});

			const result = await detectFramework(testDir);
			expect(result).toBeNull();
		});

		test('detects static project with build but no start', async () => {
			writePackageJson(testDir, {
				name: 'my-static-site',
				scripts: { build: 'eleventy' },
			});

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('generic');
		});

		test('detects project with main field', async () => {
			writePackageJson(testDir, {
				name: 'my-app',
				main: 'index.js',
				scripts: { build: 'tsc' },
			});
			writeFileSync(join(testDir, 'index.js'), 'console.log("hello")');

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('generic');
		});

		test('uses bun runtime when engines.bun is set', async () => {
			writePackageJson(testDir, {
				name: 'my-bun-app',
				scripts: { build: 'tsc', start: 'bun run index.ts' },
				engines: { bun: '>=1.0.0' },
			});

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('generic');
			expect(result!.runtime).toBe('bun');
		});
	});

	// ── detectFrameworkWithPackageJson ──

	describe('detectFrameworkWithPackageJson', () => {
		test('returns both framework and packageJson', async () => {
			writePackageJson(testDir, {
				name: 'my-next-app',
				version: '1.0.0',
				dependencies: { next: '^15.0.0' },
				scripts: { build: 'next build' },
			});

			const { framework, packageJson } = await detectFrameworkWithPackageJson(testDir);
			expect(framework).not.toBeNull();
			expect(framework!.name).toBe('nextjs');
			expect(packageJson).not.toBeNull();
			expect(packageJson!.name).toBe('my-next-app');
			expect(packageJson!.version).toBe('1.0.0');
		});

		test('returns packageJson even when no framework detected', async () => {
			writePackageJson(testDir, { name: 'empty', version: '0.0.1' });

			const { framework, packageJson } = await detectFrameworkWithPackageJson(testDir);
			expect(framework).toBeNull();
			expect(packageJson).not.toBeNull();
			expect(packageJson!.name).toBe('empty');
		});

		test('returns null packageJson when file missing', async () => {
			const { framework, packageJson } = await detectFrameworkWithPackageJson(testDir);
			expect(framework).toBeNull();
			expect(packageJson).toBeNull();
		});

		test('returns static-html framework and null packageJson for bare index.html', async () => {
			writeFileSync(join(testDir, 'index.html'), '<h1>Hello</h1>');

			const { framework, packageJson } = await detectFrameworkWithPackageJson(testDir);
			expect(framework).not.toBeNull();
			expect(framework!.name).toBe('static-html');
			expect(framework!.startCommand).toBe('npx serve');
			expect(packageJson).toBeNull();
		});
	});

	// ── Priority ordering ──

	describe('Priority ordering', () => {
		test('Next.js > Vite when both match', async () => {
			writePackageJson(testDir, {
				name: 'next-vite',
				dependencies: { next: '^15.0.0' },
				devDependencies: { vite: '^5.0.0' },
				scripts: { build: 'next build' },
			});

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('nextjs');
		});

		test('SvelteKit > Vite when both match', async () => {
			writePackageJson(testDir, {
				name: 'svelte-app',
				devDependencies: { '@sveltejs/kit': '^2.0.0', vite: '^5.0.0' },
				scripts: { build: 'vite build' },
			});

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('sveltekit');
		});

		test('Remix > Vite when both match', async () => {
			writePackageJson(testDir, {
				name: 'remix-app',
				devDependencies: { '@remix-run/dev': '^2.0.0', vite: '^5.0.0' },
				scripts: { build: 'remix vite:build' },
			});

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('remix');
		});
	});
});
