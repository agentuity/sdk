import { createCommand } from '@/types';
import { createCommand as createSubCmd } from './create';
import { listSubcommand } from './list';
import { stepsSubcommand } from './steps';
import { spinnerSubcommand } from './spinner';
import { deploySubcommand } from './deploy';
import { versionSubcommand } from './version';
import { createUserSubcommand } from './create-user';

export const command = createCommand({
	name: 'example',
	description: 'Example command with subcommands',
	subcommands: [
		createSubCmd,
		listSubcommand,
		stepsSubcommand,
		spinnerSubcommand,
		deploySubcommand,
		versionSubcommand,
		createUserSubcommand,
	],
});
