import { createSubcommand } from '../../../types';
import type { CommandContext } from '../../../types';
import { getCommand } from '../../../command-prefix';
import agentPromptContent from './agent.md';
import { appendVersionComment } from './version';

/**
 * Prompt version for agent.md - increment this when prompt content changes.
 */
export const PROMPT_VERSION = 1;

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
 * Generate the agent prompt with version comment.
 */
export function generateLLMPrompt(): string {
	return appendVersionComment(agentPromptContent, PROMPT_VERSION);
}
