import { z } from 'zod';
import { createSubcommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { projectHostnameGet } from '@agentuity/server';
import { getCommand } from '../../../command-prefix.ts';
import { isJSONMode } from '../../../output.ts';

const HostnameGetResponseSchema = z.object({
	hostname: z.string().nullable().describe('The vanity hostname'),
	url: z.string().nullable().describe('The full URL'),
});

export const getSubcommand = createSubcommand({
	name: 'get',
	description: 'Show the current vanity hostname for the project',
	tags: ['read-only', 'fast', 'requires-auth', 'requires-project'],
	requires: { auth: true, apiClient: true, project: true },
	idempotent: true,
	examples: [
		{
			command: getCommand('project hostname get'),
			description: 'Show current hostname',
		},
	],
	schema: {
		response: HostnameGetResponseSchema,
	},

	async handler(ctx) {
		const { apiClient, project, options } = ctx;
		const jsonMode = isJSONMode(options);

		const result = jsonMode
			? await projectHostnameGet(apiClient, { projectId: project.projectId })
			: await tui.spinner('Fetching hostname', () => {
					return projectHostnameGet(apiClient, { projectId: project.projectId });
				});

		if (!jsonMode) {
			if (result.hostname) {
				tui.success(`Hostname: ${tui.bold(result.hostname)}`);
				tui.info(`URL: ${result.url}`);
			} else {
				tui.info('No vanity hostname set for this project');
				tui.info(`Use ${tui.bold(getCommand('project hostname set <hostname>'))} to set one`);
			}
		}

		return {
			hostname: result.hostname,
			url: result.url,
		};
	},
});
