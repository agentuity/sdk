import type { CommandDefinition } from '../../types';
import { createCommand } from '../../types';
import { llmSubcommand } from './llm';

export const promptCommand: CommandDefinition = createCommand({
	name: 'prompt',
	description: 'Generate prompts for LLMs and agents',
	tags: ['read-only', 'fast'],
	subcommands: [llmSubcommand],
});

export default promptCommand;
