/**
 * Generate auth schema SQL using drizzle-kit export
 */

import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCommand } from '../../../command-prefix';
import { generateAuthSchemaSql } from './shared';

export const generateSubcommand = createSubcommand({
	name: 'generate',
	description: 'Generate SQL schema for Agentuity Auth tables',
	tags: ['slow'],
	examples: [
		{
			command: getCommand('project auth generate'),
			description: 'Generate SQL schema and save to agentuity-auth-schema.sql',
		},
		{
			command: getCommand('project auth generate --output ./migrations/auth.sql'),
			description: 'Generate schema to a custom path',
		},
	],
	schema: {
		options: z.object({
			output: z
				.string()
				.optional()
				.describe('Output path for generated SQL (default: ./agentuity-auth-schema.sql)'),
			stdout: z.boolean().optional().describe('Print SQL to stdout instead of writing to file'),
		}),
		response: z.object({
			success: z.boolean().describe('Whether generation succeeded'),
			outputPath: z.string().optional().describe('Path where SQL was written'),
		}),
	},

	async handler(ctx) {
		const { logger, opts } = ctx;
		const output = (opts?.output as string | undefined) ?? 'agentuity-auth-schema.sql';
		const toStdout = opts?.stdout as boolean | undefined;
		const projectDir = process.cwd();

		if (!toStdout) {
			tui.newline();
			tui.info(tui.bold('Agentuity Auth Schema Generation'));
			tui.newline();
		}

		try {
			const sql = await tui.spinner({
				message: 'Generating auth schema SQL from Drizzle schema',
				clearOnSuccess: true,
				callback: () => generateAuthSchemaSql(projectDir),
			});

			if (toStdout) {
				console.log(sql);
				return { success: true };
			}

			const outputPath = path.resolve(projectDir, output);
			fs.writeFileSync(outputPath, sql);

			tui.success(`Auth schema SQL saved to ${tui.bold(output)}`);
			tui.newline();
			tui.info('Next steps:');
			console.log('  1. Review the generated SQL file');
			console.log('  2. Run the SQL against your database');
			console.log(`     ${tui.muted('Or use: agentuity project auth init')}`);
			tui.newline();

			return { success: true, outputPath };
		} catch (error) {
			logger.error('Schema generation failed', { error });
			tui.error(
				`Schema generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
			tui.newline();
			tui.info('Make sure you have:');
			console.log('  1. @agentuity/auth installed as a dependency');
			console.log('  2. drizzle-kit available (installed with @agentuity/auth)');

			return { success: false };
		}
	},
});
