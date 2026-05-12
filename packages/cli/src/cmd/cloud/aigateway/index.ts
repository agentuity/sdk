import { createCommand } from '../../../types.ts';
import { getCommand } from '../../../command-prefix.ts';
import { completeSubcommand } from './complete.ts';
import {
	embeddingsSubcommand,
	imageSubcommand,
	speechSubcommand,
	transcriptionSubcommand,
	videoSubcommand,
} from './modalities.ts';
import { modelsSubcommand } from './models.ts';
import { requestSubcommand } from './request.ts';

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
		{
			command: getCommand(
				'cloud aigateway request /v1/embeddings --body \'{"model":"openai/text-embedding-3-small","input":"Hello"}\''
			),
			description: 'Send an upstream-shaped request',
		},
	],
	subcommands: [
		modelsSubcommand,
		completeSubcommand,
		embeddingsSubcommand,
		imageSubcommand,
		speechSubcommand,
		transcriptionSubcommand,
		videoSubcommand,
		requestSubcommand,
	],
});

export default aigatewayCommand;
