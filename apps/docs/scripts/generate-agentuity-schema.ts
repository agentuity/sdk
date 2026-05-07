import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const ROOT_DIR = join(import.meta.dir, '..');
const PUBLIC_DIR = join(ROOT_DIR, 'src/web/public');
const CLI_PATH = join(ROOT_DIR, '../../packages/cli/bin/cli.ts');
const SCHEMA_DRAFT_URL = 'https://json-schema.org/draft/2020-12/schema';
const AGENTUITY_SCHEMA_URL = 'https://agentuity.dev/schema/cli/v1/agentuity.json';

const OUTPUT_PATHS: readonly string[] = [
	join(PUBLIC_DIR, 'schema/cli/v1/agentuity.json'),
	join(PUBLIC_DIR, 'schemas/agentuity.json.schema.json'),
];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function generateSchema(): Promise<string> {
	const cliProcess = Bun.spawn(['bun', CLI_PATH, 'ai', 'schema', 'generate'], {
		cwd: ROOT_DIR,
		stdout: 'pipe',
		stderr: 'pipe',
	});

	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(cliProcess.stdout).text(),
		new Response(cliProcess.stderr).text(),
		cliProcess.exited,
	]);

	if (exitCode !== 0) {
		const details = stderr.trim() || stdout.trim();
		throw new Error(`Failed to generate agentuity.json schema: ${details}`);
	}

	return `${stdout.trimEnd()}\n`;
}

function validateSchema(schemaText: string): void {
	let parsed: unknown;
	try {
		parsed = JSON.parse(schemaText);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : 'Unknown JSON parse error';
		throw new Error(`Generated agentuity.json schema is not valid JSON: ${message}`);
	}

	if (!isRecord(parsed)) {
		throw new Error('Generated agentuity.json schema must be a JSON object.');
	}

	if (parsed.$schema !== SCHEMA_DRAFT_URL) {
		throw new Error(`Generated agentuity.json schema has unexpected $schema: ${parsed.$schema}`);
	}

	if (parsed.$id !== AGENTUITY_SCHEMA_URL) {
		throw new Error(`Generated agentuity.json schema has unexpected $id: ${parsed.$id}`);
	}
}

async function writeGeneratedFile(path: string, content: string): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, content, 'utf-8');
}

async function main(): Promise<void> {
	const schemaText = await generateSchema();
	validateSchema(schemaText);

	await Promise.all(OUTPUT_PATHS.map((path) => writeGeneratedFile(path, schemaText)));

	console.log(`Generated agentuity.json schema at ${OUTPUT_PATHS.length} public paths.`);
}

main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(message);
	process.exit(1);
});
