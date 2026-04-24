import { z } from 'zod';
import {
	readFileSync,
	mkdirSync,
	statSync,
	readdirSync,
	createWriteStream,
	mkdtempSync,
	rmSync,
} from 'node:fs';
import { dirname, resolve, basename, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import * as tar from 'tar';
import { createCommand } from '../../../../types';
import { toForwardSlash } from '../../../../utils/normalize-path';
import * as tui from '../../../../tui';
import { createSandboxClient, resolveSandboxTarget } from '../util';
import { getCommand } from '../../../../command-prefix';
import {
	sandboxWriteFiles,
	sandboxReadFile,
	sandboxExecute,
	executionGet,
	sandboxDownloadArchive,
	sandboxUploadArchive,
	type APIClient,
} from '@agentuity/server';
import type { Logger, FileToWrite } from '@agentuity/core';

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
	if (prefix.startsWith('sbx_')) {
		return { sandboxId: prefix, path };
	}
	return { sandboxId: null, path: pathArg };
}

const SandboxCpResponseSchema = z.object({
	source: z.string().describe('Source path'),
	destination: z.string().describe('Destination path'),
	bytesTransferred: z.number().describe('Number of bytes transferred'),
	filesTransferred: z.number().describe('Number of files transferred'),
	directoriesCreated: z
		.array(z.string())
		.optional()
		.describe(
			'Parent directories that were auto-created on the destination (not present in --strict mode or when all directories already exist)'
		),
});

