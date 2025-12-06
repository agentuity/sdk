import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
import { StructuredError } from '@agentuity/core';

const ServiceUnavailableError = StructuredError(
	'ServiceUnavailableError',
	'Service temporarily unavailable'
)<{
	service: string;
	retryAfter: number;
}>();

const errorPropagationAgent = createAgent('errors-propagation', {
	description: 'Test error propagation patterns',
	schema: {
		input: s.object({
			operation: s.string(),
			shouldFail: s.boolean().optional(),
		}),
		output: s.object({
			success: s.boolean(),
			message: s.string(),
			errorHandled: s.boolean().optional(),
		}),
	},
	handler: async (ctx, input) => {
		const { operation, shouldFail } = input;

		switch (operation) {
			case 'nested-error': {
				const innerFunction = () => {
					if (shouldFail) {
						throw new ServiceUnavailableError({
							service: 'database',
							retryAfter: 60,
						});
					}
					return 'success';
				};

				try {
					const result = innerFunction();
					return {
						success: true,
						message: result,
						errorHandled: false,
					};
				} catch (error) {
					return {
						success: false,
						message: error instanceof Error ? error.message : 'Unknown error',
						errorHandled: true,
					};
				}
			}

			case 'async-error': {
				const asyncFunction = async () => {
					await new Promise((resolve) => setTimeout(resolve, 10));
					if (shouldFail) {
						throw new Error('Async operation failed');
					}
					return 'completed';
				};

				try {
					await asyncFunction();
					return {
						success: true,
						message: 'Async operation succeeded',
						errorHandled: false,
					};
				} catch (error) {
					return {
						success: false,
						message: error instanceof Error ? error.message : 'Unknown error',
						errorHandled: true,
					};
				}
			}

			case 'chain-errors': {
				const step1 = () => {
					if (shouldFail) {
						throw new Error('Step 1 failed');
					}
				};

				const step2 = () => {
					if (shouldFail) {
						throw new Error('Step 2 failed');
					}
				};

				try {
					step1();
					step2();
					return {
						success: true,
						message: 'All steps completed',
						errorHandled: false,
					};
				} catch (error) {
					return {
						success: false,
						message: error instanceof Error ? error.message : 'Unknown error',
						errorHandled: true,
					};
				}
			}

			default:
				throw new Error(`Unknown operation: ${operation}`);
		}
	},
});

export default errorPropagationAgent;
