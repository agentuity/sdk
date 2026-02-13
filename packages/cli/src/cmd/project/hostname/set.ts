import { z } from 'zod';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { projectHostnameSet } from '@agentuity/server';
import { getCommand } from '../../../command-prefix';
import { isJSONMode } from '../../../output';
import { ErrorCode } from '../../../errors';

// Client-side reserved names list (mirrors server-side list)
const RESERVED_NAMES = new Set([
	'app',
	'api',
	'catalyst',
	'pulse',
	'streams',
	'registry',
	'ion',
	'status',
	'admin',
	'www',
	'mail',
	'dns',
	'console',
	'dashboard',
	'docs',
	'help',
	'support',
	'billing',
	'test',
	'staging',
	'dev',
	'prod',
	'ns0',
	'ns1',
	'ns2',
]);

const HostnameSetResponseSchema = z.object({
	hostname: z.string().describe('The vanity hostname that was set'),
	url: z.string().describe('The full URL'),
});

export const setSubcommand = createSubcommand({
	name: 'set',
	description: 'Set a custom vanity hostname for the project on agentuity.run',
	tags: ['mutating', 'fast', 'requires-auth', 'requires-project'],
	requires: { auth: true, apiClient: true, project: true },
	examples: [
		{
			command: getCommand('project hostname set my-cool-api'),
			description: 'Set a custom hostname',
		},
	],
	schema: {
		args: z.object({
			hostname: z.string().describe('the vanity hostname (e.g., my-cool-api)'),
		}),
		response: HostnameSetResponseSchema,
	},

	async handler(ctx) {
		const { args, apiClient, project, options, logger } = ctx;
		const jsonMode = isJSONMode(options);

		const hostname = args.hostname.toLowerCase().trim();

		// Client-side validation: DNS label regex
		const hostnameRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
		if (!hostnameRegex.test(hostname)) {
			logger.fatal(
				'Invalid hostname: must contain only lowercase letters, numbers, and hyphens, and must start and end with a letter or number',
				ErrorCode.VALIDATION_FAILED
			);
		}

		// Max 63 chars (DNS label limit)
		if (hostname.length > 63) {
			logger.fatal(
				'Invalid hostname: must be 63 characters or fewer',
				ErrorCode.VALIDATION_FAILED
			);
		}

		// Must not match reserved hash patterns
		const reservedHashPattern = /^[dp][a-f0-9]{16}$/;
		if (reservedHashPattern.test(hostname)) {
			logger.fatal(
				'Invalid hostname: this pattern is reserved for internal use',
				ErrorCode.VALIDATION_FAILED
			);
		}

		// Must not be a reserved name
		if (RESERVED_NAMES.has(hostname)) {
			logger.fatal(
				`Invalid hostname: "${hostname}" is a reserved name`,
				ErrorCode.VALIDATION_FAILED
			);
		}

		const result = jsonMode
			? await projectHostnameSet(apiClient, {
					projectId: project.projectId,
					hostname,
				})
			: await tui.spinner('Setting hostname', () => {
					return projectHostnameSet(apiClient, {
						projectId: project.projectId,
						hostname,
					});
				});

		if (!jsonMode) {
			tui.success(`Hostname set: ${tui.bold(result.url)}`);
			tui.info('Hostname will be active after next deployment');
		}

		return {
			hostname: result.hostname,
			url: result.url,
		};
	},
});
