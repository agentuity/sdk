import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const errorValidationAgent = createAgent('errors-validation', {
	description: 'Test schema validation error handling',
	schema: {
		input: s.object({
			name: s.string(),
			age: s.number(),
			email: s.string(),
			active: s.boolean().optional(),
		}),
		output: s.object({
			success: s.boolean(),
			message: s.string(),
			data: s.object({
				name: s.string(),
				age: s.number(),
				email: s.string(),
				active: s.boolean(),
			}),
		}),
	},
	handler: async (ctx, input) => {
		const { name, age, email, active = true } = input;

		return {
			success: true,
			message: 'Validation passed',
			data: {
				name,
				age,
				email,
				active,
			},
		};
	},
});

export default errorValidationAgent;
