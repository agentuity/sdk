import { createSubcommand } from '../../../types';
import type { CommandContext } from '../../../types';
import { getCommand } from '../../../command-prefix';
import webPromptContent from './web.md';
import { appendHashComment } from './version';

export const webSubcommand = createSubcommand({
	name: 'web',
	description: 'Generate a comprehensive prompt for LLM agents for the web folder',
	tags: ['read-only', 'fast'],
	idempotent: true,
	examples: [{ command: getCommand('prompt web'), description: 'Run web command' }],
	async handler(_ctx: CommandContext) {
		const prompt = generateLLMPrompt();
		console.log(prompt);
	},
});

/**
 * Get the raw prompt content without hash.
 */
export function getPromptContent(): string {
	return webPromptContent;
}

/**
 * Generate the web prompt with hash comment.
 */
export function generateLLMPrompt(): string {
	return appendHashComment(webPromptContent);
}
