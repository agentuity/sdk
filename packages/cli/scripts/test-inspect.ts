#!/usr/bin/env bun

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { command } from '../src/cmd/inspect.ts';
import { isInspectInvocation } from '../src/local-delegate.ts';

const testDir = join(tmpdir(), `agentuity-inspect-${process.pid}-${Date.now()}`);
mkdirSync(testDir, { recursive: true });

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
	if (isInspectInvocation(['build', '--dir', 'inspect'])) {
		throw new Error('an inspect directory value must not bypass delegation for another command');
	}

	const cli = Bun.spawn(
		['bun', join(import.meta.dir, '..', 'src', 'main.ts'), '--json', 'inspect', '--dir', testDir],
		{
			cwd: testDir,
			env: {
				...process.env,
				AGENTUITY_AGENT_MODE: 'none',
				AGENTUITY_API_KEY: '',
				AGENTUITY_USER_ID: '',
				HTTPS_PROXY: 'http://127.0.0.1:1',
				HTTP_PROXY: 'http://127.0.0.1:1',
			},
			stdout: 'pipe',
			stderr: 'pipe',
		}
	);

	const [exitCode, stdout, stderr] = await Promise.all([
		cli.exited,
		new Response(cli.stdout).text(),
		new Response(cli.stderr).text(),
	]);

	if (exitCode !== 0) {
		throw new Error(`inspect exited ${exitCode}: ${stderr}`);
	}
	if (stderr.trim()) {
		throw new Error(`inspect wrote to stderr: ${stderr}`);
	}

	const result = JSON.parse(stdout) as {
		framework: string;
		runtime: string;
		packageManager: string;
		entrypoints: string[];
		commands: { dev: string | null; build: string; start: string | null };
		monorepo: unknown;
	};

	if (result.framework !== 'vite') throw new Error(`expected vite, got ${result.framework}`);
	if (result.commands.dev !== 'vite')
		throw new Error(`unexpected dev command: ${result.commands.dev}`);
	if (result.commands.build !== 'vite build') {
		throw new Error(`unexpected build command: ${result.commands.build}`);
	}
	if (result.monorepo !== null) throw new Error('standalone project must not report a monorepo');

	console.log('inspect command passed offline, unlinked Vite project test');
} finally {
	rmSync(testDir, { recursive: true, force: true });
}
