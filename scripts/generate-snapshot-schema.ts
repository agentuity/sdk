#!/usr/bin/env bun
/**
 * Generate JSON Schema from the canonical SnapshotBuildFileBaseSchema.
 *
 * This script uses the schema defined in @agentuity/server as the single source of truth.
 * The base schema is used (without the refine constraint) since JSON Schema doesn't
 * support cross-field validation constraints.
 *
 * Usage:
 *   bun scripts/generate-snapshot-schema.ts > schema/agentuity-snapshot.json
 *   bun scripts/generate-snapshot-schema.ts --output schema/agentuity-snapshot.json
 */

import { z } from 'zod';
import { SnapshotBuildFileBaseSchema } from '../packages/server/src/api/sandbox/snapshot-build.ts';

const SchemaWith$Schema = SnapshotBuildFileBaseSchema.extend({
	$schema: z.string().optional().describe('JSON Schema reference URL'),
});

const jsonSchema = z.toJSONSchema(SchemaWith$Schema) as Record<string, unknown>;

const schema = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	$id: 'https://agentuity.dev/schema/cli/v1/agentuity-snapshot.json',
	title: 'Agentuity Snapshot Build File',
	description:
		'Schema for agentuity-snapshot.yaml files that define reproducible sandbox environments. Build with: agentuity cloud sandbox snapshot build <directory>. Note: At least one of dependencies, files, or env must be specified.',
	type: jsonSchema.type,
	properties: jsonSchema.properties,
	required: jsonSchema.required,
	additionalProperties: true,
};

const output = JSON.stringify(schema, null, 2);

const outputArg = process.argv.find((arg) => arg.startsWith('--output='));
const outputFlag = process.argv.indexOf('--output');

if (outputArg) {
	const outputPath = outputArg.split('=')[1];
	await Bun.write(outputPath, output);
	console.error(`Schema written to ${outputPath}`);
} else if (outputFlag !== -1 && process.argv[outputFlag + 1]) {
	const outputPath = process.argv[outputFlag + 1];
	await Bun.write(outputPath, output);
	console.error(`Schema written to ${outputPath}`);
} else {
	console.log(output);
}
