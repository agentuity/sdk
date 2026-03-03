import { createCommand } from '../../../types.ts';
import { llmSubcommand } from './llm.ts';
import { apiSubcommand } from './api.ts';
import { agentSubcommand } from './agent.ts';
import { webSubcommand } from './web.ts';
import { getCommand } from '../../../command-prefix.ts';

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
