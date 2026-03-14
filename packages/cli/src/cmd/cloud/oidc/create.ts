import { oauthClientCreate, oauthScopes, type OAuthClientCreateRequest } from '@agentuity/core';
import enquirer from 'enquirer';
import { z } from 'zod';
import { getCommand } from '../../../command-prefix';
import * as tui from '../../../tui';
import { createSubcommand as createSubcommandHelper } from '../../../types';
import { createOAuthClient } from './util';

const OAuthClientCreateResponseSchema = z.object({
	client: z.object({
		id: z.string(),
		name: z.string(),
		description: z.string(),
		homepage_url: z.string(),
		client_type: z.enum(['public', 'confidential']),
		redirect_uris: z.array(z.string()),
		scopes: z.array(z.string()),
		created_at: z.string(),
		updated_at: z.string(),
	}),
	client_secret: z.string(),
});

function parseCsv(value?: string): string[] {
	if (!value) return [];
	return value
		.split(',')
		.map((part) => part.trim())
		.filter(Boolean);
}

export const createSubcommand = createSubcommandHelper({
	name: 'create',
	aliases: ['new'],
	description: 'Create a new OAuth application',
	tags: ['creates-resource', 'slow', 'requires-auth'],
	examples: [
		{
			command: getCommand(
				'cloud oidc create --name "My App" --description "OAuth app" --homepage-url "https://example.com" --type confidential --redirect-uris "https://example.com/callback" --scopes "openid,profile,email"'
			),
			description: 'Create OAuth application non-interactively',
		},
		{
			command: getCommand('cloud oidc create'),
			description: 'Create OAuth application interactively',
		},
	],
	requires: { auth: true },
	idempotent: false,
	webUrl: '/settings/oauth-apps',
	schema: {
		options: z.object({
			name: z.string().optional().describe('the OAuth application name'),
			description: z.string().optional().describe('the OAuth application description'),
			'homepage-url': z.string().optional().describe('the homepage URL'),
			type: z
				.enum(['public', 'confidential'])
				.optional()
				.describe('OAuth client type: public or confidential'),
			'redirect-uris': z
				.string()
				.optional()
				.describe('comma-separated redirect URIs (e.g. https://app/callback,https://app/alt)'),
			scopes: z
				.string()
				.optional()
				.describe('comma-separated OAuth scopes (e.g. openid,profile,email)'),
		}),
		response: OAuthClientCreateResponseSchema,
	},

	async handler(ctx) {
		const { opts, options } = ctx;
		const catalystClient = await createOAuthClient(ctx);

		const availableScopes = await tui.spinner('Fetching available OAuth scopes', () => {
			return oauthScopes(catalystClient);
		});

		const nonInteractive = !process.stdin.isTTY || !process.stdout.isTTY;

		let name = opts?.name?.trim() || '';
		let description = opts?.description?.trim() || '';
		let homepageUrl = opts?.['homepage-url']?.trim() || '';
		let clientType = opts?.type;
		let redirectUris = parseCsv(opts?.['redirect-uris']);
		let scopes = parseCsv(opts?.scopes);

		if (!name) {
			if (nonInteractive) {
				tui.fatal('--name is required in non-interactive mode');
			}
			const answer = await enquirer.prompt<{ name: string }>({
				type: 'input',
				name: 'name',
				message: 'Application name:',
			});
			name = answer.name?.trim() || '';
		}

		if (!description && !nonInteractive) {
			const answer = await enquirer.prompt<{ description: string }>({
				type: 'input',
				name: 'description',
				message: 'Description:',
			});
			description = answer.description?.trim() || '';
		}

		if (!homepageUrl) {
			if (nonInteractive) {
				tui.fatal('--homepage-url is required in non-interactive mode');
			}
			const answer = await enquirer.prompt<{ homepageUrl: string }>({
				type: 'input',
				name: 'homepageUrl',
				message: 'Homepage URL:',
			});
			homepageUrl = answer.homepageUrl?.trim() || '';
		}

		if (!clientType) {
			if (nonInteractive) {
				tui.fatal('--type is required in non-interactive mode');
			}
			const answer = await enquirer.prompt<{ clientType: 'public' | 'confidential' }>({
				type: 'select',
				name: 'clientType',
				message: 'Client type:',
				choices: [
					{ name: 'public', message: 'public' },
					{ name: 'confidential', message: 'confidential' },
				],
			});
			clientType = answer.clientType;
		}

		if (redirectUris.length === 0) {
			if (nonInteractive) {
				tui.fatal('--redirect-uris is required in non-interactive mode');
			}
			const answer = await enquirer.prompt<{ redirectUris: string }>({
				type: 'input',
				name: 'redirectUris',
				message: 'Redirect URIs (comma-separated):',
			});
			redirectUris = parseCsv(answer.redirectUris);
		}

		if (scopes.length === 0) {
			if (nonInteractive) {
				tui.fatal('--scopes is required in non-interactive mode');
			}

			const choices = availableScopes.scopes.map((scope) => ({
				name: scope.name,
				message: `${scope.name} — ${scope.description}`,
			}));

			const answer = await enquirer.prompt<{ scopes: string[] }>({
				type: 'multiselect',
				name: 'scopes',
				message: 'Select OAuth scopes:',
				choices,
			});
			scopes = answer.scopes;
		}

		if (!name) {
			tui.fatal('Name is required');
		}
		if (!homepageUrl) {
			tui.fatal('Homepage URL is required');
		}
		if (!clientType) {
			tui.fatal('Client type is required');
		}
		if (redirectUris.length === 0) {
			tui.fatal('At least one redirect URI is required');
		}
		if (scopes.length === 0) {
			tui.fatal('At least one scope is required');
		}

		const availableScopeNames = new Set(availableScopes.scopes.map((scope) => scope.name));
		const invalidScopes = scopes.filter((scope) => !availableScopeNames.has(scope));
		if (invalidScopes.length > 0) {
			tui.fatal(`Invalid scopes: ${invalidScopes.join(', ')}`);
		}

		const request: OAuthClientCreateRequest = {
			name,
			description,
			homepage_url: homepageUrl,
			client_type: clientType,
			redirect_uris: redirectUris,
			scopes,
		};

		const result = await tui.spinner('Creating OAuth application', () => {
			return oauthClientCreate(catalystClient, request);
		});

		if (!options.json) {
			tui.newline();
			tui.success('OAuth application created successfully!');
			tui.newline();
			tui.warning('Copy the client secret now. It will only be shown once.');
			tui.newline();

			tui.table(
				[
					{
						ID: result.client.id,
						Name: result.client.name,
						Type: result.client.client_type,
						'Client Secret': result.client_secret,
						'Redirect URIs': result.client.redirect_uris.join(', '),
						Scopes: result.client.scopes.join(', '),
					},
				],
				undefined,
				{ layout: 'vertical' }
			);
		}

		return result;
	},
});
