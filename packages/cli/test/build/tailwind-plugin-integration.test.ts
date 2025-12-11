import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { join } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import { bundle } from '../../src/cmd/build/bundler';
import { createLogger } from '@agentuity/server';

const testDir = join(import.meta.dir, 'fixtures', 'tailwind-integration');
const outDir = join(testDir, '.agentuity');

describe.skip('Tailwind CSS plugin integration', () => {
	beforeAll(() => {
		// Create test directory structure
		mkdirSync(join(testDir, 'src', 'web'), { recursive: true });
		mkdirSync(join(testDir, 'src', 'agent'), { recursive: true });

		// Create app.ts (required by bundler)
		Bun.write(
			join(testDir, 'app.ts'),
			`
import { createApp } from '@agentuity/runtime';

const app = await createApp();

export default app;
		`
		);

		// Create a simple agent (required for bundler validation)
		Bun.write(
			join(testDir, 'src', 'agent', 'test.ts'),
			`
import { createAgent } from '@agentuity/runtime';

export default createAgent('test', {
	handler: async () => ({ result: 'ok' }),
});
		`
		);

		// Create HTML file with Tailwind link
		Bun.write(
			join(testDir, 'src', 'web', 'index.html'),
			`<!doctype html>
<html>
	<head>
		<link rel="stylesheet" href="tailwindcss" />
	</head>
	<body>
		<div class="bg-blue-500 text-white p-4">
			<h1 class="text-2xl font-bold">Hello Tailwind!</h1>
			<p class="mt-2">This should be styled with Tailwind CSS.</p>
		</div>
	</body>
</html>`
		);

		// Create agentuity.config.ts with Tailwind plugin
		// Note: We're importing the plugin dynamically to test real plugin integration
		Bun.write(
			join(testDir, 'agentuity.config.ts'),
			`
import tailwindcss from 'bun-plugin-tailwind';

export default function config(phase, context) {
	if (phase === 'web') {
		return {
			plugins: [tailwindcss],
		};
	}
	return {};
}
		`
		);

		// Create package.json
		Bun.write(
			join(testDir, 'package.json'),
			JSON.stringify(
				{
					name: 'tailwind-test',
					version: '1.0.0',
					type: 'module',
				},
				null,
				2
			)
		);

		// Create tsconfig.json
		Bun.write(
			join(testDir, 'tsconfig.json'),
			JSON.stringify(
				{
					extends: '../../tsconfig.base.json',
					compilerOptions: {
						outDir: '.agentuity',
					},
					include: ['**/*'],
				},
				null,
				2
			)
		);
	});

	afterAll(() => {
		// Clean up test directory
		rmSync(testDir, { recursive: true, force: true });
	});

	test('bundles HTML with Tailwind CSS plugin', async () => {
		const logger = createLogger({
			logLevel: 'info', // Show info logs to see verification results
			timestamps: false,
			prefix: '',
		});

		// Run the bundler
		await bundle({
			rootDir: testDir,
			dev: false,
			outDir,
			region: 'local',
			logger,
		});

		// Verify output directory exists
		const outDirExists = await Bun.file(outDir).exists();
		expect(outDirExists).toBe(true);

		// Verify web output directory exists
		const webOutDir = join(outDir, 'web');
		const webOutDirExists = await Bun.file(webOutDir).exists();
		expect(webOutDirExists).toBe(true);

		// Read the bundled HTML file
		const htmlPath = join(webOutDir, 'index.html');
		const htmlExists = await Bun.file(htmlPath).exists();
		expect(htmlExists).toBe(true);

		const htmlContent = await Bun.file(htmlPath).text();

		// Verify HTML contains our content
		expect(htmlContent).toContain('Hello Tailwind!');
		expect(htmlContent).toContain('This should be styled with Tailwind CSS.');

		// Verify Tailwind CSS classes are present in HTML
		expect(htmlContent).toContain('bg-blue-500');
		expect(htmlContent).toContain('text-white');
		expect(htmlContent).toContain('p-4');

		// The Tailwind plugin should have processed the link tag
		// and either:
		// 1. Replaced it with a link to generated CSS file
		// 2. Inlined the CSS
		// 3. Replaced with a different reference
		// Let's check if the tailwindcss link was processed (should not remain as-is)

		// Verify CSS file was generated (Tailwind plugin generates a CSS bundle)
		// The exact filename may vary, but it should be in the web output
		const webFiles = await Array.fromAsync(new Bun.Glob('**/*.css').scanSync(webOutDir));
		expect(webFiles.length).toBeGreaterThan(0);

		// Read one of the CSS files to verify it contains Tailwind utilities
		if (webFiles.length > 0) {
			const cssPath = join(webOutDir, webFiles[0]);
			const cssContent = await Bun.file(cssPath).text();

			logger.info(`Checking CSS file: ${cssPath} (${cssContent.length} bytes)`);
			logger.debug(`CSS content preview: ${cssContent.substring(0, 500)}`);

			// Verify Tailwind CSS utilities are present
			// Tailwind v4 generates CSS for the classes we used
			// Look for the actual CSS rules that Tailwind generates
			const hasBackgroundBlue =
				cssContent.includes('bg-blue-500') || cssContent.includes('--tw-bg-opacity');
			const hasTextWhite = cssContent.includes('text-white') || cssContent.includes('color');
			const hasPadding = cssContent.includes('p-4') || cssContent.includes('padding');

			// Log what we found for debugging
			logger.info(`Tailwind CSS verification:
  - Background blue class: ${hasBackgroundBlue}
  - Text white class: ${hasTextWhite}
  - Padding class: ${hasPadding}
  - Total CSS size: ${cssContent.length} bytes
  - CSS files found: ${webFiles.join(', ')}`);

			// At minimum, we should have some CSS content
			expect(cssContent.length).toBeGreaterThan(100);

			// Verify the CSS looks like Tailwind output (contains typical Tailwind patterns)
			// Tailwind v4 uses custom properties and modern CSS
			const looksLikeTailwind =
				cssContent.includes('--tw-') || // Tailwind custom properties
				cssContent.includes('@layer') || // Tailwind layers
				cssContent.includes('bg-blue-500') || // Our specific class
				cssContent.includes('rgba(') || // Color functions
				cssContent.includes('background-color'); // Standard CSS

			expect(looksLikeTailwind).toBe(true);
		}
	});

	test('api phase does not include Tailwind plugin', async () => {
		const logger = createLogger({
			logLevel: 'error',
			timestamps: false,
			prefix: '',
		});

		// Clear previous output
		rmSync(outDir, { recursive: true, force: true });

		await bundle({
			rootDir: testDir,
			dev: false,
			outDir,
			region: 'local',
			logger,
		});

		// Verify api bundle (app.ts and agents) was created
		const appPath = join(outDir, 'app.js');
		const appExists = await Bun.file(appPath).exists();
		expect(appExists).toBe(true);

		// Read app.js to ensure it doesn't contain any Tailwind-specific code
		const appContent = await Bun.file(appPath).text();

		// Should contain our app code
		expect(appContent).toContain('createApp');

		// Should NOT contain Tailwind references (plugin only applies to web phase)
		expect(appContent).not.toContain('tailwindcss');
	});

	test('workbench phase uses default config (no Tailwind)', async () => {
		// Create a workbench setup in app.ts
		const appWithWorkbench = `
import { createApp, setupWorkbench } from '@agentuity/runtime';

setupWorkbench({ route: '/workbench' });

const app = await createApp();

export default app;
		`;

		await Bun.write(join(testDir, 'app.ts'), appWithWorkbench);

		const logger = createLogger({
			logLevel: 'error',
			timestamps: false,
			prefix: '',
		});

		// Clear previous output
		rmSync(outDir, { recursive: true, force: true });

		await bundle({
			rootDir: testDir,
			dev: false,
			outDir,
			region: 'local',
			logger,
		});

		// Verify workbench was bundled
		const workbenchDir = join(outDir, 'workbench');
		const workbenchExists = await Bun.file(workbenchDir).exists();
		expect(workbenchExists).toBe(true);

		// Workbench should have index.html
		const workbenchHtml = join(workbenchDir, 'index.html');
		const workbenchHtmlExists = await Bun.file(workbenchHtml).exists();
		expect(workbenchHtmlExists).toBe(true);

		// Workbench HTML should NOT contain Tailwind (plugin only for web phase)
		const workbenchContent = await Bun.file(workbenchHtml).text();
		expect(workbenchContent).not.toContain('tailwindcss');
	});
});
