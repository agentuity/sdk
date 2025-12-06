import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const schemaComplexAgent = createAgent('schema-complex', {
	description: 'Test complex nested schemas',
	schema: {
		input: s.object({
			operation: s.string(),
			nested: s
				.object({
					level1: s.object({
						level2: s.object({
							value: s.string(),
						}),
					}),
				})
				.optional(),
			union: s.union(s.string(), s.number()).optional(),
			arrayOfObjects: s
				.array(
					s.object({
						id: s.string(),
						count: s.number(),
					})
				)
				.optional(),
			record: s.record(s.string(), s.any()).optional(),
		}),
		output: s.object({
			success: s.boolean(),
			operation: s.string(),
			result: s.any().optional(),
		}),
	},
	handler: async (ctx, input) => {
		const { operation, nested, union, arrayOfObjects, record } = input;

		switch (operation) {
			case 'nested-object':
				return {
					success: true,
					operation,
					result: nested?.level1.level2.value,
				};

			case 'union-string':
				return {
					success: true,
					operation,
					result: { value: union, type: typeof union },
				};

			case 'union-number':
				return {
					success: true,
					operation,
					result: { value: union, type: typeof union },
				};

			case 'array-of-objects':
				return {
					success: true,
					operation,
					result: {
						count: arrayOfObjects?.length,
						items: arrayOfObjects,
					},
				};

			case 'record-type':
				return {
					success: true,
					operation,
					result: record,
				};

			default:
				throw new Error(`Unknown operation: ${operation}`);
		}
	},
});

export default schemaComplexAgent;
