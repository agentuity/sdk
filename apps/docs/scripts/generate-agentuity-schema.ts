import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const ROOT_DIR = join(import.meta.dir, '..');
const PUBLIC_DIR = join(ROOT_DIR, 'src/web/public');
const REPO_DIR = join(ROOT_DIR, '../..');
const CLI_PATH = join(ROOT_DIR, '../../packages/cli/bin/cli.ts');
const SCHEMA_DRAFT_URL = 'https://json-schema.org/draft/2020-12/schema';
const AGENTUITY_SCHEMA_URL = 'https://agentuity.dev/schema/cli/v1/agentuity.json';
const CANONICAL_SCHEMA_PATH = join(PUBLIC_DIR, 'schema/cli/v1/agentuity.json');
const LEGACY_SCHEMA_PATH = join(PUBLIC_DIR, 'schemas/agentuity.json.schema.json');
const PROCESS_TIMEOUT_MS = 30_000;

const OUTPUT_PATHS: readonly string[] = [CANONICAL_SCHEMA_PATH, LEGACY_SCHEMA_PATH];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function runCommand(
	command: readonly string[],
	cwd: string,
	input: string | undefined
): Promise<string> {
	const childProcess = Bun.spawn([...command], {
		cwd,
		stdin: input === undefined ? 'ignore' : 'pipe',
		stdout: 'pipe',
		stderr: 'pipe',
	});

	if (input !== undefined) {
		childProcess.stdin.write(input);
		childProcess.stdin.end();
	}

	let timedOut = false;
	const timeoutId = setTimeout(() => {
		timedOut = true;
		childProcess.kill();
	}, PROCESS_TIMEOUT_MS);

	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(childProcess.stdout).text(),
		new Response(childProcess.stderr).text(),
		childProcess.exited,
	]).finally(() => clearTimeout(timeoutId));

	if (timedOut) {
		throw new Error(
			`Timed out running ${command.join(' ')} after ${PROCESS_TIMEOUT_MS / 1000}s.`
		);
	}

	if (exitCode !== 0) {
		const details = stderr.trim() || stdout.trim();
		throw new Error(`Failed running ${command.join(' ')}: ${details}`);
	}

	return stdout;
}

async function generateSchema(): Promise<string> {
	const stdout = await runCommand(
		['bun', CLI_PATH, 'ai', 'schema', 'generate'],
		ROOT_DIR,
		undefined
	);
	return `${stdout.trimEnd()}\n`;
}

async function formatSchema(schemaText: string): Promise<string> {
	const stdout = await runCommand(
		['bunx', 'biome', 'format', '--stdin-file-path', CANONICAL_SCHEMA_PATH],
		REPO_DIR,
		schemaText
	);
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
	const generatedSchemaText = await generateSchema();
	validateSchema(generatedSchemaText);

	const schemaText = await formatSchema(generatedSchemaText);
	validateSchema(schemaText);

	await Promise.all(OUTPUT_PATHS.map((path) => writeGeneratedFile(path, schemaText)));

	console.log(`Generated agentuity.json schema at ${OUTPUT_PATHS.length} public paths.`);
}

main().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(message);
	process.exit(1);
});
