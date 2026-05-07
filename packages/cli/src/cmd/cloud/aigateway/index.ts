import { createCommand } from '../../../types.ts';
import { getCommand } from '../../../command-prefix.ts';
import { completeSubcommand } from './complete.ts';
import { modelsSubcommand } from './models.ts';

export const aigatewayCommand = createCommand({
	name: 'aigateway',
	aliases: ['ai-gateway', 'ai'],
	description: 'Use the Agentuity AI Gateway',
	tags: ['slow'],
	examples: [
		{ command: getCommand('cloud aigateway models'), description: 'List supported models' },
		{
			command: getCommand('cloud aigateway complete --model openai/gpt-4.1-mini "Hello"'),
			description: 'Run a completion',
		},
	],
	subcommands: [modelsSubcommand, completeSubcommand],
});

export default aigatewayCommand;
