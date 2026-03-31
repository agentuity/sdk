import { z } from 'zod';
import { saveCoderApiKey, saveCoderHubUrl } from '../../../coder-config';
import { normalizeCoderHubHttpUrl } from '../../../coder-hub-url';
import { getCommand } from '../../../command-prefix';
import * as tui from '../../../tui';
import { createCommand, createSubcommand } from '../../../types';

const setUrlSubcommand = createSubcommand({
	name: 'url',
	description: 'Set the default Coder Hub URL for the active profile',
	tags: ['mutating', 'fast'],
	examples: [
		{
			command: getCommand('coder config set url https://hub.example.com'),
			description: 'Set the default Coder Hub URL',
		},
		{
			command: getCommand('coder config set url ws://127.0.0.1:3650/api/ws'),
			description: 'Store a local dev Hub URL using a WebSocket input',
		},
	],
	schema: {
		args: z.object({
			url: z.string().min(1).describe('Hub URL to store for the active profile'),
		}),
		response: z.object({
			profile: z.string().describe('Active CLI profile name'),
			hubUrl: z.string().describe('Normalized stored Hub HTTP URL'),
		}),
	},
	async handler(ctx) {
		const { args, options } = ctx;
		const normalized = normalizeCoderHubHttpUrl(args.url);

		try {
			new URL(normalized);
		} catch {
			tui.fatal(
				`Invalid Hub URL: ${args.url}\n\nExpected a full URL such as https://hub.example.com or ws://127.0.0.1:3650/api/ws`
			);
		}

		const result = await saveCoderHubUrl(normalized);

		if (!options.json) {
			tui.success(
				`Default Coder Hub URL set to ${tui.bold(result.hubUrl)} for profile ${tui.bold(result.profileName)}`
			);
		}

		return {
			profile: result.profileName,
			hubUrl: result.hubUrl,
		};
	},
});

const setApiKeySubcommand = createSubcommand({
	name: 'apikey',
	description: 'Set the default Coder Hub API key for the active profile',
	tags: ['mutating', 'fast'],
	examples: [
		{
			command: getCommand('coder config set apikey agc_...'),
			description: 'Set the default Coder Hub API key',
		},
	],
	schema: {
		args: z.object({
			apikey: z.string().min(1).describe('Hub API key to store for the active profile'),
		}),
		response: z.object({
			profile: z.string().describe('Active CLI profile name'),
			stored: z.boolean().describe('Whether the API key was stored successfully'),
		}),
	},
	async handler(ctx) {
		const { args, options } = ctx;
		const trimmed = args.apikey.trim();
		if (!trimmed) {
			tui.fatal('Hub API key cannot be empty');
		}

		const result = await saveCoderApiKey(trimmed);

		if (!options.json) {
			tui.success(`Coder Hub API key stored for profile ${tui.bold(result.profileName)}`);
		}

		return {
			profile: result.profileName,
			stored: true,
		};
	},
});

export const setSubcommand = createCommand({
	name: 'set',
	description: 'Set stored Coder Hub configuration values',
	tags: ['mutating', 'fast'],
	examples: [
		{
			command: getCommand('coder config set url https://hub.example.com'),
			description: 'Store the default Hub URL',
		},
		{
			command: getCommand('coder config set apikey agc_...'),
			description: 'Store the default Hub API key',
		},
	],
	subcommands: [setUrlSubcommand, setApiKeySubcommand],
});
