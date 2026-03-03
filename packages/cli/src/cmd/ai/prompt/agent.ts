import { createSubcommand } from '../../../types';
import type { CommandContext } from '../../../types';
import { getCommand } from '../../../command-prefix';
import { appendHashComment } from './version';
import agentPromptContent from './agent.md' with { type: 'text' };

export const agentSubcommand = createSubcommand({
	name: 'agent',
	description: 'Generate a comprehensive prompt for LLM agents for the agents folder',
	tags: ['read-only', 'fast'],
	idempotent: true,
	examples: [{ command: getCommand('prompt agent'), description: 'Run agent command' }],
	async handler(_ctx: CommandContext) {
		const prompt = generateLLMPrompt();
		console.log(prompt);
	},
});

/**
 * Get the raw prompt content without hash.
 */
export function getPromptContent(): string {
	return agentPromptContent;
}

/**
 * Generate the agent prompt with hash comment.
 */
export function generateLLMPrompt(): string {
	return appendHashComment(agentPromptContent);
}
