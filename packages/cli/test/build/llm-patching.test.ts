import { describe, test, expect } from 'bun:test';
import { generatePatches } from '../../src/cmd/build/patch';

/**
 * Integration test for LLM provider patching during build.
 *
 * This test verifies that AI SDK packages are correctly patched during Bun.build
 * to inject Agentuity AI Gateway routing and API key handling.
 *
 * This prevents regression of:
 * - Issue #235: patches not applied after switching from Vite to Bun for server bundling
 * - Issue #293: AI Gateway not enabled in dev mode when using createOpenAI({}) in agents
 */
describe('LLM Provider Patching', () => {
	test('should generate 16 patches for LLM providers', () => {
		const patches = generatePatches();

		// Verify we have all expected patches
		// 3 from llm.ts (openai, groq-sdk, @anthropic-ai/sdk)
		// 10 from aisdk.ts (@vercel/ai + 9 @ai-sdk/* providers)
		// 3 from otel-llm.ts (openai:otel, @anthropic-ai/sdk:otel, groq-sdk:otel)
		expect(patches.size).toBe(16);

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

	test('should include gateway URL in createOpenAI patch (issue #293)', () => {
		const patches = generatePatches();
		const openaiProviderPatch = patches.get('@ai-sdk/openai');

		expect(openaiProviderPatch).toBeDefined();
		const createOpenAIPatch = openaiProviderPatch?.functions?.createOpenAI;
		expect(createOpenAIPatch?.before).toBeDefined();

		// The patch should set baseURL to the gateway endpoint
		// This ensures that both:
		// - const openai = createOpenAI({}) - explicit provider creation in agent
		// - import { openai } from '@ai-sdk/openai' - convenience export
		// are routed through the AI Gateway
		const patchCode = createOpenAIPatch?.before || '';
		expect(patchCode).toContain('/gateway/openai');
		expect(patchCode).toContain('AGENTUITY_TRANSPORT_URL');
		expect(patchCode).toContain('opts.baseURL');
		expect(patchCode).toContain('opts.apiKey');
	});

	test('should wrap createOpenAI as a function (hoisting for convenience export)', () => {
		const patches = generatePatches();
		const openaiProviderPatch = patches.get('@ai-sdk/openai');

		expect(openaiProviderPatch).toBeDefined();

		// The patch uses 'functions' which means applyPatch will:
		// 1. Rename original: function createOpenAI -> function __agentuity_createOpenAI
		// 2. Add wrapper: function createOpenAI() { ... }
		//
		// Because function declarations are hoisted in JavaScript, the wrapper
		// will be called even for: export const openai = createOpenAI()
		// which runs at module initialization time.
		expect(openaiProviderPatch?.functions?.createOpenAI).toBeDefined();
		expect(openaiProviderPatch?.body).toBeUndefined(); // Not a body patch

		// Verify it's patching the correct function name
		const patchConfig = openaiProviderPatch?.functions?.createOpenAI;
		expect(patchConfig?.before).toBeDefined();
	});
});

/**
 * OpenTelemetry LLM instrumentation patches.
 *
 * These patches wrap LLM SDK methods with OTel spans at build time,
 * since runtime instrumentation (traceloop) doesn't work with bundled code.
 */
describe('OTel LLM Instrumentation Patches', () => {
	test('should generate OTel patches for OpenAI, Anthropic, and Groq', () => {
		const patches = generatePatches();

		expect(patches.has('openai:otel')).toBe(true);
		expect(patches.has('@anthropic-ai/sdk:otel')).toBe(true);
		expect(patches.has('groq-sdk:otel')).toBe(true);
	});

	test('OpenAI OTel patch should target chat/completions resource', () => {
		const patches = generatePatches();
		const patch = patches.get('openai:otel');

		expect(patch).toBeDefined();
		expect(patch?.module).toBe('openai');
		expect(patch?.filename).toBe('resources/chat/completions/completions');
		expect(patch?.body?.after).toBeDefined();
	});

	test('Anthropic OTel patch should target messages resource', () => {
		const patches = generatePatches();
		const patch = patches.get('@anthropic-ai/sdk:otel');

		expect(patch).toBeDefined();
		expect(patch?.module).toBe('@anthropic-ai/sdk');
		expect(patch?.filename).toBe('resources/messages');
		expect(patch?.body?.after).toBeDefined();
	});

	test('Groq OTel patch should target chat/completions resource', () => {
		const patches = generatePatches();
		const patch = patches.get('groq-sdk:otel');

		expect(patch).toBeDefined();
		expect(patch?.module).toBe('groq-sdk');
		expect(patch?.filename).toBe('resources/chat/completions');
		expect(patch?.body?.after).toBeDefined();
	});

	test('OTel patches should include GenAI semantic convention attributes', () => {
		const patches = generatePatches();
		const patch = patches.get('openai:otel');

		expect(patch?.body?.after).toBeDefined();
		const code = patch?.body?.after || '';

		// Verify GenAI semantic convention attributes
		expect(code).toContain('gen_ai.system');
		expect(code).toContain('gen_ai.request.model');
		expect(code).toContain('gen_ai.request.max_tokens');
		expect(code).toContain('gen_ai.request.temperature');
		expect(code).toContain('gen_ai.usage.input_tokens');
		expect(code).toContain('gen_ai.usage.output_tokens');
		expect(code).toContain('gen_ai.response.model');
		expect(code).toContain('gen_ai.response.id');
		expect(code).toContain('gen_ai.response.finish_reasons');
		expect(code).toContain('gen_ai.response.text');
		expect(code).toContain('gen_ai.request.messages');
	});

	test('OTel patches should import @opentelemetry/api', () => {
		const patches = generatePatches();
		const patch = patches.get('openai:otel');

		const code = patch?.body?.after || '';
		expect(code).toContain("import * as _otel_api from '@opentelemetry/api'");
	});

	test('OTel patches should include tracer initialization', () => {
		const patches = generatePatches();
		const patch = patches.get('openai:otel');

		const code = patch?.body?.after || '';
		expect(code).toContain("_otel_api.trace.getTracer('@agentuity/otel-llm', '1.0.0')");
	});

	test('OTel patches should handle streaming responses', () => {
		const patches = generatePatches();
		const patch = patches.get('openai:otel');

		const code = patch?.body?.after || '';

		// Verify stream wrapping
		expect(code).toContain('_wrapStream');
		expect(code).toContain('_wrapAsyncIterator');
		expect(code).toContain('Symbol.asyncIterator');

		// Verify streaming content capture
		expect(code).toContain('contentChunks');
		expect(code).toContain('finishReason');
	});

	test('OTel patches should safely check for class existence before patching', () => {
		const patches = generatePatches();
		const patch = patches.get('openai:otel');

		const code = patch?.body?.after || '';

		// Verify safety check for class existence
		expect(code).toContain('typeof Completions');
		expect(code).toContain('.prototype.create');
		expect(code).toContain('Skipping patch');
		expect(code).toContain('try');
		expect(code).toContain('catch');
	});

	test('OTel patches should set correct provider name for each SDK', () => {
		const patches = generatePatches();

		const openaiPatch = patches.get('openai:otel');
		const anthropicPatch = patches.get('@anthropic-ai/sdk:otel');
		const groqPatch = patches.get('groq-sdk:otel');

		expect(openaiPatch?.body?.after).toContain("'openai'");
		expect(anthropicPatch?.body?.after).toContain("'anthropic'");
		expect(groqPatch?.body?.after).toContain("'groq'");
	});

	test('OTel patches should capture request messages', () => {
		const patches = generatePatches();
		const patch = patches.get('openai:otel');

		const code = patch?.body?.after || '';

		// Verify request messages capture
		expect(code).toContain('body.messages');
		expect(code).toContain('JSON.stringify');
		expect(code).toContain('_ATTR_GEN_AI_REQUEST_MESSAGES');
	});

	test('OTel patches should handle errors and set error status', () => {
		const patches = generatePatches();
		const patch = patches.get('openai:otel');

		const code = patch?.body?.after || '';

		// Verify error handling
		expect(code).toContain('SpanStatusCode.ERROR');
		expect(code).toContain('recordException');
		expect(code).toContain('span.setStatus');
	});

	test('OTel patches should guard synchronous failures with try/catch', () => {
		const patches = generatePatches();
		const patch = patches.get('openai:otel');

		const code = patch?.body?.after || '';

		// Verify _original_create is wrapped in try/catch
		expect(code).toContain('try {');
		expect(code).toContain('result = _original_create.call(this, body, options);');
		expect(code).toContain('} catch (error) {');

		// Count try/catch blocks - should have multiple for:
		// 1. _original_create call
		// 2. _wrapStream in promise.then
		// 3. Direct _wrapStream call
		const tryCount = (code.match(/try\s*\{/g) || []).length;
		expect(tryCount).toBeGreaterThanOrEqual(3);
	});
});
