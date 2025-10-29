import type { SubcommandDefinition } from '../../types';
import { fetchProfiles } from '../../config';
import { basename, dirname } from 'node:path';
import * as tui from '../../tui';

export const listCommand: SubcommandDefinition = {
	name: 'list',
	description: 'List all available profiles',
	aliases: ['ls'],

	async handler() {
		const profiles = await fetchProfiles();

		if (profiles.length === 0) {
			tui.info('No profiles found');
			return;
		}

		console.log('Available profiles:');
		for (const profile of profiles) {
			const marker = profile.selected ? '•' : ' ';
			const name = tui.padRight(profile.name, 15, ' ');
			const path = `${basename(dirname(profile.filename))}/${basename(profile.filename)}`;
			console.log(`${marker} ${name} ${tui.muted(path)}`);
		}
	},
};
