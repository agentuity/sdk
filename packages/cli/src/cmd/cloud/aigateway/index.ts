import { createCommand } from '../../../types';
import { getCommand } from '../../../command-prefix';
import { completeSubcommand } from './complete';
import { modelsSubcommand } from './models';

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
