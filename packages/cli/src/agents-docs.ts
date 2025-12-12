import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { generateLLMPrompt as generateCLIPrompt } from './cmd/ai/prompt/llm';
import { generateLLMPrompt as generateAgentPrompt } from './cmd/ai/prompt/agent';
import { generateLLMPrompt as generateWebPrompt } from './cmd/ai/prompt/web';
import { generateLLMPrompt as generateAPIPrompt } from './cmd/ai/prompt/api';

interface WriteAgentsDocsOptions {
	/**
	 * If true, only write files that don't already exist.
	 * If false (default), always write files, overwriting existing ones.
	 */
	onlyIfMissing?: boolean;
}

/**
 * Writes AGENTS.md documentation files to the appropriate locations in a project.
 *
 * This function generates and writes AGENTS.md files to:
 * - node_modules/@agentuity/cli/AGENTS.md (CLI documentation)
 * - src/agent/AGENTS.md (Agent development documentation)
 * - src/api/AGENTS.md (API development documentation)
 * - src/web/AGENTS.md (Web development documentation)
 *
 * @param rootDir - The root directory of the project
 * @param options - Options for controlling write behavior
 */
export async function writeAgentsDocs(
	rootDir: string,
	options: WriteAgentsDocsOptions = {}
): Promise<void> {
	const { onlyIfMissing = false } = options;

	const ensure = async (dir: string, fileName: string, content: string) => {
		if (!existsSync(dir)) return;
		const filePath = join(dir, fileName);
		if (onlyIfMissing && existsSync(filePath)) return;
		await Bun.write(filePath, content);
	};

	// Generate and write AGENTS.md for the CLI (in node_modules)
	await ensure(
		join(rootDir, 'node_modules', '@agentuity', 'cli'),
		'AGENTS.md',
		generateCLIPrompt()
	);

	// Generate and write AGENTS.md for each of the main source folders
	await ensure(join(rootDir, 'src', 'agent'), 'AGENTS.md', generateAgentPrompt());
	await ensure(join(rootDir, 'src', 'api'), 'AGENTS.md', generateAPIPrompt());
	await ensure(join(rootDir, 'src', 'web'), 'AGENTS.md', generateWebPrompt());
}
