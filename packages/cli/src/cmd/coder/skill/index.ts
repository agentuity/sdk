import { createCommand } from '../../../types';
import { listSubcommand } from './list';
import { saveSkillSubcommand } from './save';
import { deleteSkillSubcommand } from './delete';
import { bucketsSubcommand } from './buckets';
import { getCommand } from '../../../command-prefix';

export const skillCommand = createCommand({
	name: 'skill',
	aliases: ['skills'],
	description: 'Manage Coder saved skills and skill buckets',
	tags: ['requires-auth'],
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand('coder skill list'),
			description: 'List saved skills',
		},
		{
			command: getCommand(
				'coder skill save --repo org/repo --skill-id sk_abc --name "My Skill"'
			),
			description: 'Save a skill to your library',
		},
		{
			command: getCommand('coder skill delete sk_abc123'),
			description: 'Delete a saved skill',
		},
		{
			command: getCommand('coder skill buckets'),
			description: 'List skill buckets',
		},
	],
	subcommands: [listSubcommand, saveSkillSubcommand, deleteSkillSubcommand, bucketsSubcommand],
});
