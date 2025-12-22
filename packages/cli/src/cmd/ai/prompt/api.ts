import { createSubcommand } from '../../../types';
import type { CommandContext } from '../../../types';
import { getCommand } from '../../../command-prefix';
import apiPromptContent from './api.md';
import { appendVersionComment } from './version';

/**
 * Prompt version for api.md - increment this when prompt content changes.
 */
export const PROMPT_VERSION = 1;

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
 * Generate the API prompt with version comment.
 */
export function generateLLMPrompt(): string {
	return appendVersionComment(apiPromptContent, PROMPT_VERSION);
}
