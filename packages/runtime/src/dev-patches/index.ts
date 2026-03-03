/**
 * Runtime dev patches — replaces build-time Bun.build patches for dev mode.
 *
 * When --experimental-no-bundle is used, the generated entry file (src/generated/app.ts)
 * is run directly by Bun without bundling. These runtime patches apply the same
 * monkey-patches that would normally be injected by the Bun.build plugin during bundling.
 *
 * Three categories of patches:
 * 1. Gateway: Set env vars to route LLM calls through Agentuity AI Gateway
 * 2. AI SDK: Wrap Vercel AI SDK functions with telemetry + gateway config
 * 3. OTel LLM: Wrap LLM SDK .create() methods with OpenTelemetry spans
 */

import { applyGatewayPatches } from './gateway.ts';
import { applyAISDKCorePatches, applyAISDKProviderPatches } from './aisdk.ts';
import { applyOtelLLMPatches } from './otel-llm.ts';

/**
 * Apply all runtime dev patches.
 *
 * Must be called:
 * - AFTER bootstrapRuntimeEnv() (so env vars like AGENTUITY_SDK_KEY are loaded)
 * - BEFORE any user code imports LLM SDKs
 */
export async function applyDevPatches(): Promise<void> {
	// 1. Set gateway env vars first (other patches may read them)
	applyGatewayPatches();

	// 2. Patch AI SDK core functions (telemetry injection)
	await applyAISDKCorePatches();

	// 3. Patch AI SDK provider factories (gateway routing)
	await applyAISDKProviderPatches();

	// 4. Patch LLM SDK prototypes with OTel spans
	await applyOtelLLMPatches();
}
