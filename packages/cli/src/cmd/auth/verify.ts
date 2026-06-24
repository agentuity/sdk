import { z } from 'zod';
import { createSubcommand } from '../../types.ts';
import { getCommand } from '../../command-prefix.ts';
import { getAuth } from '../../config.ts';
import { whoami } from '@agentuity/server';
import { APIClient, getAPIBaseURL } from '../../api.ts';
import * as tui from '../../tui.ts';
import { isJSONMode } from '../../output.ts';

const VerifyResponseSchema = z.object({
	valid: z.boolean().describe('Whether credentials are valid'),
	source: z.enum(['env', 'profile']).describe('Where the active credentials came from'),
	userId: z.string().optional().describe('Authenticated user ID'),
	organizations: z
		.array(
			z.object({
				id: z.string().describe('Organization ID'),
				name: z.string().describe('Organization name'),
			})
		)
		.optional()
		.describe('Organizations the user can access'),
	message: z.string().optional().describe('Validation failure message'),
});

function authSource(): 'env' | 'profile' {
	if (process.env.AGENTUITY_CLI_API_KEY || process.env.AGENTUITY_API_KEY) {
		return 'env';
	}
	return 'profile';
}

export const verifyCommand = createSubcommand({
	name: 'verify',
	description: 'Validate current CLI authentication without a browser',
	tags: ['read-only', 'fast'],
	idempotent: true,
	examples: [
		{ command: getCommand('auth verify --json'), description: 'Verify credentials in JSON mode' },
		{ command: getCommand('auth verify'), description: 'Verify env or profile credentials' },
	],
	schema: {
		response: VerifyResponseSchema,
	},
	async handler(ctx) {
		const { config, logger, options } = ctx;
		const auth = await getAuth();
		if (!auth) {
			const result = {
				valid: false,
				source: authSource(),
				message: 'No credentials found. Set AGENTUITY_API_KEY or run auth login --api-key.',
			};
			if (!isJSONMode(options)) {
				tui.error(result.message);
			}
			return result;
		}

		const apiClient = new APIClient(getAPIBaseURL(config), logger, auth.apiKey, config);
		try {
			const user = await whoami(apiClient);
			const result = {
				valid: true,
				source: authSource(),
				userId: auth.userId || undefined,
				organizations: user.organizations,
			};
			if (!isJSONMode(options)) {
				tui.success('Authentication is valid');
				console.log(`  User ID: ${tui.muted(result.userId ?? '')}`);
				if (result.organizations.length > 0) {
					tui.newline();
					tui.info('Organizations');
					for (const org of result.organizations) {
						console.log(`  ${org.name} ${tui.muted(org.id)}`);
					}
				}
			}
			return result;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const result = {
				valid: false,
				source: authSource(),
				message,
			};
			if (!isJSONMode(options)) {
				tui.error(`Authentication failed: ${message}`);
			}
			return result;
		}
	},
});