export const cpSubcommand = createCommand({
	name: 'cp',
	aliases: ['copy'],
	description:
		'Copy files or directories to or from a sandbox. Parent directories are automatically created if they do not exist (similar to mkdir -p).',
	tags: ['slow', 'requires-auth'],
	requires: { auth: true, apiClient: true },
	examples: [
		{
			command: getCommand('cloud sandbox fs cp ./local-file.txt sbx_abc123:/path/to/file.txt'),
			description: 'Copy a local file to a sandbox',
		},
		{
			command: getCommand('cloud sandbox fs cp sbx_abc123:/path/to/file.txt ./local-file.txt'),
			description: 'Copy a file from a sandbox to local',
		},
		{
			command: getCommand('cloud sandbox fs cp --recursive ./local-dir sbx_abc123:/path/to/dir'),
			description: 'Copy a local directory to a sandbox recursively',
		},
		{
			command: getCommand('cloud sandbox fs cp -r sbx_abc123:/path/to/dir ./local-dir'),
			description: 'Copy a directory from a sandbox to local recursively',
		},
		{
			command: getCommand(
				'cloud sandbox fs cp --strict ./local-file.txt sbx_abc123:/path/to/file.txt'
			),
			description: 'Copy a file, failing if the target directory does not exist',
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
			strict: z
				.boolean()
				.default(false)
				.optional()
				.describe(
					'Fail if the target parent directory does not exist instead of auto-creating it'
				),
		}),
		aliases: {
			recursive: ['r'],
		},
		response: SandboxCpResponseSchema,
	},

	async handler(ctx) {
		const { args, opts, options, auth, logger, apiClient } = ctx;

		const source = parsePath(args.source);
		const destination = parsePath(args.destination);

		if (source.sandboxId && destination.sandboxId) {
			logger.fatal(
				'Cannot copy between two sandboxes. Use a local path as source or destination.'
			);
		}

		if (!source.sandboxId && !destination.sandboxId) {
			logger.fatal(
				'At least one path must include a sandbox ID (e.g., sbx_abc123:/path/to/file)'
			);
		}

		const sandboxId = source.sandboxId ?? destination.sandboxId!;

		const { region, orgId } = await resolveSandboxTarget(
			logger,
			auth,
			apiClient,
			sandboxId,
			ctx.config?.name ?? 'production',
			ctx.config
		);

		const client = createSandboxClient(logger, auth, region);
		const recursive = opts.recursive ?? false;
		const strict = opts.strict ?? false;

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
				options.json ?? false,
				strict
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

/**
 * Computes the parent directories that would be auto-created by the server
 * when writing files to the given paths. Filters out directories that always
 * exist in a sandbox (/, /home, /home/agentuity).
 */
function getImplicitDirectories(filePaths: string[]): string[] {
	const dirs = new Set<string>();
	// Directories that always exist in a sandbox
	const knownDirs = new Set(['/', '/home', '/home/agentuity']);

	for (const filePath of filePaths) {
		let dir = dirname(filePath);
		while (dir && dir !== '.' && dir !== '/') {
			if (!knownDirs.has(dir)) {
				dirs.add(dir);
			}
			const parent = dirname(dir);
			if (parent === dir) break;
			dir = parent;
		}
	}
	return Array.from(dirs).sort();
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
	jsonOutput: boolean,
	strict: boolean
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
			jsonOutput,
			strict
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
		jsonOutput,
		strict
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
	_timeout: string | undefined,
	jsonOutput: boolean,
	strict: boolean
): Promise<z.infer<typeof SandboxCpResponseSchema>> {
	const buffer = readFileSync(resolvedPath);

	let targetPath = remotePath;
	if (!remotePath || remotePath === '' || remotePath.endsWith('/')) {
		const baseDir = remotePath || '';
		targetPath = baseDir ? baseDir + basename(resolvedPath) : basename(resolvedPath);
	}

	if (strict) {
		const parentDir = dirname(targetPath);
		const knownDirs = new Set(['/', '/home', '/home/agentuity']);
		if (!knownDirs.has(parentDir)) {
			const checkExecution = await sandboxExecute(client, {
				sandboxId,
				options: {
					command: ['test', '-d', parentDir],
				},
				orgId,
			});
			await waitForExecution(client, orgId, checkExecution.executionId, logger);
			const execInfo = await executionGet(client, {
				executionId: checkExecution.executionId,
				orgId,
			});
			if (execInfo.exitCode !== 0) {
				logger.fatal(
					`Target directory does not exist: ${parentDir}\n` +
						`Use without --strict to auto-create parent directories, or create it first with:\n` +
						`  ${getCommand(`cloud sandbox fs mkdir ${sandboxId} ${parentDir} -p`)}`
				);
			}
		}
	}

	const files: FileToWrite[] = [{ path: targetPath, content: buffer }];

	await sandboxWriteFiles(client, { sandboxId, files, orgId });

	if (!jsonOutput) {
		tui.success(`Copied ${displayPath} → ${sandboxId}:${targetPath} (${buffer.length} bytes)`);
	}

	const implicitDirs = getImplicitDirectories([targetPath]);
	return {
		source: displayPath,
		destination: `${sandboxId}:${targetPath}`,
		bytesTransferred: buffer.length,
		filesTransferred: 1,
		directoriesCreated: implicitDirs.length > 0 ? implicitDirs : undefined,
	};
}

async function uploadDirectory(
	client: APIClient,
	logger: Logger,
	orgId: string,
	sandboxId: string,
	localDir: string,
	remotePath: string,
	_timeout: string | undefined,
	jsonOutput: boolean,
	strict: boolean
): Promise<z.infer<typeof SandboxCpResponseSchema>> {
	const allFiles = getAllFiles(localDir);

	if (allFiles.length === 0) {
		logger.fatal(`Directory is empty: ${localDir}`);
	}

	let totalBytes = 0;
	const effectiveRemotePath = remotePath || basename(localDir);
	const baseRemotePath = effectiveRemotePath.endsWith('/')
		? effectiveRemotePath.slice(0, -1)
		: effectiveRemotePath;

	if (strict) {
		const parentDir = dirname(baseRemotePath);
		const knownDirs = new Set(['/', '/home', '/home/agentuity']);
		if (!knownDirs.has(parentDir)) {
			const checkExecution = await sandboxExecute(client, {
				sandboxId,
				options: {
					command: ['test', '-d', parentDir],
				},
				orgId,
			});
			await waitForExecution(client, orgId, checkExecution.executionId, logger);
			const execInfo = await executionGet(client, {
				executionId: checkExecution.executionId,
				orgId,
			});
			if (execInfo.exitCode !== 0) {
				logger.fatal(
					`Target directory does not exist: ${parentDir}\n` +
						`Use without --strict to auto-create parent directories, or create it first with:\n` +
						`  ${getCommand(`cloud sandbox fs mkdir ${sandboxId} ${parentDir} -p`)}`
				);
			}
		}
	}

	for (const filePath of allFiles) {
		totalBytes += statSync(filePath).size;
	}

	const tempDir = mkdtempSync(join(tmpdir(), 'agentuity-fs-cp-'));
	const archivePath = join(tempDir, 'upload.tar.gz');
	try {
		await createTarGzArchive(localDir, allFiles, archivePath);
		await sandboxUploadArchive(client, {
			sandboxId,
			archive: Bun.file(archivePath).stream(),
			path: baseRemotePath,
			format: 'tar.gz',
			orgId,
		});
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}

	if (!jsonOutput) {
		tui.success(
			`Copied ${localDir} → ${sandboxId}:${baseRemotePath} (${allFiles.length} files, ${totalBytes} bytes)`
		);
	}

	const implicitDirs = getImplicitDirectories(
		allFiles.map(
			(filePath) => `${baseRemotePath}/${toForwardSlash(relative(localDir, filePath))}`
		)
	);
	return {
		source: localDir,
		destination: `${sandboxId}:${baseRemotePath}`,
		bytesTransferred: totalBytes,
		filesTransferred: allFiles.length,
		directoriesCreated: implicitDirs.length > 0 ? implicitDirs : undefined,
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
	_logger: Logger,
	orgId: string,
	sandboxId: string,
	remotePath: string,
	localPath: string,
	_timeout: string | undefined,
	jsonOutput: boolean
): Promise<z.infer<typeof SandboxCpResponseSchema>> {
	const stream = await sandboxReadFile(client, { sandboxId, path: remotePath, orgId });

	let targetPath = localPath;
	if (localPath.endsWith('/') || localPath === '.') {
		targetPath = resolve(localPath, basename(remotePath));
	} else {
		targetPath = resolve(localPath);
	}

	const dir = dirname(targetPath);
	mkdirSync(dir, { recursive: true });
	await pipeline(
		Readable.fromWeb(stream as unknown as globalThis.ReadableStream<ArrayBufferView>),
		createWriteStream(targetPath)
	);
	const buffer = Bun.file(targetPath);

	if (!jsonOutput) {
		tui.success(`Copied ${sandboxId}:${remotePath} → ${targetPath} (${buffer.size} bytes)`);
	}

	return {
		source: `${sandboxId}:${remotePath}`,
		destination: targetPath,
		bytesTransferred: buffer.size,
		filesTransferred: 1,
	};
}

async function downloadDirectory(
	client: APIClient,
	_logger: Logger,
	orgId: string,
	sandboxId: string,
	remotePath: string,
	localPath: string,
	_timeout: string | undefined,
	jsonOutput: boolean
): Promise<z.infer<typeof SandboxCpResponseSchema>> {
	const baseLocalPath = resolve(localPath);
	mkdirSync(baseLocalPath, { recursive: true });
	const tempDir = mkdtempSync(join(tmpdir(), 'agentuity-fs-cp-'));
	const archivePath = join(tempDir, 'download.tar.gz');
	try {
		const archiveStream = await sandboxDownloadArchive(client, {
			sandboxId,
			path: remotePath,
			format: 'tar.gz',
			orgId,
		});
		await pipeline(
			Readable.fromWeb(archiveStream as unknown as globalThis.ReadableStream<ArrayBufferView>),
			createWriteStream(archivePath)
		);
		await tar.extract({
			file: archivePath,
			cwd: baseLocalPath,
			preservePaths: false,
			strict: true,
		});
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}

	const fileList = getAllFiles(baseLocalPath);
	const totalBytes = fileList.reduce((sum, filePath) => sum + statSync(filePath).size, 0);

	if (!jsonOutput) {
		tui.success(
			`Copied ${sandboxId}:${remotePath} → ${baseLocalPath} (${fileList.length} files, ${totalBytes} bytes)`
		);
	}

	return {
		source: `${sandboxId}:${remotePath}`,
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
		} catch (err) {
			if (err instanceof Error && err.name === 'AbortError') {
				throw err;
			}
			logger.debug('poll error: %s', err);
			continue;
		}
	}

	logger.fatal('Execution timed out waiting for completion');
}

async function createTarGzArchive(
	localDir: string,
	allFiles: string[],
	archivePath: string
): Promise<void> {
	const relativePaths = allFiles.map((filePath) => toForwardSlash(relative(localDir, filePath)));
	await tar.create(
		{
			gzip: true,
			file: archivePath,
			cwd: localDir,
		},
		relativePaths
	);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export default cpSubcommand;
