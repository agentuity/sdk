import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCommand } from '../../../command-prefix.ts';
import type { CommandContext } from '../../../types.ts';
import { createSubcommand } from '../../../types.ts';
import { appendHashComment } from './version.ts';

// See note on the equivalent web.ts — Bun supports the `with { type:
// 'text' }` import attribute, Node 24 does not yet, so we read the
// file synchronously at module load (works under both).
const apiPromptContent = readFileSync(
	join(dirname(fileURLToPath(import.meta.url)), 'api.md'),
	'utf-8'
);

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
