import { createSubcommand } from '../../../types';
import type { CommandContext } from '../../../types';
import { getCommand } from '../../../command-prefix';
import webPromptContent from './web.md';
import { appendVersionComment } from './version';

/**
 * Prompt version for web.md - increment this when prompt content changes.
 */
export const PROMPT_VERSION = 1;

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
 * Generate the web prompt with version comment.
 */
export function generateLLMPrompt(): string {
	return appendVersionComment(webPromptContent, PROMPT_VERSION);
}
