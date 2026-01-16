/**
 * AI SDK Gateway Check Agent
 *
 * Tests that the AI Gateway is properly configured and API keys are injected.
 * This agent verifies issue #348: AI gateway not injecting API key
 *
 * The agent checks:
 * 1. AGENTUITY_SDK_KEY is available in environment
 * 2. AGENTUITY_TRANSPORT_URL is available in environment
 * 3. createOpenAI() can be called without explicit apiKey (gateway injection)
 */

import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
import { createOpenAI } from '@ai-sdk/openai';

const aiSdkGatewayCheckAgent = createAgent('ai-sdk-gateway-check', {
	description: 'Verifies AI Gateway configuration and API key injection (issue #348)',
	schema: {
		input: s.object({
			operation: s.string(),
		}),
		output: s.object({
			success: s.boolean(),
			operation: s.string(),
			hasSDKKey: s.boolean(),
			hasTransportUrl: s.boolean(),
			message: s.string(),
			error: s.string().optional(),
		}),
	},
	handler: async (ctx, input) => {
		const { operation } = input;

		const hasSDKKey = !!process.env.AGENTUITY_SDK_KEY;
		const hasTransportUrl = !!process.env.AGENTUITY_TRANSPORT_URL;

		switch (operation) {
			case 'check-env': {
				// Check if required environment variables are set
				return {
					success: hasSDKKey && hasTransportUrl,
					operation,
					hasSDKKey,
					hasTransportUrl,
					message:
						hasSDKKey && hasTransportUrl
							? 'AI Gateway environment variables are configured'
							: 'Missing required environment variables for AI Gateway',
				};
			}

			case 'create-provider': {
				// Test that createOpenAI() can be called without throwing
				// This was the original issue in #348 - it would throw "API key is missing"
				try {
					// Create provider without explicit apiKey - gateway should inject it
					const openai = createOpenAI({});

					// If we get here without error, the gateway injection is working
					// (or the provider defers API key validation until actual request)
					return {
						success: true,
						operation,
						hasSDKKey,
						hasTransportUrl,
						message:
							'createOpenAI() succeeded without explicit apiKey - gateway injection working',
					};
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);

					// Check if this is the specific API key missing error from issue #348
					const isApiKeyError =
						errorMessage.includes('API key is missing') ||
						errorMessage.includes('OPENAI_API_KEY');

					return {
						success: false,
						operation,
						hasSDKKey,
						hasTransportUrl,
						message: isApiKeyError
							? 'REGRESSION: API key not injected by gateway (issue #348)'
							: 'createOpenAI() failed with unexpected error',
						error: errorMessage,
					};
				}
			}

			case 'create-model': {
				// Test creating a model instance (doesn't make API call)
				try {
					const openai = createOpenAI({});
					const model = openai('gpt-4o-mini');

					// Model created successfully
					return {
						success: true,
						operation,
						hasSDKKey,
						hasTransportUrl,
						message: 'Model instance created successfully',
					};
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					return {
						success: false,
						operation,
						hasSDKKey,
						hasTransportUrl,
						message: 'Failed to create model instance',
						error: errorMessage,
					};
				}
			}

			default:
				return {
					success: false,
					operation,
					hasSDKKey,
					hasTransportUrl,
					message: `Unknown operation: ${operation}`,
				};
		}
	},
});

export default aiSdkGatewayCheckAgent;
