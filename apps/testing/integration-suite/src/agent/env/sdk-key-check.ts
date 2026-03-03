import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

/**
 * Agent to verify AGENTUITY_SDK_KEY is loaded from .env.local
 * This reproduces the bug reported in https://github.com/agentuity/sdk/issues/222
 */
const sdkKeyCheckAgent = createAgent('env-sdk-key-check', {
	description: 'Verifies AGENTUITY_SDK_KEY is available in process.env',
	schema: {
		output: s.object({
			hasSdkKey: s.boolean(),
			sdkKeyPrefix: s.string().optional(),
			allEnvKeys: s.array(s.string()),
		}),
	},
	handler: async (ctx) => {
		const sdkKey = process.env.AGENTUITY_SDK_KEY;
		const hasSdkKey = !!sdkKey;

		// Return first 10 chars of key for verification (without exposing full key)
		const sdkKeyPrefix = sdkKey ? sdkKey.substring(0, 10) : undefined;

		// Get all AGENTUITY_* env vars for debugging
		const allEnvKeys = Object.keys(process.env)
			.filter((key) => key.startsWith('AGENTUITY_'))
			.sort();

		ctx.logger.info('SDK Key Check:', {
			hasSdkKey,
			sdkKeyPrefix,
			envKeysCount: allEnvKeys.length,
		});

		return {
			hasSdkKey,
			sdkKeyPrefix,
			allEnvKeys,
		};
	},
});

export default sdkKeyCheckAgent;
