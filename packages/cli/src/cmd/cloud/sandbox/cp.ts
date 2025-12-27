import { z } from 'zod';
import { readFileSync, writeFileSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { dirname, resolve, basename, join, relative } from 'node:path';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createSandboxClient } from './util';
import { getCommand } from '../../../command-prefix';
import { sandboxExecute, executionGet, type APIClient } from '@agentuity/server';
import type { Logger } from '@agentuity/core';

const POLL_INTERVAL_MS = 500;
const MAX_POLL_ATTEMPTS = 600;

interface ParsedPath {
	sandboxId: string | null;
	path: string;
}

function parsePath(pathArg: string): ParsedPath {
	const colonIndex = pathArg.indexOf(':');
	if (colonIndex === -1) {
		return { sandboxId: null, path: pathArg };
	}
	const prefix = pathArg.slice(0, colonIndex);
	const path = pathArg.slice(colonIndex + 1);
	if (prefix.startsWith('snbx_') || prefix.startsWith('sbx_')) {
		return { sandboxId: prefix, path };
	}
	return { sandboxId: null, path: pathArg };
}

const SandboxCpResponseSchema = z.object({
	source: z.string().describe('Source path'),
	destination: z.string().describe('Destination path'),
	bytesTransferred: z.number().describe('Number of bytes transferred'),
	filesTransferred: z.number().describe('Number of files transferred'),
});

export const cpSubcommand = createCommand({
	name: 'cp',
	aliases: ['copy'],
	description: 'Copy files or directories to or from a sandbox',
	tags: ['slow', 'requires-auth'],
	requires: { auth: true, region: true, org: true },
	examples: [
		{
			command: getCommand('cloud sandbox cp ./local-file.txt snbx_abc123:/path/to/file.txt'),
			description: 'Copy a local file to a sandbox',
		},
		{
			command: getCommand('cloud sandbox cp snbx_abc123:/path/to/file.txt ./local-file.txt'),
			description: 'Copy a file from a sandbox to local',
		},
		{
			command: getCommand('cloud sandbox cp --recursive ./local-dir snbx_abc123:/path/to/dir'),
			description: 'Copy a local directory to a sandbox recursively',
		},
		{
			command: getCommand('cloud sandbox cp -r snbx_abc123:/path/to/dir ./local-dir'),
			description: 'Copy a directory from a sandbox to local recursively',
		},
	],
	schema: {
		args: z.object({
			source: z.string().describe('Source path (local path or sandboxId:/remote/path)'),
			destination: z
				.string()
				.describe('Destination path (local path or sandboxId:/remote/path)'),
		}),
		options: z.object({
			timeout: z.string().optional().describe('Operation timeout (e.g., "5m", "1h")'),
			recursive: z.boolean().default(false).optional().describe('Copy directories recursively'),
		}),
		aliases: {
			recursive: ['r'],
		},
		response: SandboxCpResponseSchema,
	},

	async handler(ctx) {
		const { args, opts, options, auth, region, logger, orgId } = ctx;

		const source = parsePath(args.source);
		const destination = parsePath(args.destination);

		if (source.sandboxId && destination.sandboxId) {
			logger.fatal(
				'Cannot copy between two sandboxes. Use a local path as source or destination.'
			);
		}

		if (!source.sandboxId && !destination.sandboxId) {
			logger.fatal(
				'At least one path must include a sandbox ID (e.g., snbx_abc123:/path/to/file)'
			);
		}

		const client = createSandboxClient(logger, auth, region);
		const recursive = opts.recursive ?? false;

		if (source.sandboxId) {
			return await downloadFromSandbox(
				client,
				logger,
				orgId,
				source.sandboxId,
				source.path,
				destination.path,
				opts.timeout,
				recursive,
				options.json ?? false
			);
		} else {
			return await uploadToSandbox(
				client,
				logger,
				orgId,
				destination.sandboxId!,
				source.path,
				destination.path,
				opts.timeout,
				recursive,
				options.json ?? false
			);
		}
	},
});

function getAllFiles(dirPath: string, basePath: string = dirPath): string[] {
	const files: string[] = [];
	const entries = readdirSync(dirPath, { withFileTypes: true });

	for (const entry of entries) {
		const fullPath = join(dirPath, entry.name);
		if (entry.isDirectory()) {
			files.push(...getAllFiles(fullPath, basePath));
		} else if (entry.isFile()) {
			files.push(fullPath);
		}
	}

	return files;
}

