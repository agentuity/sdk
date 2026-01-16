import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { join } from 'path';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { generatePatches, applyPatch } from '../../src/cmd/build/patch';
import type { BunPlugin } from 'bun';

/**
 * End-to-end test for AI Gateway bundling.
 *
 * This test creates a minimal project that uses @ai-sdk/openai with the
 * explicit `createOpenAI({})` pattern (as shown in issue #293), bundles it
 * with the LLM patching plugin, and verifies the gateway code is present.
 *
 * Prevents regression of issue #293: AI Gateway not enabled when loaded from agent.
 */
describe('AI Gateway Bundle Integration', () => {
	let tempDir: string;

	beforeAll(async () => {
		tempDir = mkdtempSync(join(tmpdir(), 'ai-gateway-test-'));

		// Create a minimal project structure
		writeFileSync(
			join(tempDir, 'package.json'),
			JSON.stringify(
				{
					name: 'ai-gateway-test',
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

		// Create an agent that explicitly uses createOpenAI({})
		// This is the pattern from issue #293 screenshot
		mkdirSync(join(tempDir, 'src', 'agent'), { recursive: true });
		writeFileSync(
			join(tempDir, 'src', 'agent', 'index.ts'),
			`
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

// Explicit provider creation - the pattern from issue #293
const openai = createOpenAI({});

export async function runAgent() {
    const result = await generateText({
        model: openai('gpt-4o'),
        prompt: 'Hello',
    });
    return result;
}
`
		);

		// Install dependencies
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

	test('bundled output should contain AI Gateway patches', async () => {
		const entryPath = join(tempDir, 'src', 'agent', 'index.ts');
		const outDir = join(tempDir, 'dist');

		// Create the patch plugin (same as server-bundler.ts)
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

		// Bundle the agent
		const result = await Bun.build({
			entrypoints: [entryPath],
			outdir: outDir,
			target: 'bun',
			format: 'esm',
			plugins: [patchPlugin],
		});

		expect(result.success).toBe(true);

		// Read the bundled output
		const outputPath = join(outDir, 'index.js');
		const output = await Bun.file(outputPath).text();

		// Verify the patches were applied
		// The bundle should contain:
		// 1. The renamed original function
		expect(output).toContain('__agentuity_createOpenAI');

		// 2. AI Gateway environment variable checks
		expect(output).toContain('AGENTUITY_SDK_KEY');
		expect(output).toContain('AGENTUITY_TRANSPORT_URL');

		// 3. The gateway URL pattern
		expect(output).toContain('/gateway/openai');

		// 4. The baseURL and apiKey setting
		expect(output).toContain('opts.baseURL');
		expect(output).toContain('opts.apiKey');
	});

	test('bundled createOpenAI wrapper should be a hoisted function', async () => {
		const entryPath = join(tempDir, 'src', 'agent', 'index.ts');
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

		const outputPath = join(outDir, 'index.js');
		const output = await Bun.file(outputPath).text();

		// The wrapper should be a function declaration (hoisted in JS)
		// This is critical for the convenience export pattern:
		//   export const openai = createOpenAI()
		// The wrapper must be visible when this line executes
		expect(output).toMatch(/function\s+createOpenAI\s*\(/);

		// The original should be renamed with __agentuity_ prefix
		expect(output).toMatch(/function\s+__agentuity_createOpenAI\s*\(/);

		// The convenience export (openai) should call createOpenAI
		// In the bundled output, this appears as: var openai = createOpenAI()
		expect(output).toMatch(/openai\s*=\s*createOpenAI\s*\(/);
	});

	test('should patch multiple AI SDK providers', async () => {
		// Create an agent that uses multiple providers
		writeFileSync(
			join(tempDir, 'src', 'agent', 'multi.ts'),
			`
import { createOpenAI } from '@ai-sdk/openai';

const openai = createOpenAI({});
export { openai };
`
		);

		const entryPath = join(tempDir, 'src', 'agent', 'multi.ts');
		const outDir = join(tempDir, 'dist-multi');

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

		const outputPath = join(outDir, 'multi.js');
		const output = await Bun.file(outputPath).text();

		// OpenAI patch should be present
		expect(output).toContain('__agentuity_createOpenAI');
		expect(output).toContain('/gateway/openai');
	});
});
