import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI_ROOT = resolve(import.meta.dir, '..', '..', '..');
const SRC_ENTRY = join(CLI_ROOT, 'src', 'main.ts');
const SERVER_ENTRY = join(CLI_ROOT, '..', 'server', 'dist', 'index.js');
const PROJECT_ID = 'proj_dry_run_test';

interface RecordedRequest {
	readonly method: string;
	readonly pathname: string;
}

interface CliRunResult {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
}

let configDir: string;
let server: ReturnType<typeof Bun.serve> | undefined;
let requests: RecordedRequest[];

beforeAll(async () => {
	if (existsSync(SERVER_ENTRY)) return;

	const build = Bun.spawn(['bun', 'run', 'build'], {
		cwd: CLI_ROOT,
		stdout: 'inherit',
		stderr: 'inherit',
	});
	const exitCode = await build.exited;
	if (exitCode !== 0) {
		throw new Error(`bun run build failed with exit code ${exitCode}`);
	}
});

beforeEach(async () => {
	configDir = await mkdtemp(join(tmpdir(), 'agentuity-project-delete-test-'));
	requests = [];
	server = Bun.serve({
		port: 0,
		fetch(request) {
			const url = new URL(request.url);
			requests.push({ method: request.method, pathname: url.pathname });

			if (request.method === 'GET' && url.pathname === `/cli/project/${PROJECT_ID}`) {
				return Response.json({
					success: true,
					data: {
						id: PROJECT_ID,
						name: 'Dry Run Test',
						orgId: 'org_test',
					},
				});
			}

			if (request.method === 'DELETE' && url.pathname === '/cli/project') {
				return Response.json({ success: true, data: [PROJECT_ID] });
			}

			return Response.json({ success: false, message: 'Not found' }, { status: 404 });
		},
	});
});

afterEach(async () => {
	server?.stop(true);
	server = undefined;
	await rm(configDir, { recursive: true, force: true });
});

async function runCLI(args: readonly string[]): Promise<CliRunResult> {
	if (!server) {
		throw new Error('Test server is not running');
	}

	const env: Record<string, string> = {
		AGENTUITY_AGENT_MODE: 'none',
		AGENTUITY_API_KEY: 'ag_test',
		AGENTUITY_API_URL: `http://127.0.0.1:${server.port}`,
		AGENTUITY_CONFIG_DIR: configDir,
		AGENTUITY_SKIP_VERSION_CHECK: '1',
	};
	if (process.env.HOME) env.HOME = process.env.HOME;
	if (process.env.PATH) env.PATH = process.env.PATH;
	if (process.env.TMPDIR) env.TMPDIR = process.env.TMPDIR;

	const proc = Bun.spawn(['bun', SRC_ENTRY, ...args], {
		cwd: configDir,
		env,
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const [exitCode, stdout, stderr] = await Promise.all([
		proc.exited,
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	return { exitCode, stdout, stderr };
}

describe('project delete command', () => {
	test('dry run resolves the project without deleting it', async () => {
		const result = await runCLI(['--dry-run', 'project', 'delete', PROJECT_ID, '--confirm']);

		expect(result).toEqual(expect.objectContaining({ exitCode: 0 }));
		expect(requests).toEqual([{ method: 'GET', pathname: `/cli/project/${PROJECT_ID}` }]);
		expect(result.stdout).toContain(
			`[DRY RUN] Would delete project: Dry Run Test (${PROJECT_ID})`
		);
		expect(result.stderr).toContain('[DRY RUN] Project deletion skipped');
	});

	test('dry run does not require deletion confirmation', async () => {
		const result = await runCLI(['--dry-run', 'project', 'delete', PROJECT_ID]);

		expect(result).toEqual(expect.objectContaining({ exitCode: 0 }));
		expect(result.stdout).toContain('[DRY RUN]');
		expect(result.stderr).not.toContain('no TTY and --confirm is false');
		expect(requests).toEqual([{ method: 'GET', pathname: `/cli/project/${PROJECT_ID}` }]);
	});
});
