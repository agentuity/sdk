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
	});
	const [exitCode, stdout, stderr] = await Promise.all([
		cli.exited,
		new Response(cli.stdout).text(),
		new Response(cli.stderr).text(),
	]);
	return { exitCode, stdout, stderr };
}

try {
	writeFileSync(
		join(testDir, 'package.json'),
		JSON.stringify({
			name: 'unlinked-vite-app',
			scripts: { dev: 'vite', build: 'vite build' },
			devDependencies: { vite: '^7.0.0' },
		})
	);

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

	const { exitCode, stdout, stderr } = await runInspect(testDir);

	if (exitCode !== 0) {
		throw new Error(`inspect exited ${exitCode}: ${stderr}`);
	}
	if (stderr.trim()) {
		throw new Error(`inspect wrote to stderr: ${stderr}`);
	}

	const result = JSON.parse(stdout) as {
		schemaVersion: number;
		framework: string;
		runtime: string;
		packageManager: string;
		entrypoints: string[];
		commands: { dev: string | null; build: string; start: string | null };
		monorepo: unknown;
	};

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
