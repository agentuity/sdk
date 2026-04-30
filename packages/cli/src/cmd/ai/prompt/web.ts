import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCommand } from '../../../command-prefix.ts';
import type { CommandContext } from '../../../types.ts';
import { createSubcommand } from '../../../types.ts';
import { appendHashComment } from './version.ts';

// Read the markdown prompt at module load. Both Bun and Node 24 support
// this synchronous I/O at top-level. Bun also supports
// `import x from './file.md' with { type: 'text' }` natively, but Node
// does not yet, so we use the portable pattern here.
const webPromptContent = readFileSync(
	join(dirname(fileURLToPath(import.meta.url)), 'web.md'),
	'utf-8'
);

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
