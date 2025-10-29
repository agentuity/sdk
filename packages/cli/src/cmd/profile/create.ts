import { createSubcommand } from '../../types';
import { z } from 'zod';
import {
	fetchProfiles,
	getDefaultConfigDir,
	ensureConfigDir,
	generateYAMLTemplate,
} from '../../config';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import * as tui from '../../tui';

const PROFILE_NAME_REGEX = /^[\w_-]{3,}$/;

export const createCommand = createSubcommand({
	name: 'create',
	description: 'Create a new configuration profile',
	aliases: ['new'],
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
	},

	async handler(ctx) {
		const { logger, args } = ctx;
		const { name } = args;

		const profiles = await fetchProfiles();
		const existing = profiles.find((p) => p.name === name);

		if (existing) {
			return logger.fatal(`Profile "${name}" already exists at ${existing.filename}`);
		}

		await ensureConfigDir();
		const configDir = getDefaultConfigDir();
		const filename = join(configDir, `${name}.yaml`);

		const template = generateYAMLTemplate(name);

		try {
			await writeFile(filename, template, { flag: 'wx', mode: 0o600 });
			tui.success(`Created profile "${name}" at ${filename}`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const stack = error instanceof Error ? error.stack : undefined;
			logger.fatal(`Failed to create profile: ${message}${stack ? `\n${stack}` : ''}`);
		}
	},
});
