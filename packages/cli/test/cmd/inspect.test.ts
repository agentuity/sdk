import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { command as inspectCommand } from '../../src/cmd/inspect.ts';
import { isInspectInvocation } from '../../src/local-delegate.ts';
import { extractCommandSchema } from '../../src/schema-generator.ts';

const CLI_ROOT = resolve(import.meta.dir, '..', '..');
const SRC_ENTRY = join(CLI_ROOT, 'src', 'main.ts');
const BIN_ENTRY = join(CLI_ROOT, 'bin', 'cli.js');
const DIST_ENTRY = join(CLI_ROOT, 'dist', 'main.js');

type Runtime = 'bun' | 'node';
const RUNTIMES: Runtime[] = ['bun', 'node'];

interface CliRunResult {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
}

/**
 * Minimal, explicit env for CLI subprocesses. Deliberately does NOT spread
 * `process.env` wholesale — a developer's real ~/.config/agentuity profile,
 * auth, or proxy settings must never leak into these fixtures. Every case
 * pins its own `AGENTUITY_CONFIG_DIR` to prove config independence (D1).
 */
function cliEnv(configDir: string): Record<string, string> {
	const env: Record<string, string> = {
		AGENTUITY_CONFIG_DIR: configDir,
		AGENTUITY_API_KEY: '',
		AGENTUITY_USER_ID: '',
		HTTP_PROXY: 'http://127.0.0.1:1',
		HTTPS_PROXY: 'http://127.0.0.1:1',
		// Otherwise the CLI's coding-agent detection fires when this test
		// itself runs under an agent (Claude Code, etc.) and prints an
		// unrelated "[agent] ..." hint to stderr, breaking the empty-stderr
		// assertions below.
		AGENTUITY_AGENT_MODE: 'none',
	};
	if (process.env.PATH) env.PATH = process.env.PATH;
	if (process.env.HOME) env.HOME = process.env.HOME;
	if (process.env.TMPDIR) env.TMPDIR = process.env.TMPDIR;
	return env;
}