async function uploadToSandbox(
	client: APIClient,
	logger: Logger,
	orgId: string,
	sandboxId: string,
	localPath: string,
	remotePath: string,
	timeout: string | undefined,
	recursive: boolean,
	jsonOutput: boolean
): Promise<z.infer<typeof SandboxCpResponseSchema>> {
	const resolvedPath = resolve(localPath);

	if (!(await Bun.file(resolvedPath).exists())) {
		const stat = statSync(resolvedPath, { throwIfNoEntry: false });
		if (!stat) {
			logger.fatal(`Local path not found: ${localPath}`);
		}
	}

	const stat = statSync(resolvedPath);

	if (stat.isDirectory()) {
		if (!recursive) {
			logger.fatal(`${localPath} is a directory. Use -r/--recursive to copy directories.`);
		}
		return await uploadDirectory(
			client,
			logger,
			orgId,
			sandboxId,
			resolvedPath,
			remotePath,
			timeout,
			jsonOutput
		);
	}

	return await uploadSingleFile(
		client,
		logger,
		orgId,
		sandboxId,
		resolvedPath,
		localPath,
		remotePath,
		timeout,
		jsonOutput
	);
}

async function uploadSingleFile(
	client: APIClient,
	logger: Logger,
	orgId: string,
	sandboxId: string,
	resolvedPath: string,
	displayPath: string,
	remotePath: string,
	timeout: string | undefined,
	jsonOutput: boolean
): Promise<z.infer<typeof SandboxCpResponseSchema>> {
	const buffer = readFileSync(resolvedPath);
	const base64Content = buffer.toString('base64');

	let targetPath = remotePath;
	if (remotePath.endsWith('/')) {
		targetPath = remotePath + basename(resolvedPath);
	}

	const files: Record<string, string> = {
		[targetPath]: base64Content,
	};

	const execution = await sandboxExecute(client, {
		sandboxId,
		options: {
			command: ['true'],
			files,
			timeout,
		},
		orgId,
	});

	await waitForExecution(client, orgId, execution.executionId, logger);

	if (!jsonOutput) {
		tui.success(`Copied ${displayPath} → ${sandboxId}:${targetPath} (${buffer.length} bytes)`);
	}

	return {
		source: displayPath,
		destination: `${sandboxId}:${targetPath}`,
		bytesTransferred: buffer.length,
		filesTransferred: 1,
	};
}

async function uploadDirectory(
	client: APIClient,
	logger: Logger,
	orgId: string,
	sandboxId: string,
	localDir: string,
	remotePath: string,
	timeout: string | undefined,
	jsonOutput: boolean
): Promise<z.infer<typeof SandboxCpResponseSchema>> {
	const allFiles = getAllFiles(localDir);

	if (allFiles.length === 0) {
		logger.fatal(`Directory is empty: ${localDir}`);
	}

	const files: Record<string, string> = {};
	let totalBytes = 0;
	const baseRemotePath = remotePath.endsWith('/') ? remotePath.slice(0, -1) : remotePath;

	for (const filePath of allFiles) {
		const relativePath = relative(localDir, filePath);
		const targetPath = `${baseRemotePath}/${relativePath}`;
		const buffer = readFileSync(filePath);
		files[targetPath] = buffer.toString('base64');
		totalBytes += buffer.length;
	}

	const execution = await sandboxExecute(client, {
		sandboxId,
		options: {
			command: ['true'],
			files,
			timeout,
		},
		orgId,
	});

	await waitForExecution(client, orgId, execution.executionId, logger);

	if (!jsonOutput) {
		tui.success(
			`Copied ${localDir} → ${sandboxId}:${baseRemotePath} (${allFiles.length} files, ${totalBytes} bytes)`
		);
	}

	return {
		source: localDir,
		destination: `${sandboxId}:${baseRemotePath}`,
		bytesTransferred: totalBytes,
		filesTransferred: allFiles.length,
	};
}

async function downloadFromSandbox(
	client: APIClient,
	logger: Logger,
	orgId: string,
	sandboxId: string,
	remotePath: string,
	localPath: string,
	timeout: string | undefined,
	recursive: boolean,
	jsonOutput: boolean
): Promise<z.infer<typeof SandboxCpResponseSchema>> {
	if (recursive) {
		return await downloadDirectory(
			client,
			logger,
			orgId,
			sandboxId,
			remotePath,
			localPath,
			timeout,
			jsonOutput
		);
	}

	return await downloadSingleFile(
		client,
		logger,
		orgId,
		sandboxId,
		remotePath,
		localPath,
		timeout,
		jsonOutput
	);
}

async function downloadSingleFile(
	client: APIClient,
	logger: Logger,
	orgId: string,
	sandboxId: string,
	remotePath: string,
	localPath: string,
	timeout: string | undefined,
	jsonOutput: boolean
): Promise<z.infer<typeof SandboxCpResponseSchema>> {
	const execution = await sandboxExecute(client, {
		sandboxId,
		options: {
			command: ['base64', '-w', '0', remotePath],
			timeout,
		},
		orgId,
	});

	const outputChunks: Buffer[] = [];

	if (execution.stdoutStreamUrl) {
		await streamToBuffer(execution.stdoutStreamUrl, outputChunks, logger);
	}

	await waitForExecution(client, orgId, execution.executionId, logger);

	const base64Output = Buffer.concat(outputChunks).toString('utf-8').trim();

	if (!base64Output) {
		logger.fatal(`Failed to read file from sandbox: ${remotePath}`);
	}

	const buffer = Buffer.from(base64Output, 'base64');

	let targetPath = localPath;
	if (localPath.endsWith('/') || localPath === '.') {
		targetPath = resolve(localPath, basename(remotePath));
	} else {
		targetPath = resolve(localPath);
	}

	const dir = dirname(targetPath);
	mkdirSync(dir, { recursive: true });

	writeFileSync(targetPath, buffer);

	if (!jsonOutput) {
		tui.success(`Copied ${sandboxId}:${remotePath} → ${targetPath} (${buffer.length} bytes)`);
	}

	return {
		source: `${sandboxId}:${remotePath}`,
		destination: targetPath,
		bytesTransferred: buffer.length,
		filesTransferred: 1,
	};
}

