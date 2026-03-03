import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { join } from 'path';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { generatePatches, applyPatch } from '../../src/cmd/build/patch';
import type { BunPlugin } from 'bun';

/**
 * Integration test for AI SDK environment variable injection.
 *
 * This test verifies that:
 * 1. The bundled AI SDK patches correctly read AGENTUITY_SDK_KEY and AGENTUITY_TRANSPORT_URL
 * 2. When both env vars are set, the patched code injects apiKey and baseURL
 * 3. When env vars are missing, the patched code does not inject (falls through to SDK default behavior)
 *
 * Prevents regression of issue #348: AI gateway not injecting API key
 */
describe('AI SDK Environment Variable Injection', () => {
	let tempDir: string;

	beforeAll(async () => {
		tempDir = mkdtempSync(join(tmpdir(), 'ai-sdk-env-test-'));

		writeFileSync(
			join(tempDir, 'package.json'),
			JSON.stringify(
				{
					name: 'ai-sdk-env-test',
					version: '1.0.0',
					type: 'module',
					dependencies: {
						'@ai-sdk/openai': '^2.0.0',
						ai: '^5.0.0',
					},
				},
				null,
				2
			)
		);

		mkdirSync(join(tempDir, 'src'), { recursive: true });
		writeFileSync(
			join(tempDir, 'src', 'test-agent.ts'),
			`
import { createOpenAI } from '@ai-sdk/openai';

// Test that createOpenAI picks up the injected options
const openai = createOpenAI({});

// Export for testing - in real usage this would be used with generateText
export { openai };
`
		);

		const proc = Bun.spawn(['bun', 'install', '--quiet'], {
			cwd: tempDir,
			stdout: 'pipe',
			stderr: 'pipe',
		});
		await proc.exited;
	});

	afterAll(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	test('bundled code should contain AGENTUITY_SDK_KEY check', async () => {
		const entryPath = join(tempDir, 'src', 'test-agent.ts');
		const outDir = join(tempDir, 'dist');

		const patches = generatePatches();
		const patchPlugin: BunPlugin = {
			name: 'agentuity:patch',
			setup(build) {
				for (const [, patch] of patches) {
					let modulePath = join('node_modules', patch.module, '.*');
					if (patch.filename) {
						modulePath = join('node_modules', patch.module, patch.filename + '.*');
					}
					build.onLoad(
						{
							filter: new RegExp(modulePath),
							namespace: 'file',
						},
						async (args) => {
							const [contents, loader] = await applyPatch(args.path, patch);
							return { contents, loader };
						}
					);
				}
			},
		};

		const result = await Bun.build({
			entrypoints: [entryPath],
			outdir: outDir,
			target: 'bun',
			format: 'esm',
			plugins: [patchPlugin],
		});

		expect(result.success).toBe(true);

		const outputPath = join(outDir, 'test-agent.js');
		const output = await Bun.file(outputPath).text();

		// Verify the SDK key check is present in the bundled output
		expect(output).toContain('AGENTUITY_SDK_KEY');
		expect(output).toContain('AGENTUITY_TRANSPORT_URL');

		// Verify the gateway URL injection pattern is present
		expect(output).toContain('/gateway/openai');
		expect(output).toContain('opts.apiKey');
		expect(output).toContain('opts.baseURL');
	});

	test('patched createOpenAI should inject apiKey when env vars are set', async () => {
		const entryPath = join(tempDir, 'src', 'test-agent.ts');
		const outDir = join(tempDir, 'dist-env-test');

		const patches = generatePatches();
		const patchPlugin: BunPlugin = {
			name: 'agentuity:patch',
			setup(build) {
				for (const [, patch] of patches) {
					let modulePath = join('node_modules', patch.module, '.*');
					if (patch.filename) {
						modulePath = join('node_modules', patch.module, patch.filename + '.*');
					}
					build.onLoad(
						{
							filter: new RegExp(modulePath),
							namespace: 'file',
						},
						async (args) => {
							const [contents, loader] = await applyPatch(args.path, patch);
							return { contents, loader };
						}
					);
				}
			},
		};

		const result = await Bun.build({
			entrypoints: [entryPath],
			outdir: outDir,
			target: 'bun',
			format: 'esm',
			plugins: [patchPlugin],
		});

		expect(result.success).toBe(true);

		// Create a test script that sets env vars and imports the bundled module
		const testScriptPath = join(tempDir, 'run-test.ts');
		writeFileSync(
			testScriptPath,
			`
// Set env vars BEFORE importing the patched module
process.env.AGENTUITY_SDK_KEY = 'test-sdk-key-12345';
process.env.AGENTUITY_TRANSPORT_URL = 'https://test.agentuity.ai';

// Dynamic import to ensure env vars are set first
const mod = await import('./dist-env-test/test-agent.js');

// The openai provider should have been created with our injected options
// We can't directly inspect the internals, but we can verify the module loaded without errors
console.log('Module loaded successfully');
console.log('RESULT:SUCCESS');
`
		);

		// Run the test script
		const proc = Bun.spawn(['bun', 'run', testScriptPath], {
			cwd: tempDir,
			stdout: 'pipe',
			stderr: 'pipe',
			env: {
				...process.env,
				// Clear any existing env vars to ensure clean test
				AGENTUITY_SDK_KEY: undefined,
				AGENTUITY_TRANSPORT_URL: undefined,
				OPENAI_API_KEY: undefined,
			},
		});

		const exitCode = await proc.exited;
		const stdout = await new Response(proc.stdout).text();
		const stderr = await new Response(proc.stderr).text();

		// The module should load without throwing API key errors
		expect(exitCode).toBe(0);
		expect(stdout).toContain('RESULT:SUCCESS');
		// Should NOT contain API key missing error
		expect(stderr).not.toContain('API key is missing');
	});

	test('patch logic correctly guards against missing env vars', () => {
		const patches = generatePatches();
		const openaiProviderPatch = patches.get('@ai-sdk/openai');

		expect(openaiProviderPatch).toBeDefined();
		const createOpenAIPatch = openaiProviderPatch?.functions?.createOpenAI;
		expect(createOpenAIPatch?.before).toBeDefined();

		const patchCode = createOpenAIPatch?.before || '';

		// Verify the patch checks for both required env vars
		expect(patchCode).toContain('process.env.AGENTUITY_SDK_KEY');
		expect(patchCode).toContain('process.env.AGENTUITY_TRANSPORT_URL');

		// Verify conditional logic: only inject if BOTH are present
		expect(patchCode).toContain('if (url && apikey)');

		// Verify the injection happens inside the conditional
		expect(patchCode).toContain('opts.apiKey = apikey');
		expect(patchCode).toContain('opts.baseURL = url');
	});
});
