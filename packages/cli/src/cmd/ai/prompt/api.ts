import { createSubcommand } from '../../../types.ts';
import type { CommandContext } from '../../../types.ts';
import { getCommand } from '../../../command-prefix.ts';
import { appendHashComment } from './version.ts';
import apiPromptContent from './api.md' with { type: 'text' };

export const apiSubcommand = createSubcommand({
	name: 'api',
	description: 'Generate a comprehensive prompt for LLM agents for the apis folder',
	tags: ['read-only', 'fast'],
	idempotent: true,
	examples: [{ command: getCommand('prompt api'), description: 'Run api command' }],
	async handler(_ctx: CommandContext) {
		const prompt = generateLLMPrompt();
		console.log(prompt);
	},
});

/**
 * Get the raw prompt content without hash.
 */
export function getPromptContent(): string {
	return apiPromptContent;
}

/**
 * Generate the API prompt with hash comment.
 */
export function generateLLMPrompt(): string {
	return appendHashComment(apiPromptContent);
}