async function downloadDirectory(
	client: APIClient,
	logger: Logger,
	orgId: string,
	sandboxId: string,
	remotePath: string,
	localPath: string,
	timeout: string | undefined,
	jsonOutput: boolean
): Promise<z.infer<typeof SandboxCpResponseSchema>> {
	const listExecution = await sandboxExecute(client, {
		sandboxId,
		options: {
			command: ['find', remotePath, '-type', 'f'],
			timeout,
		},
		orgId,
	});

	const listChunks: Buffer[] = [];
	if (listExecution.stdoutStreamUrl) {
		await streamToBuffer(listExecution.stdoutStreamUrl, listChunks, logger);
	}

	await waitForExecution(client, orgId, listExecution.executionId, logger);

	const fileList = Buffer.concat(listChunks)
		.toString('utf-8')
		.trim()
		.split('\n')
		.filter((f) => f.length > 0);

	if (fileList.length === 0) {
		logger.fatal(`No files found in directory: ${remotePath}`);
	}

	const baseRemotePath = remotePath.endsWith('/') ? remotePath.slice(0, -1) : remotePath;
	const baseLocalPath = resolve(localPath);
	let totalBytes = 0;

	for (const remoteFile of fileList) {
		const relativePath = remoteFile.startsWith(baseRemotePath + '/')
			? remoteFile.slice(baseRemotePath.length + 1)
			: basename(remoteFile);

		const localFilePath = join(baseLocalPath, relativePath);

		const execution = await sandboxExecute(client, {
			sandboxId,
			options: {
				command: ['base64', '-w', '0', remoteFile],
				timeout,
			},
			orgId,
		});

		const outputChunks: Buffer[] = [];
		if (execution.stdoutStreamUrl) {
			await streamToBuffer(execution.stdoutStreamUrl, outputChunks, logger);
		}

		await waitForExecution(client, orgId, execution.executionId, logger);

		const base64Output = Buffer.concat(outputChunks).toString('utf-8').trim();
		if (!base64Output) {
			logger.warn(`Failed to read file: ${remoteFile}, skipping`);
			continue;
		}

		const buffer = Buffer.from(base64Output, 'base64');
		totalBytes += buffer.length;

		const dir = dirname(localFilePath);
		mkdirSync(dir, { recursive: true });
		writeFileSync(localFilePath, buffer);

		if (!jsonOutput) {
			logger.info(`Downloaded ${remoteFile} (${buffer.length} bytes)`);
		}
	}

	if (!jsonOutput) {
		tui.success(
			`Copied ${sandboxId}:${baseRemotePath} → ${baseLocalPath} (${fileList.length} files, ${totalBytes} bytes)`
		);
	}

	return {
		source: `${sandboxId}:${baseRemotePath}`,
		destination: baseLocalPath,
		bytesTransferred: totalBytes,
		filesTransferred: fileList.length,
	};
}

async function waitForExecution(
	client: APIClient,
	orgId: string,
	executionId: string,
	logger: Logger
): Promise<void> {
	let attempts = 0;

	while (attempts < MAX_POLL_ATTEMPTS) {
		await sleep(POLL_INTERVAL_MS);
		attempts++;

		try {
			const execInfo = await executionGet(client, { executionId, orgId });

			if (
				execInfo.status === 'completed' ||
				execInfo.status === 'failed' ||
				execInfo.status === 'timeout' ||
				execInfo.status === 'cancelled'
			) {
				if (execInfo.status === 'failed' || execInfo.status === 'timeout') {
					logger.fatal(`Execution ${execInfo.status}: ${executionId}`);
				}
				return;
			}
		} catch {
			continue;
		}
	}

	logger.fatal('Execution timed out waiting for completion');
}

async function streamToBuffer(url: string, chunks: Buffer[], logger: Logger): Promise<void> {
	const maxRetries = 10;
	const retryDelay = 200;

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			if (attempt > 0) {
				logger.debug('stream retry attempt %d', attempt + 1);
				await sleep(retryDelay);
			}

			const response = await fetch(url);

			if (!response.ok || !response.body) {
				continue;
			}

			const reader = response.body.getReader();

			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					return;
				}

				if (value) {
					chunks.push(Buffer.from(value));
				}
			}
		} catch (err) {
			logger.debug('stream error: %s', err);
		}
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export default cpSubcommand;
