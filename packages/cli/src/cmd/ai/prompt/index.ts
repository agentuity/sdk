import { createCommand } from '../../../types';
import { llmSubcommand } from './llm';
import { apiSubcommand } from './api';
import { agentSubcommand } from './agent';
import { webSubcommand } from './web';
import { getCommand } from '../../../command-prefix';

export const promptCommand = createCommand({
	name: 'prompt',
	description: 'Generate prompts for LLMs and agents',
	tags: ['read-only', 'fast'],
	examples: [
		{ command: getCommand('ai prompt llm'), description: 'Generate LLM-specific prompt' },
		{
			command: getCommand('ai prompt agent'),
			description: 'Generate LLM-specific prompt for Agents',
		},
		{
			command: getCommand('ai prompt api'),
			description: 'Generate LLM-specific prompt for APIs',
		},
		{ command: getCommand('ai prompt web'), description: 'Generate LLM-specific prompt for Web' },
	],
	subcommands: [agentSubcommand, webSubcommand, llmSubcommand, apiSubcommand],
});

export default promptCommand;
