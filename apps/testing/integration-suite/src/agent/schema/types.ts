import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const schemaTypesAgent = createAgent('schema-types', {
	description: 'Test basic schema types',
	schema: {
		input: s.object({
			stringValue: s.string(),
			numberValue: s.number(),
			booleanValue: s.boolean(),
			arrayValue: s.array(s.string()),
			objectValue: s.object({
				nested: s.string(),
			}),
		}),
		output: s.object({
			success: s.boolean(),
			receivedTypes: s.object({
				string: s.string(),
				number: s.string(),
				boolean: s.string(),
				array: s.string(),
				object: s.string(),
			}),
		}),
	},
	handler: async (ctx, input) => {
		return {
			success: true,
			receivedTypes: {
				string: typeof input.stringValue,
				number: typeof input.numberValue,
				boolean: typeof input.booleanValue,
				array: Array.isArray(input.arrayValue) ? 'array' : typeof input.arrayValue,
				object: typeof input.objectValue,
			},
		};
	},
});

export default schemaTypesAgent;
