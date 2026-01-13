#!/usr/bin/env bun
/**
 * Generate JSON Schema from Zod schema for agentuity-snapshot build files.
 *
 * Usage:
 *   bun scripts/generate-snapshot-schema.ts > schema/agentuity-snapshot.json
 *   bun scripts/generate-snapshot-schema.ts --output schema/agentuity-snapshot.json
 */

import { z } from 'zod';

const SnapshotBuildFileSchema = z
	.object({
		$schema: z.string().optional().describe('JSON Schema reference URL'),
		version: z.literal(1).describe('Schema version, must be 1'),
		runtime: z
			.string()
			.describe('Runtime identifier (name:tag format, e.g., bun:1, node:20, python:3.12)'),
		description: z.string().optional().describe('Human-readable description of the snapshot'),
		dependencies: z
			.array(z.string())
			.optional()
			.describe(
				'List of apt packages to install. Supports version pinning: package=version or package=version* for prefix matching'
			),
		files: z
			.array(z.string())
			.optional()
			.describe(
				'Glob patterns for files to include from the build context. Supports negative patterns with ! prefix for exclusions'
			),
		env: z
			.record(z.string(), z.string())
			.optional()
			.describe(
				'Environment variables to set. Use ${VAR} syntax for build-time substitution via --env flag'
			),
		metadata: z
			.record(z.string(), z.string())
			.optional()
			.describe(
				'User-defined metadata key-value pairs. Use ${VAR} syntax for build-time substitution via --metadata flag'
			),
	})
	.describe('Agentuity Snapshot Build File - defines a reproducible sandbox environment');

const jsonSchema = z.toJSONSchema(SnapshotBuildFileSchema) as Record<string, unknown>;

const schema = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	$id: 'https://agentuity.dev/schema/cli/v1/agentuity-snapshot.json',
	title: 'Agentuity Snapshot Build File',
	description:
		'Schema for agentuity-snapshot.yaml files that define reproducible sandbox environments. Build with: agentuity cloud sandbox snapshot build <directory>',
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
