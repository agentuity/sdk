import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
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
 * Generate the reference file content that points to .agents/
 */
function generateReferenceContent(name: string): string {
	return `See [.agents/agentuity/sdk/${name}/AGENTS.md](../../.agents/agentuity/sdk/${name}/AGENTS.md) for Agentuity ${name} development guidelines.
`;
}

/**
 * Writes AGENTS.md documentation files to the appropriate locations in a project.
 *
 * This function generates and writes AGENTS.md files to:
 * - node_modules/@agentuity/cli/AGENTS.md (CLI documentation - full content)
 * - .agents/agentuity/sdk/[type]/AGENTS.md (Full content for agent, api, web)
 * - src/agent/AGENTS.md (Reference file pointing to .agents/)
 * - src/api/AGENTS.md (Reference file pointing to .agents/)
 * - src/web/AGENTS.md (Reference file pointing to .agents/)
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

	const ensureWithCreate = async (dir: string, fileName: string, content: string) => {
		await mkdir(dir, { recursive: true });
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

	// Write full content to .agents/agentuity/sdk/[type]/AGENTS.md
	await ensureWithCreate(
		join(rootDir, '.agents', 'agentuity', 'sdk', 'agent'),
		'AGENTS.md',
		generateAgentPrompt()
	);
	await ensureWithCreate(
		join(rootDir, '.agents', 'agentuity', 'sdk', 'api'),
		'AGENTS.md',
		generateAPIPrompt()
	);
	await ensureWithCreate(
		join(rootDir, '.agents', 'agentuity', 'sdk', 'web'),
		'AGENTS.md',
		generateWebPrompt()
	);

	// Write reference files to src/[type]/AGENTS.md (pointing to .agents/)
	await ensure(join(rootDir, 'src', 'agent'), 'AGENTS.md', generateReferenceContent('agent'));
	await ensure(join(rootDir, 'src', 'api'), 'AGENTS.md', generateReferenceContent('api'));
	await ensure(join(rootDir, 'src', 'web'), 'AGENTS.md', generateReferenceContent('web'));
}
