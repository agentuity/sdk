import type { Logger } from '@agentuity/core';
import { spawn } from 'bun';
import { mkdir, mkdtemp, readdir, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ErrorCode } from '../../errors';
import * as tui from '../../tui';

export interface CIBuildOptions {
	url: string;
	directory?: string;
	trigger?: string;
	event?: string;
	message?: string;
	commit?: string;
	commitUrl?: string;
	branch?: string;
	repo?: string;
	provider?: string;
	pullRequestNumber?: number;
	pullRequestUrl?: string;
	logsUrl?: string;
}

async function streamProcessOutput(proc: ReturnType<typeof spawn>): Promise<void> {
	const forwardStream = async (
		stream: ReadableStream<Uint8Array> | number | undefined,
		isStderr: boolean
	) => {
		if (typeof stream === 'number') return;
		if (!stream) return;
		const reader = stream.getReader();
		const target = isStderr ? process.stderr : process.stdout;

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			target.write(value);
		}
	};

	await Promise.all([
		forwardStream(proc.stdout, false),
		forwardStream(proc.stderr, true),
		proc.exited,
	]);
}

async function runCommand(cmd: string[], cwd: string): Promise<number> {
	const proc = spawn({
		cmd,
		cwd,
		env: { ...process.env, CI: 'true' },
		stdin: 'ignore',
		stdout: 'pipe',
		stderr: 'pipe',
	});

	await streamProcessOutput(proc);
	return proc.exitCode ?? 1;
}

async function downloadSource(url: string, targetPath: string): Promise<void> {
	let lastError: unknown;

	for (let attempt = 1; attempt <= 3; attempt++) {
		try {
			const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
			if (!response.ok) {
				throw new Error(`Download failed with status ${response.status}`);
			}

			await Bun.write(targetPath, await response.arrayBuffer());
			return;
		} catch (error) {
			lastError = error;
			if (attempt < 3) {
				tui.info(`Download failed (attempt ${attempt}/3), retrying...`);
			}
		}
	}

	throw lastError instanceof Error ? lastError : new Error('Download failed');
}

function buildDeployArgs(opts: CIBuildOptions): string[] {
	const args: string[] = [];

	if (opts.trigger) args.push('--trigger', opts.trigger);
	if (opts.event) args.push('--event', opts.event);
	if (opts.message) args.push('--message', opts.message);
	if (opts.commit) args.push('--commit', opts.commit);
	if (opts.commitUrl) args.push('--commit-url', opts.commitUrl);
	if (opts.branch) args.push('--branch', opts.branch);
	if (opts.repo) args.push('--repo', opts.repo);
	if (opts.provider) args.push('--provider', opts.provider);
	if (opts.pullRequestNumber !== undefined) {
		args.push('--pull-request-number', String(opts.pullRequestNumber));
	}
	if (opts.pullRequestUrl) args.push('--pull-request-url', opts.pullRequestUrl);
	if (opts.logsUrl) args.push('--logs-url', opts.logsUrl);

	return args;
}

