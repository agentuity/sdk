import { describe, test, expect } from 'bun:test';
import { generatePatches } from '../../src/cmd/build/patch';

/**
 * Integration test for LLM provider patching during build.
 *
 * This test verifies that AI SDK packages are correctly patched during Bun.build
 * to inject Agentuity AI Gateway routing and API key handling.
 *
 * This prevents regression of issue #235 where patches were not applied
 * after switching from Vite to Bun for server bundling.
 */
describe('LLM Provider Patching', () => {
	test('should generate 13 patches for LLM providers', () => {
		const patches = generatePatches();

		// Verify we have all expected patches
		// 3 from llm.ts (openai, groq-sdk, @anthropic-ai/sdk)
		// 10 from aisdk.ts (@vercel/ai + 9 @ai-sdk/* providers)
		expect(patches.size).toBe(13);

		// Verify key patches exist
		expect(patches.has('openai')).toBe(true);
		expect(patches.has('groq-sdk')).toBe(true);
		expect(patches.has('@anthropic-ai/sdk')).toBe(true);
		expect(patches.has('@vercel/ai')).toBe(true);
		expect(patches.has('@ai-sdk/openai')).toBe(true);
		expect(patches.has('@ai-sdk/anthropic')).toBe(true);
		expect(patches.has('@ai-sdk/google')).toBe(true);
	});

	test('should inject AGENTUITY_SDK_KEY guard in native SDK patches', async () => {
		const patches = generatePatches();
		const openaiPatch = patches.get('openai');

		expect(openaiPatch).toBeDefined();
		expect(openaiPatch?.module).toBe('openai');
		expect(openaiPatch?.filename).toBe('index');

		// Verify the patch has body.before (env guard injection)
		expect(openaiPatch?.body?.before).toBeDefined();
		expect(openaiPatch?.body?.before).toContain('AGENTUITY_SDK_KEY');
		expect(openaiPatch?.body?.before).toContain('OPENAI_API_KEY');
		expect(openaiPatch?.body?.before).toContain('OPENAI_BASE_URL');
	});

	test('should wrap AI SDK functions with telemetry enablement', () => {
		const patches = generatePatches();
		const vercelAIPatch = patches.get('@vercel/ai');

		expect(vercelAIPatch).toBeDefined();
		expect(vercelAIPatch?.module).toBe('ai');

		// Verify the patch wraps key functions
		expect(vercelAIPatch?.functions).toBeDefined();
		expect(vercelAIPatch?.functions?.generateText).toBeDefined();
		expect(vercelAIPatch?.functions?.streamText).toBeDefined();
		expect(vercelAIPatch?.functions?.generateObject).toBeDefined();
		expect(vercelAIPatch?.functions?.streamObject).toBeDefined();

		// Verify telemetry is enabled in the patch
		const generateTextPatch = vercelAIPatch?.functions?.generateText;
		expect(generateTextPatch?.before).toContain('experimental_telemetry');
		expect(generateTextPatch?.before).toContain('isEnabled: true');
	});

	test('should wrap AI SDK provider creation functions', () => {
		const patches = generatePatches();
		const openaiProviderPatch = patches.get('@ai-sdk/openai');

		expect(openaiProviderPatch).toBeDefined();
		expect(openaiProviderPatch?.module).toBe('@ai-sdk/openai');

		// Verify the patch wraps createOpenAI
		expect(openaiProviderPatch?.functions).toBeDefined();
		expect(openaiProviderPatch?.functions?.createOpenAI).toBeDefined();

		// Verify AI Gateway integration
		const createOpenAIPatch = openaiProviderPatch?.functions?.createOpenAI;
		expect(createOpenAIPatch?.before).toContain('AGENTUITY_SDK_KEY');
		expect(createOpenAIPatch?.before).toContain('OPENAI_API_KEY');
	});

	test('should generate env guard code for native SDK patches', () => {
		const patches = generatePatches();
		const openaiPatch = patches.get('openai');

		expect(openaiPatch).toBeDefined();
		expect(openaiPatch?.body?.before).toBeDefined();

		// Verify the env guard code is generated correctly
		const envGuard = openaiPatch?.body?.before || '';
		expect(envGuard).toContain('if (!process.env.OPENAI_API_KEY)');
		expect(envGuard).toContain('process.env.AGENTUITY_SDK_KEY');
		expect(envGuard).toContain('process.env.OPENAI_BASE_URL');
	});
});