async function runInspect(
	runtime: Runtime,
	directory: string,
	configDir: string
): Promise<CliRunResult> {
	const cmd =
		runtime === 'bun'
			? ['bun', SRC_ENTRY, '--json', 'inspect', '--dir', directory]
			: ['node', BIN_ENTRY, '--json', 'inspect', '--dir', directory];
	const proc = Bun.spawn(cmd, {
		cwd: directory,
		env: cliEnv(configDir),
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

function write(path: string, content: string): void {
	writeFileSync(path, content);
}

let root: string;
let emptyConfigDir: string;
let validConfigDir: string;
let malformedConfigDir: string;
let viteDir: string;
let genericDir: string;
let bareHtmlDir: string;
let customLaunchDir: string;
let nullTolerantLaunchDir: string;
let malformedLaunchDir: string;
let viteMalformedLaunchDir: string;
let monorepoRoot: string;
let monorepoMemberDir: string;
let tanstackDir: string;
let legacyDir: string;
let emptyProjectDir: string;

beforeAll(async () => {
	// Local-dev fallback: CI builds before running `bun run test`, but on a
	// clean checkout a developer running this file directly needs a full
	// build (dist/ JS *and* the copied templates) for the `node bin/cli.js`
	// runtime leg. Assets only need copying once, hence gated on dist being
	// absent rather than run unconditionally.
	if (!existsSync(DIST_ENTRY)) {
		const build = Bun.spawn(['bun', 'run', 'build'], {
			cwd: CLI_ROOT,
			stdout: 'inherit',
			stderr: 'inherit',
		});
		const code = await build.exited;
		if (code !== 0) throw new Error(`bun run build failed with exit code ${code}`);
	}

	// Always recompile incrementally, even when dist/ already exists: the
	// node leg must exercise current src/, never a dist left stale by
	// uncommitted edits made after the last full build. `tsc --build`
	// (no `--force`) is a ~1s no-op when nothing changed.
	const tscBuild = Bun.spawn(['bunx', 'tsc', '--build'], {
		cwd: CLI_ROOT,
		stdout: 'inherit',
		stderr: 'inherit',
	});
	const tscCode = await tscBuild.exited;
	if (tscCode !== 0) throw new Error(`tsc --build failed with exit code ${tscCode}`);

	root = mkdtempSync(join(tmpdir(), 'agentuity-inspect-test-'));

	emptyConfigDir = join(root, 'config-empty');
	mkdirSync(emptyConfigDir, { recursive: true });

	validConfigDir = join(root, 'config-valid');
	mkdirSync(validConfigDir, { recursive: true });
	write(join(validConfigDir, 'production.yaml'), 'name: default\n');

	// Same shape as the malformed profile finding this test guards against:
	// `overrides` must be an object, not a string.
	malformedConfigDir = join(root, 'config-malformed');
	mkdirSync(malformedConfigDir, { recursive: true });
	write(
		join(malformedConfigDir, 'production.yaml'),
		'name: default\noverrides: "this-should-be-an-object"\n'
	);

	viteDir = join(root, 'vite-app');
	mkdirSync(viteDir, { recursive: true });
	write(
		join(viteDir, 'package.json'),
		JSON.stringify({
			name: 'unlinked-vite-app',
			scripts: { dev: 'vite', build: 'vite build' },
			devDependencies: { vite: '^7.0.0' },
		})
	);

	genericDir = join(root, 'generic-app');
	mkdirSync(genericDir, { recursive: true });
	write(
		join(genericDir, 'package.json'),
		JSON.stringify({ name: 'generic-app', scripts: { build: 'tsc' } })
	);

	bareHtmlDir = join(root, 'bare-html');
	mkdirSync(bareHtmlDir, { recursive: true });
	write(join(bareHtmlDir, 'index.html'), '<!doctype html><title>hi</title>\n');

	customLaunchDir = join(root, 'custom-launch');
	mkdirSync(customLaunchDir, { recursive: true });
	write(
		join(customLaunchDir, 'launch.json'),
		JSON.stringify({ processes: [{ type: 'web', command: 'node server.js', default: true }] })
	);

	// JSON `null` on optional fields must behave as absent (F5), matching
	// the pre-Zod `?.` semantics these files relied on.
	nullTolerantLaunchDir = join(root, 'null-tolerant-launch');
	mkdirSync(nullTolerantLaunchDir, { recursive: true });
	write(
		join(nullTolerantLaunchDir, 'launch.json'),
		JSON.stringify({ processes: null, runtime: { port: null } })
	);

	// Structurally invalid but valid JSON: `processes` must be an array.
	malformedLaunchDir = join(root, 'malformed-launch');
	mkdirSync(malformedLaunchDir, { recursive: true });
	write(join(malformedLaunchDir, 'launch.json'), JSON.stringify({ processes: 'not-an-array' }));

	// Vite is matched by the framework database, so detection never reaches
	// the custom-launcher fallback that would otherwise be the only path
	// reading launch.json — this fixture guards the F2 preflight validation.
	viteMalformedLaunchDir = join(root, 'vite-malformed-launch');
	mkdirSync(viteMalformedLaunchDir, { recursive: true });
	write(
		join(viteMalformedLaunchDir, 'package.json'),
		JSON.stringify({
			name: 'vite-malformed-launch-app',
			scripts: { dev: 'vite', build: 'vite build' },
			devDependencies: { vite: '^7.0.0' },
		})
	);
	write(
		join(viteMalformedLaunchDir, 'launch.json'),
		JSON.stringify({ processes: 'not-an-array' })
	);

	monorepoRoot = join(root, 'monorepo');
	mkdirSync(monorepoRoot, { recursive: true });
	write(
		join(monorepoRoot, 'package.json'),
		JSON.stringify({ name: 'mono-root', private: true, workspaces: ['packages/*'] })
	);
	monorepoMemberDir = join(monorepoRoot, 'packages', 'app');
	mkdirSync(monorepoMemberDir, { recursive: true });
	write(
		join(monorepoMemberDir, 'package.json'),
		JSON.stringify({
			name: 'app',
			scripts: { dev: 'vite', build: 'vite build' },
			devDependencies: { vite: '^7.0.0' },
		})
	);

	tanstackDir = join(root, 'tanstack-start');
	mkdirSync(tanstackDir, { recursive: true });
	write(
		join(tanstackDir, 'package.json'),
		JSON.stringify({
			name: 'tanstack-start-app',
			dependencies: { '@tanstack/react-start': '^1.0.0' },
			scripts: { build: 'vite build' },
		})
	);

	legacyDir = join(root, 'agentuity-legacy');
	mkdirSync(legacyDir, { recursive: true });
	write(
		join(legacyDir, 'package.json'),
		JSON.stringify({
			name: 'legacy-app',
			scripts: { build: 'agentuity build', start: 'bun .agentuity/app.js' },
			dependencies: { '@agentuity/runtime': '^2.0.0' },
		})
	);

	emptyProjectDir = join(root, 'empty-project');
	mkdirSync(emptyProjectDir, { recursive: true });
}, 120_000);

afterAll(() => {
	rmSync(root, { recursive: true, force: true });
});

describe('isInspectInvocation', () => {
	test('bypasses local CLI delegation for inspect with --dir', () => {
		expect(isInspectInvocation(['--json', 'inspect', '--dir', '/tmp/whatever'])).toBe(true);
	});

	test('bypasses delegation when a profile is selected', () => {
		expect(isInspectInvocation(['--profile', 'work', '--json', 'inspect'])).toBe(true);
	});

	test('does not bypass delegation for another command using "inspect" as a value', () => {
		expect(isInspectInvocation(['build', '--dir', 'inspect'])).toBe(false);
	});
});

describe('inspect command definition', () => {
	test('declares no auth or project context', () => {
		expect(inspectCommand.requires).toBeUndefined();
		expect(inspectCommand.optional).toBeUndefined();
	});

	test('skips network update checks, auth-backed internal logging, and config load', () => {
		expect(inspectCommand.skipUpgradeCheck).toBe(true);
		expect(inspectCommand.skipInternalLogging).toBe(true);
		expect(inspectCommand.skipConfigLoad).toBe(true);
	});

	test('describes itself without mentioning Genesis', () => {
		expect(inspectCommand.description.toLowerCase()).not.toContain('genesis');
	});

	test('describes --dir as optional with the current directory default', () => {
		const schema = extractCommandSchema(inspectCommand);
		const dir = schema.options?.find((option) => option.name === 'dir');
		expect(dir?.required).toBe(false);
		expect(dir?.default).toBe('.');
	});

	test('response schema marks build/detectedServerEntry as detector-level facts', () => {
		const responseSchema = inspectCommand.schema?.response;
		expect(responseSchema).toBeDefined();
		const jsonSchema = z.toJSONSchema(responseSchema as z.ZodType) as {
			properties?: {
				commands?: { properties?: { build?: { description?: string } } };
				detectedServerEntry?: { description?: string };
			};
		};
		const buildDescription =
			jsonSchema.properties?.commands?.properties?.build?.description ?? '';
		const entryDescription = jsonSchema.properties?.detectedServerEntry?.description ?? '';
		expect(buildDescription).toContain('Detector-level');
		expect(buildDescription).toContain('not the final');
		expect(entryDescription).toContain('not the final launch entrypoint');
	});
});

for (const runtime of RUNTIMES) {
	describe(`agentuity --json inspect (${runtime})`, () => {
		test('vite fixture: happy path with a terminal-runnable build command', async () => {
			const { exitCode, stdout, stderr } = await runInspect(runtime, viteDir, emptyConfigDir);
			expect(stderr.trim()).toBe('');
			expect(exitCode).toBe(0);
			const result = JSON.parse(stdout);
			expect(result.schemaVersion).toBe(1);
			expect(result.framework).toBe('vite');
			expect(result.runtime).toBe('node');
			expect(result.detectedServerEntry).toBeNull();
			expect(result.commands.build).toEqual({ kind: 'command', command: 'vite build' });
			expect(result.monorepo).toBeNull();
			expect(result.confidence).toBe('high');
			expect(result.warnings).toEqual([]);
		}, 20_000);

		test('generic fixture: build classified as a package script', async () => {
			const { exitCode, stdout, stderr } = await runInspect(runtime, genericDir, emptyConfigDir);
			expect(stderr.trim()).toBe('');
			expect(exitCode).toBe(0);
			const result = JSON.parse(stdout);
			expect(result.framework).toBe('generic');
			expect(result.commands.build).toEqual({ kind: 'package-script', name: 'build' });
		}, 20_000);

		test('bare index.html: no build step, sentinel never leaks', async () => {
			const { exitCode, stdout, stderr } = await runInspect(
				runtime,
				bareHtmlDir,
				emptyConfigDir
			);
			expect(stderr.trim()).toBe('');
			expect(exitCode).toBe(0);
			expect(stdout).not.toContain('__agentuity_internal__');
			const result = JSON.parse(stdout);
			expect(result.commands.build).toBeNull();
		}, 20_000);

		test('valid custom launch.json: no build step, sentinel never leaks', async () => {
			const { exitCode, stdout, stderr } = await runInspect(
				runtime,
				customLaunchDir,
				emptyConfigDir
			);
			expect(stderr.trim()).toBe('');
			expect(exitCode).toBe(0);
			expect(stdout).not.toContain('__agentuity_internal__');
			const result = JSON.parse(stdout);
			expect(result.commands.build).toBeNull();
			expect(result.commands.start).toBe('node server.js');
		}, 20_000);

		test('launch.json with JSON null on optional fields: still accepted, no build step leaks', async () => {
			const { exitCode, stdout, stderr } = await runInspect(
				runtime,
				nullTolerantLaunchDir,
				emptyConfigDir
			);
			expect(stderr.trim()).toBe('');
			expect(exitCode).toBe(0);
			expect(stdout).not.toContain('__agentuity_internal__');
			const result = JSON.parse(stdout);
			expect(result.commands.build).toBeNull();
		}, 20_000);

		test('malformed launch.json: CONFIG_INVALID, never INTERNAL_ERROR', async () => {
			const { exitCode, stdout, stderr } = await runInspect(
				runtime,
				malformedLaunchDir,
				emptyConfigDir
			);
			expect(stdout.trim()).toBe('');
			expect(exitCode).toBe(10);
			expect(stderr).not.toContain('INTERNAL_ERROR');
			// A clean structured-error payload parses as a single JSON object;
			// a leaked stack trace or extra console output would break this.
			const error = JSON.parse(stderr);
			expect(error.error.code).toBe('CONFIG_INVALID');
			expect(error.error.exitCode).toBe(10);
			expect(error.error.message).toContain('processes');
		}, 20_000);

		test('vite fixture with malformed launch.json: still CONFIG_INVALID even though detection never reaches the custom-launcher fallback', async () => {
			const { exitCode, stdout, stderr } = await runInspect(
				runtime,
				viteMalformedLaunchDir,
				emptyConfigDir
			);
			expect(stdout.trim()).toBe('');
			expect(exitCode).toBe(10);
			expect(stderr).not.toContain('INTERNAL_ERROR');
			const error = JSON.parse(stderr);
			expect(error.error.code).toBe('CONFIG_INVALID');
			expect(error.error.exitCode).toBe(10);
			expect(error.error.message).toContain('processes');
		}, 20_000);

		test('custom launch.json without a `default` field is still accepted', async () => {
			const dir = join(root, `launch-no-default-${runtime}`);
			mkdirSync(dir, { recursive: true });
			write(
				join(dir, 'launch.json'),
				JSON.stringify({ processes: [{ type: 'web', command: 'node server.js' }] })
			);
			const { exitCode, stdout, stderr } = await runInspect(runtime, dir, emptyConfigDir);
			expect(stderr.trim()).toBe('');
			expect(exitCode).toBe(0);
			const result = JSON.parse(stdout);
			expect(result.commands.start).toBe('node server.js');
		}, 20_000);

		test('monorepo member: monorepo block populated', async () => {
			const { exitCode, stdout, stderr } = await runInspect(
				runtime,
				monorepoMemberDir,
				emptyConfigDir
			);
			expect(stderr.trim()).toBe('');
			expect(exitCode).toBe(0);
			const result = JSON.parse(stdout);
			expect(result.monorepo).not.toBeNull();
			expect(result.monorepo.root).toBe(monorepoRoot);
			expect(result.monorepo.workingDirectory).toBe('packages/app');
			expect(result.monorepo.packageManager).toBe('npm');
		}, 20_000);

		test('tanstack-start fixture: framework detected with a Nitro warning', async () => {
			const { exitCode, stdout, stderr } = await runInspect(
				runtime,
				tanstackDir,
				emptyConfigDir
			);
			expect(stderr.trim()).toBe('');
			expect(exitCode).toBe(0);
			const result = JSON.parse(stdout);
			expect(result.framework).toBe('tanstack-start');
			expect(result.confidence).toBe('high');
			expect(result.warnings.some((w: string) => w.includes('Nitro'))).toBe(true);
		}, 20_000);

		test('agentuity-legacy fixture', async () => {
			const { exitCode, stdout, stderr } = await runInspect(runtime, legacyDir, emptyConfigDir);
			expect(stderr.trim()).toBe('');
			expect(exitCode).toBe(0);
			const result = JSON.parse(stdout);
			expect(result.framework).toBe('agentuity-legacy');
			expect(result.port).toBe(3000);
			expect(result.confidence).toBe('high');
			expect(result.warnings.some((w: string) => w.includes('@agentuity/cli'))).toBe(true);
		}, 20_000);

		test('empty directory: PROJECT_NOT_FOUND on stderr, exit 12', async () => {
			const { exitCode, stdout, stderr } = await runInspect(
				runtime,
				emptyProjectDir,
				emptyConfigDir
			);
			expect(stdout.trim()).toBe('');
			expect(exitCode).toBe(12);
			const error = JSON.parse(stderr);
			expect(error.error.code).toBe('PROJECT_NOT_FOUND');
			expect(error.error.exitCode).toBe(12);
			expect(error.error.message).toContain(emptyProjectDir);
		}, 20_000);

		test('config independence: identical JSON whether the profile config is absent, valid, or malformed', async () => {
			const [empty, valid, malformed] = await Promise.all([
				runInspect(runtime, viteDir, emptyConfigDir),
				runInspect(runtime, viteDir, validConfigDir),
				runInspect(runtime, viteDir, malformedConfigDir),
			]);
			for (const run of [empty, valid, malformed]) {
				expect(run.stderr.trim()).toBe('');
				expect(run.exitCode).toBe(0);
			}
			expect(valid.stdout).toBe(empty.stdout);
			expect(malformed.stdout).toBe(empty.stdout);
		}, 30_000);
	});
}
