import { z } from 'zod';
import { APIError, ValidationOutputError } from '@agentuity/core';
import { CoderClient } from '@agentuity/core/coder';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';
import { parseCommaList } from './common';

export const validateWorkspaceDependenciesSubcommand = createSubcommand({
	name: 'validate-dependencies',
	aliases: ['validate-deps'],
	description: 'Validate APT dependencies for Coder workspace snapshots',
	tags: ['read-only', 'requires-auth'],
	idempotent: true,
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand('coder workspace validate-dependencies git,nodejs'),
			description: 'Validate dependency package names',
		},
	],
	schema: {
		args: z.object({
			dependencies: z.string().describe('Comma-separated APT dependencies to validate'),
		}),
		options: z.object({
			url: z.string().optional().describe('Coder API URL override'),
		}),
	},
	async handler(ctx) {
		const { args, opts, options } = ctx;
		const dependencies = parseCommaList(args.dependencies);
		if (dependencies.length === 0) {
			tui.fatal('At least one dependency is required.', ErrorCode.VALIDATION_FAILED);
		}

		const client = new CoderClient({
			apiKey: ctx.auth.apiKey,
			url: opts?.url,
			orgId: ctx.orgId,
		});

		try {
			const result = await client.validateWorkspaceDependencies(dependencies);
			if (options.json) {
				return result;
			}

			if (result.valid.length > 0) {
				tui.success(`Valid dependencies: ${result.valid.join(', ')}`);
			}
			if (result.invalid.length > 0) {
				tui.error(`Invalid dependencies: ${result.invalid.length}`);
				for (const invalid of result.invalid) {
					tui.output(`  - ${invalid.package}: ${invalid.error}`);
				}
			}
			return result;
		} catch (err) {
			if (err instanceof ValidationOutputError) {
				ctx.logger.trace('Validation response URL: %s', err.url ?? 'unknown');
				ctx.logger.trace('Validation issues: %s', JSON.stringify(err.issues, null, 2));
			}
			if (err instanceof APIError && err.status >= 400 && err.status < 500) {
				tui.fatal(
					`Failed to validate dependencies: ${err.message}`,
					ErrorCode.VALIDATION_FAILED
				);
			}
			const msg = err instanceof Error ? err.message : String(err);
			tui.fatal(`Failed to validate dependencies: ${msg}`, ErrorCode.NETWORK_ERROR);
		}
	},
});
