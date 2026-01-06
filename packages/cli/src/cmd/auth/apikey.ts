import { createSubcommand } from '../../types';
import { getCommand } from '../../command-prefix';
import { z } from 'zod';

const ApikeyResponseSchema = z.object({
	apiKey: z.string().describe('The API key for the authenticated user'),
});

export const apikeyCommand = createSubcommand({
	name: 'apikey',
	description: 'Display the API key for the currently authenticated user',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true },
	idempotent: true,
	schema: {
		response: ApikeyResponseSchema,
	},
	examples: [
		{ command: getCommand('auth apikey'), description: 'Print the API key' },
		{ command: getCommand('--json auth apikey'), description: 'Output API key in JSON format' },
	],

	async handler(ctx) {
		const { auth, options } = ctx;

		const result = {
			apiKey: auth?.apiKey || '',
		};

		if (!options.json) {
			console.log(result.apiKey);
		}

		return result;
	},
});
