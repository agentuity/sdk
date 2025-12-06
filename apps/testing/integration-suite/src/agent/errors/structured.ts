import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
import { StructuredError } from '@agentuity/core';

const CustomValidationError = StructuredError('CustomValidationError', 'Validation failed')<{
	field: string;
	reason: string;
}>();

const CustomNotFoundError = StructuredError('CustomNotFoundError', 'Resource not found')<{
	resource: string;
	id: string;
}>();

const errorStructuredAgent = createAgent('errors-structured', {
	description: 'Test StructuredError patterns',
	schema: {
		input: s.object({
			operation: s.string(),
			field: s.string().optional(),
			resource: s.string().optional(),
			id: s.string().optional(),
		}),
		output: s.object({
			success: s.boolean(),
			message: s.string().optional(),
		}),
	},
	handler: async (ctx, input) => {
		const { operation, field, resource, id } = input;

		switch (operation) {
			case 'throw-validation-error': {
				throw new CustomValidationError({ field: field || 'unknown', reason: 'Invalid value' });
			}

			case 'throw-not-found-error': {
				throw new CustomNotFoundError({
					resource: resource || 'item',
					id: id || 'unknown',
				});
			}

			case 'throw-generic-error': {
				throw new Error('Generic error message');
			}

			case 'try-catch-handling': {
				try {
					throw new CustomValidationError({ field: 'test', reason: 'Test error' });
				} catch (error) {
					ctx.logger.warn('Caught error in handler', {
						error: error instanceof Error ? error.message : String(error),
					});
					return {
						success: false,
						message: 'Error caught and handled',
					};
				}
			}

			case 'success': {
				return {
					success: true,
					message: 'No errors',
				};
			}

			default:
				throw new Error(`Unknown operation: ${operation}`);
		}
	},
});

export default errorStructuredAgent;
