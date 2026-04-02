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

	test('returns null when no package.json exists', async () => {
		const result = await detectFramework(testDir);
		expect(result).toBeNull();
	});

	test('returns null when package.json has no scripts or main', async () => {
		writePackageJson(testDir, { name: 'empty-project', version: '1.0.0' });
		const result = await detectFramework(testDir);
		expect(result).toBeNull();
	});

	// ── Agentuity native ──

	describe('Agentuity native', () => {
		test('detects app.ts + @agentuity/runtime', async () => {
			writePackageJson(testDir, {
				name: 'my-agent',
				dependencies: { '@agentuity/runtime': '^2.0.0' },
				scripts: { build: 'agentuity build' },
			});
			writeFileSync(join(testDir, 'app.ts'), 'export default {};');

			const result = await detectFramework(testDir);
			expect(result).not.toBeNull();
			expect(result!.name).toBe('agentuity');
			expect(result!.runtime).toBe('bun');
			expect(result!.mode).toBe('server');
			expect(result!.confidence).toBe('high');
		});

		test('does not detect without app.ts', async () => {
			writePackageJson(testDir, {
				name: 'my-agent',
				dependencies: { '@agentuity/runtime': '^2.0.0' },
				scripts: { build: 'agentuity build' },
			});

			const result = await detectFramework(testDir);
			// Should fall through to another detector (generic)
			expect(result?.name).not.toBe('agentuity');
		});

		test('does not detect without @agentuity/runtime dep', async () => {
			writePackageJson(testDir, {
				name: 'my-agent',
				dependencies: { hono: '^4.0.0' },
				scripts: { build: 'tsc' },
			});
			writeFileSync(join(testDir, 'app.ts'), 'export default {};');

			const result = await detectFramework(testDir);
			expect(result?.name).not.toBe('agentuity');
		});

		test('has highest priority over other frameworks', async () => {
			// A project with both app.ts + @agentuity/runtime AND vite.config.ts
			writePackageJson(testDir, {
				name: 'my-agent',
				dependencies: { '@agentuity/runtime': '^2.0.0', vite: '^5.0.0' },
				scripts: { build: 'agentuity build' },
			});
			writeFileSync(join(testDir, 'app.ts'), 'export default {};');
			writeFileSync(join(testDir, 'vite.config.ts'), 'export default {};');

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('agentuity');
		});
	});

	// ── Next.js ──

	describe('Next.js', () => {
		test('detects next.config.js', async () => {
			writePackageJson(testDir, {
				name: 'my-next-app',
				dependencies: { next: '^15.3.0', react: '^19.0.0' },
				scripts: { build: 'next build', start: 'next start' },
			});
			writeFileSync(join(testDir, 'next.config.js'), 'module.exports = {};');

			const result = await detectFramework(testDir);
			expect(result).not.toBeNull();
			expect(result!.name).toBe('nextjs');
			expect(result!.runtime).toBe('node');
			expect(result!.mode).toBe('server');
			expect(result!.confidence).toBe('high');
		});

		test('detects next.config.mjs', async () => {
			writePackageJson(testDir, {
				name: 'my-next-app',
				dependencies: { next: '^15.0.0' },
				scripts: { build: 'next build' },
			});
			writeFileSync(join(testDir, 'next.config.mjs'), 'export default {};');

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('nextjs');
			expect(result!.confidence).toBe('high');
		});

		test('detects next.config.ts', async () => {
			writePackageJson(testDir, {
				name: 'my-next-app',
				dependencies: { next: '^15.0.0' },
				scripts: { build: 'next build' },
			});
			writeFileSync(join(testDir, 'next.config.ts'), 'export default {};');

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('nextjs');
		});

		test('detects via dependency only (no config file)', async () => {
			writePackageJson(testDir, {
				name: 'my-next-app',
				dependencies: { next: '^15.0.0', react: '^19.0.0' },
				scripts: { build: 'next build' },
			});

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('nextjs');
			expect(result!.confidence).toBe('medium');
		});

		test('uses package.json build script if available', async () => {
			writePackageJson(testDir, {
				name: 'my-next-app',
				dependencies: { next: '^15.0.0' },
				scripts: { build: 'next build && do-something-else' },
			});
			writeFileSync(join(testDir, 'next.config.js'), '{}');

			const result = await detectFramework(testDir);
			expect(result!.buildCommand).toBe('next build && do-something-else');
		});

		test('extracts version from dependency', async () => {
			writePackageJson(testDir, {
				name: 'my-next-app',
				dependencies: { next: '^15.3.0' },
				scripts: { build: 'next build' },
			});
			writeFileSync(join(testDir, 'next.config.js'), '{}');

			const result = await detectFramework(testDir);
			expect(result!.version).toBe('15.3.0');
		});
	});

	// ── Nuxt ──

	describe('Nuxt', () => {
		test('detects nuxt.config.ts', async () => {
			writePackageJson(testDir, {
				name: 'my-nuxt-app',
				dependencies: { nuxt: '^3.10.0' },
				scripts: { build: 'nuxt build' },
			});
			writeFileSync(join(testDir, 'nuxt.config.ts'), 'export default defineNuxtConfig({})');

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('nuxt');
			expect(result!.runtime).toBe('node');
			expect(result!.mode).toBe('server');
			expect(result!.buildOutput).toBe('.output');
		});

		test('detects via dependency only', async () => {
			writePackageJson(testDir, {
				name: 'my-nuxt-app',
				dependencies: { nuxt: '^3.10.0' },
				scripts: { build: 'nuxt build' },
			});

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('nuxt');
			expect(result!.confidence).toBe('medium');
		});
	});

	// ── SvelteKit ──

	describe('SvelteKit', () => {
		test('detects svelte.config.js + @sveltejs/kit', async () => {
			writePackageJson(testDir, {
				name: 'my-svelte-app',
				devDependencies: { '@sveltejs/kit': '^2.0.0', svelte: '^5.0.0' },
				scripts: { build: 'vite build' },
			});
			writeFileSync(join(testDir, 'svelte.config.js'), 'export default {};');

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('sveltekit');
			expect(result!.mode).toBe('server');
			expect(result!.confidence).toBe('high');
		});

		test('detects static mode with adapter-static', async () => {
			writePackageJson(testDir, {
				name: 'my-svelte-app',
				devDependencies: {
					'@sveltejs/kit': '^2.0.0',
					'@sveltejs/adapter-static': '^3.0.0',
					svelte: '^5.0.0',
				},
				scripts: { build: 'vite build' },
			});
			writeFileSync(join(testDir, 'svelte.config.js'), 'export default {};');

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('sveltekit');
			expect(result!.mode).toBe('static');
		});
	});

	// ── Astro ──

	describe('Astro', () => {
		test('detects astro.config.mjs', async () => {
			writePackageJson(testDir, {
				name: 'my-astro-app',
				dependencies: { astro: '^4.0.0' },
				scripts: { build: 'astro build' },
			});
			writeFileSync(join(testDir, 'astro.config.mjs'), 'export default {};');

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('astro');
			expect(result!.mode).toBe('static'); // Default is static
		});

		test('detects SSR mode with @astrojs/node', async () => {
			writePackageJson(testDir, {
				name: 'my-astro-app',
				dependencies: { astro: '^4.0.0', '@astrojs/node': '^8.0.0' },
				scripts: { build: 'astro build' },
			});
			writeFileSync(join(testDir, 'astro.config.mjs'), 'export default {};');

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('astro');
			expect(result!.mode).toBe('server');
			expect(result!.startCommand).toContain('entry.mjs');
		});
	});

	// ── Remix ──

	describe('Remix', () => {
		test('detects @remix-run/node dependency', async () => {
			writePackageJson(testDir, {
				name: 'my-remix-app',
				dependencies: { '@remix-run/node': '^2.0.0', '@remix-run/react': '^2.0.0' },
				scripts: { build: 'remix build' },
			});

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('remix');
			expect(result!.mode).toBe('server');
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
			expect(result!.confidence).toBe('high');
		});
	});

	// ── Vite ──

	describe('Vite', () => {
		test('detects vite.config.ts (SPA)', async () => {
			writePackageJson(testDir, {
				name: 'my-vite-app',
				devDependencies: { vite: '^5.0.0' },
				scripts: { build: 'vite build' },
			});
			writeFileSync(join(testDir, 'vite.config.ts'), 'export default {};');

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('vite');
			expect(result!.mode).toBe('static');
			expect(result!.confidence).toBe('high');
		});

		test('detects Vite SSR with entry-server.tsx', async () => {
			writePackageJson(testDir, {
				name: 'my-vite-ssr-app',
				devDependencies: { vite: '^5.0.0' },
				scripts: { build: 'vite build' },
			});
			writeFileSync(join(testDir, 'vite.config.ts'), 'export default {};');
			mkdirSync(join(testDir, 'src'), { recursive: true });
			writeFileSync(join(testDir, 'src', 'entry-server.tsx'), 'export default {};');

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('vite');
			expect(result!.mode).toBe('server');
		});

		test('has lower priority than specific frameworks', async () => {
			// SvelteKit also uses vite.config but should be detected as SvelteKit
			writePackageJson(testDir, {
				name: 'my-svelte-app',
				devDependencies: { '@sveltejs/kit': '^2.0.0', vite: '^5.0.0' },
				scripts: { build: 'vite build' },
			});
			writeFileSync(join(testDir, 'svelte.config.js'), 'export default {};');
			writeFileSync(join(testDir, 'vite.config.ts'), 'export default {};');

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('sveltekit'); // NOT 'vite'
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

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('generic');
			expect(result!.mode).toBe('server');
			expect(result!.confidence).toBe('low');
		});

		test('detects static project with build but no start', async () => {
			writePackageJson(testDir, {
				name: 'my-static-site',
				scripts: { build: 'eleventy' },
			});

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('generic');
			expect(result!.mode).toBe('static');
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
			writeFileSync(join(testDir, 'next.config.js'), '{}');

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
	});

	// ── Priority ordering ──

	describe('Priority ordering', () => {
		test('Agentuity > Next.js when both match', async () => {
			writePackageJson(testDir, {
				name: 'dual-app',
				dependencies: { '@agentuity/runtime': '^2.0.0', next: '^15.0.0' },
				scripts: { build: 'next build' },
			});
			writeFileSync(join(testDir, 'app.ts'), 'export default {};');
			writeFileSync(join(testDir, 'next.config.js'), '{}');

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('agentuity');
		});

		test('Next.js > Vite when both match', async () => {
			writePackageJson(testDir, {
				name: 'next-vite',
				dependencies: { next: '^15.0.0' },
				devDependencies: { vite: '^5.0.0' },
				scripts: { build: 'next build' },
			});
			writeFileSync(join(testDir, 'next.config.js'), '{}');
			writeFileSync(join(testDir, 'vite.config.ts'), '{}');

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('nextjs');
		});

		test('SvelteKit > Vite when both match', async () => {
			writePackageJson(testDir, {
				name: 'svelte-app',
				devDependencies: { '@sveltejs/kit': '^2.0.0', vite: '^5.0.0' },
				scripts: { build: 'vite build' },
			});
			writeFileSync(join(testDir, 'svelte.config.js'), '{}');
			writeFileSync(join(testDir, 'vite.config.ts'), '{}');

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('sveltekit');
		});

		test('Remix > Vite when both match', async () => {
			writePackageJson(testDir, {
				name: 'remix-app',
				dependencies: { '@remix-run/node': '^2.0.0' },
				devDependencies: { vite: '^5.0.0' },
				scripts: { build: 'remix vite:build' },
			});
			writeFileSync(join(testDir, 'vite.config.ts'), '{}');

			const result = await detectFramework(testDir);
			expect(result!.name).toBe('remix');
		});
	});
});
