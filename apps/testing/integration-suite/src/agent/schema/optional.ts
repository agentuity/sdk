import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const schemaOptionalAgent = createAgent('schema-optional', {
	description: 'Test optional fields and defaults',
	schema: {
		input: s.object({
			required: s.string(),
			optional: s.string().optional(),
			withDefault: s.number().optional(),
		}),
		output: s.object({
			success: s.boolean(),
			received: s.object({
				required: s.string(),
				optional: s.string().optional(),
				withDefault: s.number(),
			}),
		}),
	},
	handler: async (ctx, input) => {
		const { required, optional, withDefault = 42 } = input;

		return {
			success: true,
			received: {
				required,
				optional,
				withDefault,
			},
		};
	},
});

export default schemaOptionalAgent;
