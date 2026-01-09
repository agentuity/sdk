import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { projectGet } from '@agentuity/server';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';

const EnvGetResponseSchema = z.object({
	key: z.string().describe('Environment variable key name'),
	value: z.string().describe('Environment variable value'),
	secret: z.boolean().describe('Whether the value is stored as a secret'),
});

export const getSubcommand = createSubcommand({
	name: 'get',
	description: 'Get an environment variable or secret value',
	tags: ['read-only', 'fast', 'requires-auth', 'requires-project'],
	examples: [
		{ command: getCommand('env get NODE_ENV'), description: 'Get environment variable' },
		{ command: getCommand('env get API_KEY'), description: 'Get a secret value' },
		{ command: getCommand('env get API_KEY --no-mask'), description: 'Show unmasked value' },
	],
	requires: { auth: true, project: true, apiClient: true },
	schema: {
		args: z.object({
			key: z.string().describe('the environment variable or secret key'),
		}),
		options: z.object({
			maskSecret: z.boolean().optional().describe('mask the secret value in output'),
		}),
		response: EnvGetResponseSchema,
	},
	idempotent: true,

	async handler(ctx) {
		const { args, opts, apiClient, project, options } = ctx;

		// Fetch project with unmasked values
		const projectData = await tui.spinner('Fetching variable', () => {
			return projectGet(apiClient, { id: project.projectId, mask: false });
		});

		// Look for the key in both env and secrets
		let value: string | undefined;
		let isSecret = false;

		if (projectData.secrets?.[args.key] !== undefined) {
			value = projectData.secrets[args.key];
			isSecret = true;
		} else if (projectData.env?.[args.key] !== undefined) {
			value = projectData.env[args.key];
			isSecret = false;
		}

		if (value === undefined) {
			tui.fatal(`Variable '${args.key}' not found`, ErrorCode.RESOURCE_NOT_FOUND);
		}

		// For secrets, mask by default even in non-TTY; for env vars, mask only in TTY by default
		const maskDefault = isSecret ? true : !!process.stdout.isTTY;
		const shouldMask = opts?.mask !== undefined ? opts.mask : maskDefault;

		if (!options.json) {
			const displayValue = shouldMask ? tui.maskSecret(value) : value;
			const typeLabel = isSecret ? ' (secret)' : '';

			if (process.stdout.isTTY) {
				tui.success(`${args.key}=${displayValue}${typeLabel}`);
			} else {
				console.log(`${args.key}=${displayValue}`);
			}
		}

		return {
			key: args.key,
			value,
			secret: isSecret,
		};
	},
});
