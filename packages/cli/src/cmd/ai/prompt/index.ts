import { createCommand } from '../../../types';
import { llmSubcommand } from './llm';
import { apiSubcommand } from './api';
import { webSubcommand } from './web';
import { getCommand } from '../../../command-prefix';

export const promptCommand = createCommand({
	name: 'prompt',
	description: 'Generate prompts for LLMs',
	tags: ['read-only', 'fast'],
	examples: [
		{ command: getCommand('ai prompt llm'), description: 'Generate LLM-specific prompt' },
		{
			command: getCommand('ai prompt api'),
			description: 'Generate LLM-specific prompt for APIs',
		},
		{ command: getCommand('ai prompt web'), description: 'Generate LLM-specific prompt for Web' },
	],
	subcommands: [webSubcommand, llmSubcommand, apiSubcommand],
});

export default promptCommand;
