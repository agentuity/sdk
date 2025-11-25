import { join } from 'node:path';
import { writeFile, readdir } from 'node:fs/promises';
import { Config, createSubcommand } from '../../types';
import { z } from 'zod';
import {
	fetchProfiles,
	getDefaultConfigDir,
	ensureConfigDir,
	generateYAMLTemplate,
	loadConfig,
	saveConfig,
	saveProfile,
} from '../../config';
import * as tui from '../../tui';
import { getCommand } from '../../command-prefix';
import { ErrorCode } from '../../errors';

const PROFILE_NAME_REGEX = /^[\w_-]{3,}$/;

export const createCommand = createSubcommand({
	name: 'create',
	description: 'Create a new configuration profile',
	tags: ['mutating', 'creates-resource', 'fast'],
	aliases: ['new'],
	idempotent: false,
	examples: [
		getCommand('profile create production'),
		getCommand('profile create staging --switch'),
		getCommand('profile create development'),
	],
	schema: {
		args: z
			.object({
				name: z
					.string()
					.min(3)
					.regex(PROFILE_NAME_REGEX)
					.describe('The name of the profile to create'),
			})
			.describe('Profile creation arguments'),
		options: z.object({
			switch: z.boolean().optional().describe('switch to this profile (if more than one)'),
		}),
		response: z.object({
			success: z.boolean().describe('Whether creation succeeded'),
			name: z.string().describe('Profile name'),
			path: z.string().describe('Profile file path'),
		}),
	},

	async handler(ctx) {
		const { logger, args, opts } = ctx;
		const { name } = args;

		const profiles = await fetchProfiles();
		const existing = profiles.find((p) => p.name === name);

		if (existing) {
			return logger.fatal(
				`Profile "${name}" already exists at ${existing.filename}`,
				ErrorCode.RESOURCE_ALREADY_EXISTS
			) as never;
		}

		await ensureConfigDir();
		const configDir = getDefaultConfigDir();
		const filename = join(configDir, `${name}.yaml`);

		const template = generateYAMLTemplate(name);

		try {
			await writeFile(filename, template, { flag: 'wx', mode: 0o600 });
			if (name === 'local') {
				// if we're creating a local profile, go ahead and fill it out for the dev to make it easier to get started
				const localConfig = (await loadConfig(filename)) as Config;
				localConfig.overrides = {
					api_url: 'https://api.agentuity.io',
					app_url: 'https://app.agentuity.io',
					transport_url: 'https://catalyst.agentuity.io',
					stream_url: 'https://streams.agentuity.io',
					kv_url: 'https://catalyst.agentuity.io',
					object_url: 'https://catalyst.agentuity.io',
					vector_url: 'https://catalyst.agentuity.io',
					catalyst_url: 'https://catalyst.agentuity.io',
					ion_url: 'https://ion.agentuity.io',
					gravity_url: 'grpc://gravity.agentuity.io:8443',
				};
				await saveConfig(localConfig, filename);
			}

			const files = await readdir(configDir);
			if (opts?.switch || files.length === 1) {
				await saveProfile(filename);
			}

			tui.success(`Created profile "${name}" at ${filename}`);

			return {
				success: true,
				name,
				path: filename,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const stack = error instanceof Error ? error.stack : undefined;
			return logger.fatal(
				`Failed to create profile: ${message}${stack ? `\n${stack}` : ''}`,
				ErrorCode.INTERNAL_ERROR
			) as never;
		}
	},
});
