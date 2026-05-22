import { createCommand } from '../../../types.ts';
import { llmSubcommand } from './llm.ts';
import { getCommand } from '../../../command-prefix.ts';

export const promptCommand = createCommand({
	name: 'prompt',
	description: 'Generate prompts for LLMs',
	tags: ['read-only', 'fast'],
	examples: [
		{ command: getCommand('ai prompt llm'), description: 'Generate LLM-specific prompt' },
	],
	subcommands: [llmSubcommand],
});

export default promptCommand;
