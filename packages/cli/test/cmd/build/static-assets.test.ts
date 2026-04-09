/**
 * Static Asset CDN Upload Tests
 *
 * Tests that the detect → adapter → deploy-metadata pipeline correctly
 * enumerates static assets for CDN upload across different framework types:
 *
 * 1. Pure static sites (staticDir = outputDirectory) enumerate all assets
 * 2. SSR frameworks with separate staticDir enumerate only the static subdir
 * 3. Frameworks with staticDir outside buildOutput get assets copied in
 * 4. Generic fallback projects without staticDir produce no CDN assets
 * 5. Asset metadata (content-type, kind, gzip) is correct
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { detectFrameworkWithPackageJson } from '../../../src/cmd/build/detect';
import { getAdapter } from '../../../src/cmd/build/adapters';
import { packageBuildOutput } from '../../../src/cmd/build/package';
import { generateDeployMetadata } from '../../../src/deploy-metadata';

// ── Helpers ──

function createTestDir(): string {
	const dir = join(tmpdir(), `static-assets-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	mkdirSync(dir, { recursive: true });
	return dir;
}

function writePackageJson(dir: string, content: Record<string, unknown>) {
	writeFileSync(join(dir, 'package.json'), JSON.stringify(content, null, 2));
}

const logger = {
	trace: () => {},
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	fatal: (() => {
		throw new Error('fatal');
	}) as never,
	child: () => logger,
};

// ── Tests ──

describe('Static Asset CDN Upload', () => {
	let testDir: string;
	let outputDir: string;

	beforeEach(() => {
		testDir = createTestDir();
		outputDir = join(testDir, '.agentuity');
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	// ── Pure static site (Vite) ──

	test('Vite project: entire output dir is static, all assets enumerated for CDN', async () => {
		// Simulate a Vite project
		writePackageJson(testDir, {
			name: 'test-vite-static',
			version: '1.0.0',
			scripts: {
				build: [
					'mkdir -p dist/assets',
					'echo "<html></html>" > dist/index.html',
					'echo "body{color:red}" > dist/assets/style-abc123.css',
					'echo "console.log(1)" > dist/assets/main-abc123.js',
					'echo "PNG" > dist/assets/logo.png',
				].join(' && '),
			},
			devDependencies: {
				vite: '^6.0.0',
			},
		});

		// Detect — should pick up Vite
		const { framework, packageJson } = await detectFrameworkWithPackageJson(testDir);
		expect(framework).not.toBeNull();
		expect(framework!.name).toBe('vite');
		// For Vite, staticDir should equal buildOutput (entire output is static)
		expect(framework!.staticDir).toBe('dist');

		// Build
		const adapter = getAdapter(framework!.name);
		const buildResult = await adapter.build({
			projectDir: testDir,
			framework: framework!,
			packageJson: packageJson!,
			outputDir,
			logger,
		});

		// Build should set staticDir
		expect(buildResult.staticDir).toBeDefined();
		expect(existsSync(buildResult.staticDir!)).toBe(true);

		// Package
		const packageResult = packageBuildOutput(framework!, buildResult, buildResult.outputDir);

		// Generate deploy metadata (non-Agentuity path)
		const metadata = await generateDeployMetadata({
			buildResult,
			packageResult,
			projectDir: testDir,
			projectId: 'test-project',
			orgId: 'test-org',
			region: 'us-east-1',
			deploymentId: 'test-deployment',
			logger,
		});

		// Assets should be populated
		expect(metadata.assets.length).toBeGreaterThan(0);

		// Verify specific assets are found
		const filenames = metadata.assets.map((a) => a.filename);
		expect(filenames.some((f) => f.includes('index.html'))).toBe(true);
		expect(filenames.some((f) => f.includes('style-abc123.css'))).toBe(true);
		expect(filenames.some((f) => f.includes('main-abc123.js'))).toBe(true);
		expect(filenames.some((f) => f.includes('logo.png'))).toBe(true);

		// Verify content types
		const cssAsset = metadata.assets.find((a) => a.filename.includes('.css'));
		expect(cssAsset?.contentType).toBe('text/css');
		expect(cssAsset?.kind).toBe('stylesheet');
		expect(cssAsset?.contentEncoding).toBe('gzip'); // text/css is compressible

		const jsAsset = metadata.assets.find((a) => a.filename.endsWith('.js'));
		expect(jsAsset?.contentType).toBe('application/javascript');
		expect(jsAsset?.kind).toBe('script');

		const pngAsset = metadata.assets.find((a) => a.filename.includes('.png'));
		expect(pngAsset?.contentType).toBe('image/png');
		expect(pngAsset?.kind).toBe('image');
		expect(pngAsset?.contentEncoding).toBeUndefined(); // images are not gzipped
	}, 30_000);

	// ── SSR framework with separate static dir (simulated) ──

	test('SSR framework: staticDir subdirectory inside buildOutput', async () => {
		// Simulate a framework where buildOutput='build' and staticDir='build/client'
		writePackageJson(testDir, {
			name: 'test-ssr-static',
			version: '1.0.0',
			scripts: {
				build: [
					'mkdir -p build/client/assets',
					'mkdir -p build/server',
					'echo "console.log("server")" > build/server/index.js',
					'echo "<html></html>" > build/client/index.html',
					'echo "body{}" > build/client/assets/app.css',
					'echo "app()" > build/client/assets/app.js',
				].join(' && '),
				start: 'node build/server/index.js',
			},
		});

		// Detect — generic fallback
		const { framework, packageJson } = await detectFrameworkWithPackageJson(testDir);
		expect(framework).not.toBeNull();

		// Manually set staticDir to simulate what a framework definition would do
		// (generic detector doesn't set staticDir, but real framework defs like react-router do)
		framework!.staticDir = 'build/client';
		framework!.buildOutput = 'build';

		// Build
		const adapter = getAdapter(framework!.name);
		const buildResult = await adapter.build({
			projectDir: testDir,
			framework: framework!,
			packageJson: packageJson!,
			outputDir,
			logger,
		});

		expect(buildResult.staticDir).toBeDefined();

		// Package
		const packageResult = packageBuildOutput(framework!, buildResult, buildResult.outputDir);

		// Generate deploy metadata
		const metadata = await generateDeployMetadata({
			buildResult,
			packageResult,
			projectDir: testDir,
			projectId: 'test-project',
			orgId: 'test-org',
			region: 'us-east-1',
			deploymentId: 'test-deployment',
			logger,
		});

		// Only client assets should be enumerated (not server code)
		expect(metadata.assets.length).toBeGreaterThan(0);

		const filenames = metadata.assets.map((a) => a.filename);
		expect(filenames.some((f) => f.includes('index.html'))).toBe(true);
		expect(filenames.some((f) => f.includes('app.css'))).toBe(true);
		expect(filenames.some((f) => f.includes('app.js'))).toBe(true);

		// Server files should NOT be in the asset list
		expect(filenames.some((f) => f.includes('server'))).toBe(false);
	}, 30_000);

	// ── SSR framework with staticDir outside buildOutput ──

	test('SSR framework: staticDir outside buildOutput gets copied', async () => {
		// Simulate a Nuxt-like framework: buildOutput='dist', staticDir='.output/public'
		writePackageJson(testDir, {
			name: 'test-nuxt-static',
			version: '1.0.0',
			scripts: {
				build: [
					'mkdir -p dist',
					'echo "{}" > dist/nitro.json',
					'mkdir -p .output/public/_nuxt',
					'echo "<html></html>" > .output/public/index.html',
					'echo "body{}" > .output/public/_nuxt/entry.css',
					'echo "app()" > .output/public/_nuxt/entry.js',
				].join(' && '),
				start: 'node dist/server.js',
			},
		});

		const { framework, packageJson } = await detectFrameworkWithPackageJson(testDir);
		expect(framework).not.toBeNull();

		// Simulate Nuxt framework definition
		framework!.staticDir = '.output/public';
		framework!.buildOutput = 'dist';

		const adapter = getAdapter(framework!.name);
		const buildResult = await adapter.build({
			projectDir: testDir,
			framework: framework!,
			packageJson: packageJson!,
			outputDir,
			logger,
		});

		// Static assets should have been copied into the output dir
		expect(buildResult.staticDir).toBeDefined();
		expect(existsSync(buildResult.staticDir!)).toBe(true);

		// The copied static dir should be inside the output
		expect(buildResult.staticDir!.startsWith(resolve(outputDir))).toBe(true);

		// Package
		const packageResult = packageBuildOutput(framework!, buildResult, buildResult.outputDir);

		// Generate deploy metadata
		const metadata = await generateDeployMetadata({
			buildResult,
			packageResult,
			projectDir: testDir,
			projectId: 'test-project',
			orgId: 'test-org',
			region: 'us-east-1',
			deploymentId: 'test-deployment',
			logger,
		});

		expect(metadata.assets.length).toBeGreaterThan(0);

		const filenames = metadata.assets.map((a) => a.filename);
		expect(filenames.some((f) => f.includes('index.html'))).toBe(true);
		expect(filenames.some((f) => f.includes('entry.css'))).toBe(true);
		expect(filenames.some((f) => f.includes('entry.js'))).toBe(true);
	}, 30_000);

	// ── No staticDir → no CDN assets ──

	test('generic project without staticDir produces no CDN assets', async () => {
		writePackageJson(testDir, {
			name: 'test-no-static',
			version: '1.0.0',
			scripts: {
				build: 'mkdir -p dist && echo "console.log(42)" > dist/index.js',
				start: 'node dist/index.js',
			},
		});

		const { framework, packageJson } = await detectFrameworkWithPackageJson(testDir);
		expect(framework).not.toBeNull();
		expect(framework!.name).toBe('generic');
		// Generic detector does not set staticDir
		expect(framework!.staticDir).toBeUndefined();

		const adapter = getAdapter(framework!.name);
		const buildResult = await adapter.build({
			projectDir: testDir,
			framework: framework!,
			packageJson: packageJson!,
			outputDir,
			logger,
		});

		// No static dir in result
		expect(buildResult.staticDir).toBeUndefined();

		const packageResult = packageBuildOutput(framework!, buildResult, buildResult.outputDir);

		const metadata = await generateDeployMetadata({
			buildResult,
			packageResult,
			projectDir: testDir,
			projectId: 'test-project',
			orgId: 'test-org',
			region: 'us-east-1',
			deploymentId: 'test-deployment',
			logger,
		});

		// No assets for CDN
		expect(metadata.assets).toEqual([]);
	}, 30_000);

	// ── Asset metadata correctness ──

	test('asset metadata has correct content types and compression flags', async () => {
		writePackageJson(testDir, {
			name: 'test-asset-metadata',
			version: '1.0.0',
			scripts: {
				build: [
					'mkdir -p dist/assets',
					'echo "html" > dist/index.html',
					'echo "js" > dist/assets/app.js',
					'echo "css" > dist/assets/style.css',
					'echo "svg" > dist/assets/icon.svg',
					'echo "json" > dist/data.json',
					'echo "font" > dist/assets/font.woff2',
					'echo "img" > dist/assets/photo.jpg',
				].join(' && '),
			},
			devDependencies: {
				vite: '^6.0.0',
			},
		});

		const { framework, packageJson } = await detectFrameworkWithPackageJson(testDir);

		const adapter = getAdapter(framework!.name);
		const buildResult = await adapter.build({
			projectDir: testDir,
			framework: framework!,
			packageJson: packageJson!,
			outputDir,
			logger,
		});

		const packageResult = packageBuildOutput(framework!, buildResult, buildResult.outputDir);

		const metadata = await generateDeployMetadata({
			buildResult,
			packageResult,
			projectDir: testDir,
			projectId: 'test-project',
			orgId: 'test-org',
			region: 'us-east-1',
			deploymentId: 'test-deployment',
			logger,
		});

		const byExt = (ext: string) => metadata.assets.find((a) => a.filename.endsWith(ext));

		// HTML
		const html = byExt('.html');
		expect(html).toBeDefined();
		expect(html!.contentType).toBe('text/html');
		expect(html!.contentEncoding).toBe('gzip'); // text is compressible

		// JS
		const js = byExt('.js');
		expect(js).toBeDefined();
		expect(js!.contentType).toBe('application/javascript');
		expect(js!.contentEncoding).toBe('gzip');

		// CSS
		const css = byExt('.css');
		expect(css).toBeDefined();
		expect(css!.contentType).toBe('text/css');
		expect(css!.contentEncoding).toBe('gzip');

		// SVG (XML-based, compressible)
		const svg = byExt('.svg');
		expect(svg).toBeDefined();
		expect(svg!.contentType).toBe('image/svg+xml');
		expect(svg!.contentEncoding).toBe('gzip');

		// JSON
		const json = byExt('.json');
		expect(json).toBeDefined();
		expect(json!.contentType).toBe('application/json');
		expect(json!.contentEncoding).toBe('gzip');

		// WOFF2 (already compressed, no gzip)
		const woff2 = byExt('.woff2');
		expect(woff2).toBeDefined();
		expect(woff2!.contentEncoding).toBeUndefined();

		// JPG (binary image, no gzip)
		const jpg = byExt('.jpg');
		expect(jpg).toBeDefined();
		expect(jpg!.contentType).toBe('image/jpeg');
		expect(jpg!.contentEncoding).toBeUndefined();
	}, 30_000);

	// ── Framework detection sets staticDir correctly ──

	test('Vite framework detection sets staticDir to build output', async () => {
		writePackageJson(testDir, {
			name: 'test-vite-detection',
			version: '1.0.0',
			scripts: { build: 'vite build' },
			devDependencies: { vite: '^6.0.0' },
		});

		const { framework } = await detectFrameworkWithPackageJson(testDir);
		expect(framework).not.toBeNull();
		expect(framework!.name).toBe('vite');
		// For Vite, staticDir=null in database means entire output IS static
		// This gets resolved to outputDirectory ('dist')
		expect(framework!.staticDir).toBe('dist');
	});

	test('Next.js framework detection sets staticDir to .next/static', async () => {
		writePackageJson(testDir, {
			name: 'test-nextjs-detection',
			version: '1.0.0',
			scripts: { build: 'next build' },
			dependencies: { next: '^15.0.0', react: '^19.0.0', 'react-dom': '^19.0.0' },
		});

		const { framework } = await detectFrameworkWithPackageJson(testDir);
		expect(framework).not.toBeNull();
		expect(framework!.name).toBe('nextjs');
		expect(framework!.staticDir).toBe('.next/static');
	});

	// ── Empty static dir ──

	test('build with empty static directory produces no assets', async () => {
		writePackageJson(testDir, {
			name: 'test-empty-static',
			version: '1.0.0',
			scripts: {
				build: 'mkdir -p dist', // Empty output
			},
			devDependencies: { vite: '^6.0.0' },
		});

		const { framework, packageJson } = await detectFrameworkWithPackageJson(testDir);

		const adapter = getAdapter(framework!.name);
		const buildResult = await adapter.build({
			projectDir: testDir,
			framework: framework!,
			packageJson: packageJson!,
			outputDir,
			logger,
		});

		const packageResult = packageBuildOutput(framework!, buildResult, buildResult.outputDir);

		const metadata = await generateDeployMetadata({
			buildResult,
			packageResult,
			projectDir: testDir,
			projectId: 'test-project',
			orgId: 'test-org',
			region: 'us-east-1',
			deploymentId: 'test-deployment',
			logger,
		});

		// The output dir contains build packaging artifacts (launch.json, Procfile, etc.)
		// but no user-created static assets from the build.
		// In a real deploy these packaging files would not be in a separate static dir,
		// but for this test the entire outputDir IS the staticDir.
		// Verify no user content files are present (only build infrastructure).
		const userAssets = metadata.assets.filter(
			(a) =>
				!['launch.json', 'Procfile', '.agentuity-build', 'package.json', '_serve.js'].includes(
					a.filename
				)
		);
		expect(userAssets).toEqual([]);
	}, 30_000);
});
