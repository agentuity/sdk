#!/usr/bin/env bun

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { command } from '../src/cmd/inspect.ts';
import { isInspectInvocation } from '../src/local-delegate.ts';

const testDir = join(tmpdir(), `agentuity-inspect-${process.pid}-${Date.now()}`);
mkdirSync(testDir, { recursive: true });

const cliPath = join(import.meta.dir, '..', 'src', 'main.ts');
const cliEnv = {
	...process.env,
	AGENTUITY_AGENT_MODE: 'none',
	AGENTUITY_API_KEY: '',
	AGENTUITY_USER_ID: '',
	HTTPS_PROXY: 'http://127.0.0.1:1',
	HTTP_PROXY: 'http://127.0.0.1:1',
};

type InspectResult = {
	readonly schemaVersion: number;
	readonly framework: string;
	readonly runtime: string;
	readonly packageManager: string;
	readonly entrypoints: readonly string[];
	readonly commands: {
		readonly dev: string | null;
		readonly build: string;
		readonly start: string | null;
	};
	readonly port: number | null;
	readonly confidence: 'high' | 'medium' | 'low';
	readonly warnings: readonly string[];
	readonly monorepo: unknown;
};

async function runInspect(directory: string): Promise<{
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
}> {
	const cli = Bun.spawn(['bun', cliPath, '--json', 'inspect', '--dir', directory], {
		cwd: directory,
		env: cliEnv,
		stdout: 'pipe',
		stderr: 'pipe',
		timeout: 15_000,
	});
	const [exitCode, stdout, stderr] = await Promise.all([
		cli.exited,
		new Response(cli.stdout).text(),
		new Response(cli.stderr).text(),
	]);
	return { exitCode, stdout, stderr };
}

async function inspectFixture(
	directory: string,
	packageJson: Readonly<Record<string, unknown>>
): Promise<InspectResult> {
	mkdirSync(directory, { recursive: true });
	writeFileSync(join(directory, 'package.json'), JSON.stringify(packageJson));
	const { exitCode, stdout, stderr } = await runInspect(directory);
	if (exitCode !== 0) {
		throw new Error(`inspect exited ${exitCode}: ${stderr}`);
	}
	if (stderr.trim()) {
		throw new Error(`inspect wrote to stderr: ${stderr}`);
	}
	return JSON.parse(stdout) as InspectResult;
}

try {
	if (command.requires || command.optional) {
		throw new Error('inspect must not declare auth or project context');
	}
	if (!command.skipUpgradeCheck || !command.skipInternalLogging) {
		throw new Error('inspect must skip network update checks and auth-backed internal logging');
	}
	if (!isInspectInvocation(['--json', 'inspect', '--dir', testDir])) {
		throw new Error('inspect must bypass local CLI installation and delegation');
	}
	if (!isInspectInvocation(['--profile', 'work', '--json', 'inspect'])) {
		throw new Error('inspect must bypass delegation when a profile is selected');
	}
	if (isInspectInvocation(['build', '--dir', 'inspect'])) {
		throw new Error('an inspect directory value must not bypass delegation for another command');
	}

	const result = await inspectFixture(testDir, {
		name: 'unlinked-vite-app',
		scripts: { dev: 'vite', build: 'vite build' },
		devDependencies: { vite: '^7.0.0' },
	});

	if (result.schemaVersion !== 1) {
		throw new Error(`expected schema version 1, got ${result.schemaVersion}`);
	}
	if (result.framework !== 'vite') throw new Error(`expected vite, got ${result.framework}`);
	if (result.runtime !== 'node') throw new Error(`expected node, got ${result.runtime}`);
	if (result.commands.dev !== 'vite')
		throw new Error(`unexpected dev command: ${result.commands.dev}`);
	if (result.commands.build !== 'vite build') {
		throw new Error(`unexpected build command: ${result.commands.build}`);
	}
	if (result.monorepo !== null) throw new Error('standalone project must not report a monorepo');
	if (result.port !== null) throw new Error(`expected null port for vite, got ${result.port}`);
	if (result.confidence !== 'high') {
		throw new Error(`expected high confidence for vite, got ${result.confidence}`);
	}
	if (result.warnings.length !== 0) {
		throw new Error(`expected no warnings for vite, got ${JSON.stringify(result.warnings)}`);
	}

	const tanstackDir = join(testDir, 'tanstack-start');
	const tanstackResult = await inspectFixture(tanstackDir, {
		name: 'tanstack-start-app',
		dependencies: { '@tanstack/react-start': '^1.0.0' },
		scripts: { build: 'vite build' },
	});
	if (tanstackResult.framework !== 'tanstack-start') {
		throw new Error(`expected tanstack-start, got ${tanstackResult.framework}`);
	}
	if (tanstackResult.confidence !== 'high') {
		throw new Error(
			`expected high confidence for tanstack-start, got ${tanstackResult.confidence}`
		);
	}
	if (!tanstackResult.warnings.some((warning) => warning.includes('Nitro'))) {
		throw new Error(`expected Nitro warning, got ${JSON.stringify(tanstackResult.warnings)}`);
	}

	const legacyDir = join(testDir, 'agentuity-legacy');
	const legacyResult = await inspectFixture(legacyDir, {
		name: 'legacy-app',
		scripts: { build: 'agentuity build', start: 'bun .agentuity/app.js' },
		dependencies: { '@agentuity/runtime': '^2.0.0' },
	});
	if (legacyResult.framework !== 'agentuity-legacy') {
		throw new Error(`expected agentuity-legacy, got ${legacyResult.framework}`);
	}
	if (legacyResult.port !== 3000) {
		throw new Error(`expected port 3000 for agentuity-legacy, got ${legacyResult.port}`);
	}
	if (legacyResult.confidence !== 'high') {
		throw new Error(
			`expected high confidence for agentuity-legacy, got ${legacyResult.confidence}`
		);
	}
	if (!legacyResult.warnings.some((warning) => warning.includes('@agentuity/cli'))) {
		throw new Error(`expected CLI warning, got ${JSON.stringify(legacyResult.warnings)}`);
	}

	const emptyDir = join(testDir, 'empty');
	mkdirSync(emptyDir);
	const {
		exitCode: invalidExitCode,
		stdout: invalidStdout,
		stderr: invalidStderr,
	} = await runInspect(emptyDir);
	if (invalidExitCode !== 12) {
		throw new Error(`empty directory inspect exited ${invalidExitCode}: ${invalidStderr}`);
	}
	if (invalidStdout.trim()) {
		throw new Error(`empty directory inspect wrote to stdout: ${invalidStdout}`);
	}
	const invalidResult = JSON.parse(invalidStderr) as {
		error?: { code?: string; message?: string; exitCode?: number };
	};
	if (
		invalidResult.error?.code !== 'PROJECT_NOT_FOUND' ||
		invalidResult.error.exitCode !== 12 ||
		!invalidResult.error.message?.includes(emptyDir)
	) {
		throw new Error(`unexpected empty directory error: ${invalidStderr}`);
	}

	console.log('inspect passed without auth, agentuity.json, or a linked cloud project');
} finally {
	rmSync(testDir, { recursive: true, force: true });
}
