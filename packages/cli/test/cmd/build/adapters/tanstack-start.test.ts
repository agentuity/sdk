import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	findTanStackServerEntry,
	GENERATED_TANSTACK_SERVER_TS,
	patchViteConfigBase,
	prepareTanStackCdnBuild,
} from '../../../../src/cmd/build/adapters/tanstack-start/cdn-build.ts';

describe('TanStack Start CDN build prep', () => {
	let testDir: string;

	afterEach(() => {
		if (testDir && existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	test('patchViteConfigBase injects base when missing', () => {
		const source = `import { defineConfig } from 'vite';\nexport default defineConfig({\n\tplugins: [],\n});\n`;
		const { content, changed } = patchViteConfigBase(source);
		expect(changed).toBe(true);
		expect(content).toContain("base: ''");
	});

	test('patchViteConfigBase replaces base slash with empty string', () => {
		const source = `export default defineConfig({ base: '/', plugins: [] });`;
		const { content, changed } = patchViteConfigBase(source);
		expect(changed).toBe(true);
		expect(content).toContain("base: ''");
		expect(content).not.toContain("base: '/'");
	});

	test('patchViteConfigBase leaves custom base unchanged', () => {
		const source = `export default defineConfig({ base: '/app/', plugins: [] });`;
		const { changed } = patchViteConfigBase(source);
		expect(changed).toBe(false);
	});

	test('prepareTanStackCdnBuild generates server.ts and patches vite config', () => {
		testDir = join(import.meta.dir, `.tmp-tanstack-cdn-${Date.now()}`);
		mkdirSync(join(testDir, 'src'), { recursive: true });
		writeFileSync(
			join(testDir, 'vite.config.ts'),
			`export default defineConfig({ plugins: [] });`,
			'utf-8'
		);

		const prep = prepareTanStackCdnBuild(testDir, { debug: () => {} });
		expect(prep.logs.some((line) => line.includes('Generated src/server.ts'))).toBe(true);
		expect(prep.logs.some((line) => line.includes("Vite base: ''"))).toBe(true);

		expect(findTanStackServerEntry(testDir)).toBe('src/server.ts');
		expect(readFileSync(join(testDir, 'src/server.ts'), 'utf-8')).toBe(
			GENERATED_TANSTACK_SERVER_TS
		);
		expect(readFileSync(join(testDir, 'vite.config.ts'), 'utf-8')).toContain("base: ''");

		prep.cleanup();

		expect(existsSync(join(testDir, 'src/server.ts'))).toBe(false);
		expect(readFileSync(join(testDir, 'vite.config.ts'), 'utf-8')).not.toContain("base: ''");
	});

	test('prepareTanStackCdnBuild bakes --cdn-base-url into server entry', () => {
		testDir = join(import.meta.dir, `.tmp-tanstack-cdn-bake-${Date.now()}`);
		mkdirSync(join(testDir, 'src'), { recursive: true });
		writeFileSync(
			join(testDir, 'vite.config.ts'),
			`export default defineConfig({ plugins: [] });`,
			'utf-8'
		);

		const prep = prepareTanStackCdnBuild({
			projectDir: testDir,
			logger: { debug: () => {} },
			cdnBaseUrl: 'https://cdn.agentuity.com/org_x/assets/',
			env: {},
		});

		expect(prep.cdnOrigin).toBe('https://cdn.agentuity.com/org_x/assets');
		expect(prep.buildEnv.AGENTUITY_CDN_ORIGIN).toBe('https://cdn.agentuity.com/org_x/assets');
		expect(prep.buildEnv.AGENTUITY_CDN_BASE_URL).toBe('https://cdn.agentuity.com/org_x/assets/');
		const server = readFileSync(join(testDir, 'src/server.ts'), 'utf-8');
		expect(server).toContain("const cdnOrigin = 'https://cdn.agentuity.com/org_x/assets'");
		expect(server).toContain('transformAssets');
		expect(prep.logs.some((line) => line.includes('baked CDN origin'))).toBe(true);

		prep.cleanup();
		expect(existsSync(join(testDir, 'src/server.ts'))).toBe(false);
	});

	test('prepareTanStackCdnBuild skips server generation when transformAssets exists', () => {
		testDir = join(import.meta.dir, `.tmp-tanstack-cdn-existing-${Date.now()}`);
		mkdirSync(join(testDir, 'src'), { recursive: true });
		writeFileSync(
			join(testDir, 'src/server.ts'),
			'export default createServerEntry({ transformAssets: "https://cdn.example.com" });',
			'utf-8'
		);

		const prep = prepareTanStackCdnBuild(testDir, { debug: () => {} });
		expect(prep.logs.some((line) => line.includes('Generated'))).toBe(false);
		prep.cleanup();
	});
});