export async function runCIBuild(opts: CIBuildOptions, _logger: Logger): Promise<void> {
	let tempDir = '';

	try {
		tempDir = await mkdtemp(join(tmpdir(), 'agentuity-ci-build-'));
		const sourceZipPath = join(tempDir, 'source.zip');
		const extractPath = join(tempDir, 'build');

		tui.info('1️⃣ Downloading source code from GitHub...');
		await downloadSource(opts.url, sourceZipPath);

		tui.info('2️⃣ Unzipping source code from GitHub...');
		await mkdir(extractPath, { recursive: true });
		const unzipExit = await runCommand(
			['unzip', '-q', sourceZipPath, '-d', extractPath],
			tempDir
		);
		if (unzipExit !== 0 && unzipExit !== 1) {
			tui.fatal(`Failed to unzip source archive (exit ${unzipExit})`, ErrorCode.BUILD_FAILED);
		}

		const extractedEntries = await readdir(extractPath, { withFileTypes: true });
		const extractedDirs = extractedEntries.filter((entry) => entry.isDirectory());
		if (extractedDirs.length !== 1) {
			tui.fatal(
				`Expected one root directory after unzip, found ${extractedDirs.length}`,
				ErrorCode.BUILD_FAILED
			);
		}

		const sourceRoot = extractedDirs.at(0);
		if (!sourceRoot) {
			tui.fatal('Could not determine extracted source directory', ErrorCode.BUILD_FAILED);
		}

		const sourceRootDir = join(extractPath, sourceRoot.name);
		let projectDir = sourceRootDir;
		if (opts.directory) {
			projectDir = join(sourceRootDir, opts.directory);
		}

		const projectStats = await stat(projectDir).catch(() => null);
		if (!projectStats?.isDirectory()) {
			tui.fatal(`Build directory not found: ${projectDir}`, ErrorCode.CONFIG_INVALID);
		}

		// Resolve symlinks and verify the project dir is within the source root
		const realProjectDir = await realpath(projectDir).catch(() => null);
		const realSourceRoot = await realpath(sourceRootDir).catch(() => null);
		if (!realProjectDir || !realSourceRoot || !realProjectDir.startsWith(realSourceRoot)) {
			tui.fatal(
				'Directory path escapes the source root (path traversal denied)',
				ErrorCode.CONFIG_INVALID
			);
		}
		projectDir = realProjectDir;

		const sdkKey = process.env.AGENTUITY_SDK_KEY;
		if (sdkKey) {
			await Bun.write(join(projectDir, '.env'), `AGENTUITY_SDK_KEY=${sdkKey}\n`);
		}

		tui.info('3️⃣ Installing your project dependencies...');
		const installExit = await runCommand(['bun', 'install'], projectDir);
		if (installExit !== 0) {
			tui.fatal(`Dependency installation failed (exit ${installExit})`, ErrorCode.BUILD_FAILED);
		}

		const packageJsonPath = join(projectDir, 'package.json');
		const packageJsonFile = Bun.file(packageJsonPath);
		let scripts: Record<string, string> | undefined;
		if (await packageJsonFile.exists()) {
			const packageJson = (await packageJsonFile.json()) as {
				scripts?: Record<string, string>;
			};
			scripts = packageJson.scripts;
		}

		if (scripts?.predeploy) {
			tui.info('🔧 Running predeploy script...');
			const predeployExit = await runCommand(['bun', 'run', '--bun', 'predeploy'], projectDir);
			if (predeployExit !== 0) {
				tui.fatal(`Predeploy failed (exit ${predeployExit})`, ErrorCode.BUILD_FAILED);
			}
		}

		tui.info('4️⃣ Deploying your project...');
		// Use the locally installed CLI binary instead of bunx to avoid
		// bunx resolution crashes on certain Bun versions (e.g. arm64 segfaults)
		const localCliBin = join(projectDir, 'node_modules', '.bin', 'agentuity');
		const cliExists = await stat(localCliBin).catch(() => null);
		const deployCmd = cliExists
			? ['bun', localCliBin, 'deploy', ...buildDeployArgs(opts)]
			: ['bunx', '--bun', 'agentuity', 'deploy', ...buildDeployArgs(opts)];
		tui.info(`Using CLI: ${cliExists ? localCliBin : 'bunx --bun agentuity'}`);
		const deployExit = await runCommand(deployCmd, projectDir);
		if (deployExit !== 0) {
			tui.fatal(`Deploy failed (exit ${deployExit})`, ErrorCode.BUILD_FAILED);
		}

		if (scripts?.postdeploy) {
			tui.info('🔧 Running postdeploy script...');
			const postdeployExit = await runCommand(['bun', 'run', '--bun', 'postdeploy'], projectDir);
			if (postdeployExit !== 0) {
				tui.fatal(`Postdeploy failed (exit ${postdeployExit})`, ErrorCode.BUILD_FAILED);
			}
		}

		tui.success('✅ Your project has been built...');
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		tui.fatal(`CI build failed: ${message}`, ErrorCode.BUILD_FAILED);
	} finally {
		if (tempDir) {
			await rm(tempDir, { recursive: true, force: true });
		}
	}
}
