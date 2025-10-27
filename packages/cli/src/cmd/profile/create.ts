import type { SubcommandDefinition, CommandContext } from '@/types';
import type { Command } from 'commander';
import { fetchProfiles, getDefaultConfigDir, ensureConfigDir } from '@/config';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import * as tui from '@/tui';

const PROFILE_NAME_REGEX = /^[\w-_]{3,}$/;

export const createCommand: SubcommandDefinition = {
	name: 'create',
	description: 'Create a new configuration profile',

	register(parent: Command, ctx: CommandContext) {
		parent
			.command('create')
			.alias('new')
			.argument('<name>', 'The name of the profile to create')
			.description('Create a new configuration profile')
			.action(async (name: string) => {
				const { logger } = ctx;

				if (!name) {
					logger.fatal('Profile name is required');
				}

				if (!PROFILE_NAME_REGEX.test(name)) {
					logger.fatal(
						`Invalid profile name. Must be at least 3 characters and contain only letters, numbers, dashes, and underscores.`
					);
				}

				const profiles = await fetchProfiles();
				const existing = profiles.find((p) => p.name === name);

				if (existing) {
					logger.fatal(`Profile "${name}" already exists at ${existing.filename}`);
				}

				await ensureConfigDir();
				const configDir = getDefaultConfigDir();
				const filename = join(configDir, `${name}.yaml`);

				const template = `name: "${name}"\n`;

				try {
					await writeFile(filename, template, { mode: 0o644 });
					tui.success(`Created profile "${name}" at ${filename}`);
				} catch (error) {
					logger.fatal(`Failed to create profile: ${error}`);
				}
			});
	},
};

export default createCommand;
