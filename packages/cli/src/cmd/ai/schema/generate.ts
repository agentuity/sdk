import { z } from 'zod';
import { createSubcommand, type CommandContext } from '../../../types';
import { getCommand } from '../../../command-prefix';
import { ProjectSchema } from '../../../types';

interface MergedSchema {
	type?: string;
	properties?: Record<string, unknown>;
	required?: string[];
	additionalProperties?: boolean | Record<string, unknown>;
	[key: string]: unknown;
}

export const generateSubcommand = createSubcommand({
	name: 'generate',
	description: 'Generate a JSON schema for the agentuity.json config file',
	tags: ['read-only', 'fast'],
	idempotent: true,
	examples: [getCommand('schema generate')],
	async handler(_ctx: CommandContext) {
		const o = z.toJSONSchema(ProjectSchema);
		const { $schema, allOf, ...rest } = o;

		// Merge allOf schemas into a single schema
		let mergedSchema: MergedSchema = { ...rest };
		if (allOf && Array.isArray(allOf)) {
			const properties: Record<string, unknown> = {};
			const required: string[] = [];

			for (const subSchema of allOf) {
				if (subSchema.properties) {
					Object.assign(properties, subSchema.properties);
				}
				if (subSchema.required && Array.isArray(subSchema.required)) {
					required.push(...subSchema.required);
				}
			}

			mergedSchema = {
				type: 'object',
				properties,
				required: [...new Set(required)],
				additionalProperties: false,
			};
		}

		if (!mergedSchema.properties) {
			mergedSchema.properties = {};
		}
		mergedSchema.properties['$schema'] = {
			type: 'string',
		};

		const schema = {
			$schema,
			$id: 'https://agentuity.dev/schema/cli/v1/agentuity.json',
			$comment: 'The agentuity.json configuration schema',
			...mergedSchema,
		};
		console.log(JSON.stringify(schema, null, 2));
	},
});

export default generateSubcommand;
