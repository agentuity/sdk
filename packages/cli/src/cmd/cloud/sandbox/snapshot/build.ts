import { z } from 'zod';
import { resolve, join, extname } from 'node:path';
import { existsSync, statSync, createReadStream, createWriteStream } from 'node:fs';
import { YAML } from 'bun';
import * as tar from 'tar';
import { createCommand } from '../../../../types';
import * as tui from '../../../../tui';
import { ErrorCode } from '../../../../errors';
import { getCommand } from '../../../../command-prefix';
import {
	snapshotBuildInit,
	snapshotBuildFinalize,
	snapshotUpload,
	SnapshotBuildFileSchema,
} from '@agentuity/server';
import type { SnapshotFileInfo } from '@agentuity/server';
import { getCatalystAPIClient } from '../../../../config';
import { validateAptDependencies } from '../../../../utils/apt-validator';
import { encryptFIPSKEMDEMStream } from '../../../../crypto/box';
import { tmpdir } from 'node:os';
import { randomUUID, createHash, createPublicKey } from 'node:crypto';
import { rm } from 'node:fs/promises';

export const SNAPSHOT_TAG_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
export const MAX_SNAPSHOT_TAG_LENGTH = 128;

const SnapshotBuildResponseSchema = z.object({
	snapshotId: z.string().describe('Snapshot ID'),
	name: z.string().describe('Snapshot name'),
	tag: z.string().nullable().optional().describe('Snapshot tag'),
	runtime: z.string().describe('Runtime identifier'),
	sizeBytes: z.number().describe('Snapshot size in bytes'),
	fileCount: z.number().describe('Number of files in snapshot'),
	createdAt: z.string().describe('Snapshot creation timestamp'),
	unchanged: z.boolean().optional().describe('True if snapshot was unchanged'),
	userMetadata: z
		.record(z.string(), z.string())
		.optional()
		.describe('User-defined metadata key-value pairs'),
	error: z.string().optional().describe('Error message if build failed'),
	malwareDetected: z.boolean().optional().describe('True if malware was detected'),
	virusName: z.string().optional().describe('Name of detected virus'),
});

const MALWARE_REGEX = /malware detected \(([^)]+)\)/i;

interface FileEntry {
	path: string;
	absolutePath: string;
	size: number;
}

interface TreeNode {
	name: string;
	size?: number;
	isFile: boolean;
	children: Map<string, TreeNode>;
}

function buildFileTree(files: SnapshotFileInfo[]): TreeNode {
	const root: TreeNode = { name: '', isFile: false, children: new Map() };

	for (const file of files) {
		const parts = file.path.split('/');
		let current = root;

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			if (!current.children.has(part)) {
				current.children.set(part, {
					name: part,
					isFile: i === parts.length - 1,
					children: new Map(),
				});
			}
			current = current.children.get(part)!;

			if (i === parts.length - 1) {
				current.size = file.size;
				current.isFile = true;
			}
		}
	}

	return root;
}

function printFileTree(files: SnapshotFileInfo[]): void {
	const tree = buildFileTree(files);
	printTreeNode(tree, '  ');
}

function printTreeNode(node: TreeNode, prefix: string): void {
	const entries = Array.from(node.children.entries()).sort((a, b) => {
		const aIsDir = !a[1].isFile;
		const bIsDir = !b[1].isFile;
		if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
		return a[0].localeCompare(b[0]);
	});

	for (let i = 0; i < entries.length; i++) {
		const [, child] = entries[i];
		const isLast = i === entries.length - 1;
		const connector = tui.muted(isLast ? '└── ' : '├── ');
		const sizeStr =
			child.isFile && child.size !== undefined ? ` (${tui.formatBytes(child.size)})` : '';

		console.log(`${prefix}${connector}${child.name}${sizeStr}`);

		if (child.children.size > 0) {
			const newPrefix = prefix + (isLast ? '    ' : tui.muted('│   '));
			printTreeNode(child, newPrefix);
		}
	}
}

function parseKeyValueArgs(args: string[] | undefined): Record<string, string> {
	if (!args || args.length === 0) {
		return {};
	}

	const result: Record<string, string> = {};
	for (const arg of args) {
		const eqIndex = arg.indexOf('=');
		if (eqIndex === -1) {
			throw new Error(`Invalid KEY=VALUE format: "${arg}"`);
		}
		const key = arg.slice(0, eqIndex);
		const value = arg.slice(eqIndex + 1);
		if (!key) {
			throw new Error(`Invalid KEY=VALUE format: "${arg}" (empty key)`);
		}
		result[key] = value;
	}
	return result;
}

function substituteVariables(
	values: Record<string, string>,
	variables: Record<string, string>
): Record<string, string> {
	const result: Record<string, string> = {};
	const varPattern = /\$\{([^}]+)\}/g;

	for (const [key, value] of Object.entries(values)) {
		let substituted = value;
		let match: RegExpExecArray | null;

		varPattern.lastIndex = 0;
		while ((match = varPattern.exec(value)) !== null) {
			const varName = match[1];
			if (!(varName in variables)) {
				throw new Error(
					`Variable "\${${varName}}" in "${key}" is not defined. Use --env ${varName}=value to provide it.`
				);
			}
			substituted = substituted.replace(match[0], variables[varName]);
		}
		result[key] = substituted;
	}

	return result;
}

async function resolveFileGlobs(
	directory: string,
	patterns: string[]
): Promise<Map<string, FileEntry>> {
	const files = new Map<string, FileEntry>();
	const exclusions: string[] = [];
	const inclusions: string[] = [];

	for (const pattern of patterns) {
		if (pattern.startsWith('!')) {
			exclusions.push(pattern.slice(1));
		} else {
			inclusions.push(pattern);
		}
	}

	for (const pattern of inclusions) {
		const glob = new Bun.Glob(pattern);
		for await (const file of glob.scan({ cwd: directory, dot: true })) {
			const absolutePath = join(directory, file);
			try {
				const stat = statSync(absolutePath);
				if (stat.isFile()) {
					files.set(file, {
						path: file,
						absolutePath,
						size: stat.size,
					});
				}
			} catch {
				// Skip files that can't be stat'd (broken symlinks, permission issues, etc.)
				continue;
			}
		}
	}

	for (let pattern of exclusions) {
		// If the pattern refers to a directory, auto-append /** to exclude all contents
		const patternPath = join(directory, pattern);
		try {
			const stat = statSync(patternPath);
			if (stat.isDirectory()) {
				pattern = pattern.endsWith('/') ? `${pattern}**` : `${pattern}/**`;
			}
		} catch {
			// Path doesn't exist or can't be stat'd, use pattern as-is
		}

		const glob = new Bun.Glob(pattern);
		for await (const file of glob.scan({ cwd: directory, dot: true })) {
			files.delete(file);
		}
	}

	return files;
}

async function createTarGzArchive(
	directory: string,
	files: Map<string, FileEntry>,
	outputPath: string
): Promise<void> {
	const filePaths = Array.from(files.keys());

	await tar.create(
		{
			gzip: true,
			file: outputPath,
			cwd: directory,
		},
		filePaths
	);
}

async function generateContentHash(params: {
	runtime: string;
	description?: string;
	dependencies?: string[];
	files: SnapshotFileInfo[];
	fileHashes: Map<string, string>;
	env?: Record<string, string>;
}): Promise<string> {
	const hash = createHash('sha256');

	hash.update(`runtime:${params.runtime}\n`);

	if (params.description) {
		hash.update(`description:${params.description}\n`);
	}

	if (params.dependencies && params.dependencies.length > 0) {
		const sortedDeps = [...params.dependencies].sort();
		hash.update(`dependencies:${sortedDeps.join(',')}\n`);
	}

	if (params.files.length > 0) {
		const sortedFiles = [...params.files].sort((a, b) => a.path.localeCompare(b.path));
		for (const file of sortedFiles) {
			const contentHash = params.fileHashes.get(file.path) ?? '';
			const mode = file.mode.toString(8).padStart(4, '0');
			hash.update(`file:${file.path}:${file.size}:${contentHash}:${mode}:${file.contentType}\n`);
		}
	}

	if (params.env && Object.keys(params.env).length > 0) {
		const sortedKeys = Object.keys(params.env).sort();
		for (const key of sortedKeys) {
			hash.update(`env:${key}=${params.env[key]}\n`);
		}
	}

	return hash.digest('hex');
}

export const buildSubcommand = createCommand({
	name: 'build',
	description: 'Build a snapshot from a declarative file',
	tags: ['slow', 'requires-auth'],
	requires: { auth: true, org: true, region: true },
	examples: [
		{
			command: getCommand('cloud sandbox snapshot build .'),
			description: 'Build a snapshot from the current directory using agentuity-snapshot.yaml',
		},
		{
			command: getCommand('cloud sandbox snapshot build ./project --file custom-build.yaml'),
			description: 'Build using a custom build file',
		},
		{
			command: getCommand(
				'cloud sandbox snapshot build . --env API_KEY=secret --tag production'
			),
			description: 'Build with environment variable substitution and custom tag',
		},
		{
			command: getCommand('cloud sandbox snapshot build . --dry-run'),
			description: 'Validate the build file without uploading',
		},
		{
			command: getCommand('cloud sandbox snapshot build . --force'),
			description: 'Force rebuild even if content is unchanged',
		},
	],
	schema: {
		args: z.object({
			directory: z.string().describe('Directory containing files to include in snapshot'),
		}),
		options: z.object({
			file: z
				.string()
				.optional()
				.describe('Path to build file (defaults to agentuity-snapshot.[json|yaml|yml])'),
			env: z
				.array(z.string())
				.optional()
				.describe('Environment variable substitution (KEY=VALUE)'),
			name: z.string().optional().describe('Snapshot name (overrides build file)'),
			tag: z.string().optional().describe('Snapshot tag (defaults to "latest")'),
			description: z.string().optional().describe('Snapshot description (overrides build file)'),
			metadata: z.array(z.string()).optional().describe('Metadata key-value pairs (KEY=VALUE)'),
			force: z.boolean().optional().describe('Force rebuild even if content is unchanged'),
			public: z
				.boolean()
				.optional()
				.describe('Make snapshot public (enables virus scanning, no encryption)'),
		}),
		response: SnapshotBuildResponseSchema,
	},

	async handler(ctx) {
		const { args, opts, options, auth, region, config, logger, orgId } = ctx;

		const dryRun = options.dryRun === true;

		const directory = resolve(args.directory);
		if (!existsSync(directory)) {
			logger.fatal(`Directory not found: ${directory}`);
		}

		let buildFilePath: string | undefined;
		if (opts.file) {
			buildFilePath = resolve(opts.file);
			if (!existsSync(buildFilePath)) {
				logger.fatal(`Build file not found: ${buildFilePath}`);
			}
		} else {
			const candidates = [
				'agentuity-snapshot.yaml',
				'agentuity-snapshot.yml',
				'agentuity-snapshot.json',
			];
			for (const candidate of candidates) {
				const candidatePath = join(directory, candidate);
				if (existsSync(candidatePath)) {
					buildFilePath = candidatePath;
					break;
				}
			}
			if (!buildFilePath) {
				logger.fatal(
					`No build file found. Expected one of: ${candidates.join(', ')} in ${directory}`
				);
			}
		}

		const buildFileContent = await Bun.file(buildFilePath!).text();
		const ext = extname(buildFilePath!).toLowerCase();
		let parsedBuildFile: unknown;

		try {
			if (ext === '.yaml' || ext === '.yml') {
				parsedBuildFile = YAML.parse(buildFileContent);
			} else if (ext === '.json') {
				parsedBuildFile = JSON.parse(buildFileContent);
			} else {
				logger.fatal(`Unsupported build file extension: ${ext}. Use .yaml, .yml, or .json`);
			}
		} catch (err) {
			logger.fatal(`Failed to parse build file: ${err instanceof Error ? err.message : err}`);
		}

		const validationResult = SnapshotBuildFileSchema.safeParse(parsedBuildFile);
		if (!validationResult.success) {
			tui.error(`Invalid build file at ${buildFilePath}:`);
			for (const issue of validationResult.error.issues) {
				const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
				tui.bullet(`${path}: ${issue.message}`);
			}
			process.exit(1);
		}

		const buildConfig = validationResult.data;

		if (opts.tag) {
			if (opts.tag.length > MAX_SNAPSHOT_TAG_LENGTH) {
				logger.fatal(
					`Invalid snapshot tag: must be at most ${MAX_SNAPSHOT_TAG_LENGTH} characters`
				);
			}
			if (!SNAPSHOT_TAG_REGEX.test(opts.tag)) {
				logger.fatal(
					'Invalid snapshot tag: must only contain letters, numbers, dashes, underscores, and dots, and cannot start with a period or dash'
				);
			}
		}

		let envSubstitutions: Record<string, string> = {};
		let metadataSubstitutions: Record<string, string> = {};
		try {
			envSubstitutions = parseKeyValueArgs(opts.env);
			metadataSubstitutions = parseKeyValueArgs(opts.metadata);
		} catch (err) {
			logger.fatal(err instanceof Error ? err.message : String(err));
			return undefined as never;
		}

		let finalEnv: Record<string, string> | undefined;
		let finalMetadata: Record<string, string> | undefined;

		// Name and Description: CLI options override build file
		const finalName = opts.name ?? buildConfig.name;
		const finalDescription = opts.description ?? buildConfig.description;

		try {
			if (buildConfig.env) {
				finalEnv = substituteVariables(buildConfig.env, envSubstitutions);
			}
			if (buildConfig.metadata) {
				finalMetadata = substituteVariables(buildConfig.metadata, metadataSubstitutions);
			}
		} catch (err) {
			logger.fatal(err instanceof Error ? err.message : String(err));
			return undefined as never;
		}

		if (buildConfig.dependencies && buildConfig.dependencies.length > 0) {
			const aptValidation = await tui.spinner({
				message: 'Validating apt dependencies...',
				type: 'simple',
				callback: async () => {
					return await validateAptDependencies(
						buildConfig.dependencies!,
						region,
						config,
						logger
					);
				},
			});

			if (aptValidation.invalid.length > 0) {
				tui.error('Invalid apt dependencies:');
				for (const pkg of aptValidation.invalid) {
					tui.bullet(`${pkg.package}: ${pkg.error}`);
					if (pkg.availableVersions && pkg.availableVersions.length > 0) {
						console.log(`    Available versions: ${pkg.availableVersions.join(', ')}`);
					}
					console.log(`    Search: ${pkg.searchUrl}`);
				}
				process.exit(1);
			}
		}

		let files = new Map<string, FileEntry>();
		if (buildConfig.files && buildConfig.files.length > 0) {
			files = await resolveFileGlobs(directory, buildConfig.files);
		}

		const fileMetadata = new Map<string, { sha256: string; contentType: string; mode: number }>();
		for (const file of files.values()) {
			const fullPath = join(directory, file.path);
			const bunFile = Bun.file(fullPath);
			const content = await bunFile.arrayBuffer();
			const hash = createHash('sha256').update(Buffer.from(content)).digest('hex');
			const contentType = bunFile.type || 'application/octet-stream';
			const stat = statSync(fullPath);
			const mode = stat.mode & 0o7777; // Extract permission bits only
			fileMetadata.set(file.path, { sha256: hash, contentType, mode });
		}

		const fileHashes = new Map<string, string>();
		for (const [path, meta] of fileMetadata) {
			fileHashes.set(path, meta.sha256);
		}

		const fileList: SnapshotFileInfo[] = Array.from(files.values()).map((f) => {
			const meta = fileMetadata.get(f.path);
			return {
				path: f.path,
				size: f.size,
				sha256: meta?.sha256 ?? '',
				contentType: meta?.contentType ?? 'application/octet-stream',
				mode: meta?.mode ?? 0o644,
			};
		});
		const totalSize = fileList.reduce((sum, f) => sum + f.size, 0);

		const contentHash = await generateContentHash({
			runtime: buildConfig.runtime,
			description: finalDescription,
			dependencies: buildConfig.dependencies,
			files: fileList,
			fileHashes,
			env: finalEnv,
		});

		if (dryRun) {
			if (!options.json) {
				tui.info(`${tui.bold('Dry Run')} - No upload will be performed`);
				console.log('');
				tui.table(
					[
						{
							Name: finalName,
							Description: finalDescription ?? '-',
							Runtime: buildConfig.runtime,
							Tag: opts.tag ?? 'latest',
							Size: tui.formatBytes(totalSize),
							Files: fileList.length.toFixed(),
						},
					],
					['Name', 'Description', 'Runtime', 'Tag', 'Size', 'Files'],
					{ layout: 'vertical', padStart: '  ' }
				);

				if (buildConfig.dependencies && buildConfig.dependencies.length > 0) {
					console.log('');
					tui.info('Dependencies:');
					for (const dep of buildConfig.dependencies) {
						console.log(`  ${tui.muted('•')} ${dep}`);
					}
				}

				if (finalEnv && Object.keys(finalEnv).length > 0) {
					console.log('');
					tui.info('Environment:');
					for (const key of Object.keys(finalEnv)) {
						console.log(`  ${tui.muted('•')} ${key}=${tui.maskSecret(finalEnv[key])}`);
					}
				}

				if (fileList.length > 0) {
					console.log('');
					tui.info('Files:');
					printFileTree(fileList);
				}
			}

			return {
				snapshotId: '',
				name: finalName ?? '',
				tag: opts.tag ?? 'latest',
				runtime: buildConfig.runtime,
				sizeBytes: totalSize,
				fileCount: fileList.length,
				createdAt: new Date().toISOString(),
				userMetadata: finalMetadata,
			};
		}

		const tempDir = join(tmpdir(), `snapshot-build-${randomUUID()}`);
		const archivePath = join(tempDir, 'snapshot.tar.gz');

		try {
			await Bun.write(join(tempDir, '.placeholder'), '');

			if (files.size > 0) {
				await tui.spinner({
					message: 'Creating archive...',
					type: 'simple',
					callback: async () => {
						await createTarGzArchive(directory, files, archivePath);
					},
				});
			} else {
				await tar.create(
					{
						gzip: true,
						file: archivePath,
						cwd: tempDir,
					},
					['.placeholder']
				);
			}

			const archiveFile = Bun.file(archivePath);
			const archiveSize = archiveFile.size;

			const client = getCatalystAPIClient(logger, auth, region);

			const isPublic = opts.public === true;

			const initResult = await tui.spinner({
				message: 'Initializing snapshot build...',
				clearOnSuccess: true,
				callback: async () => {
					return await snapshotBuildInit(client, {
						runtime: buildConfig.runtime,
						name: finalName,
						tag: opts.tag,
						description: finalDescription,
						contentHash,
						force: opts.force,
						encrypt: !isPublic,
						public: isPublic,
						orgId,
					});
				},
			});

			if (initResult.unchanged) {
				if (!options.json) {
					tui.success(`Snapshot unchanged ${tui.bold(initResult.existingId!)}`);
					console.log('');
					tui.table(
						[
							{
								Name: finalName,
								Tag: opts.tag ?? 'latest',
							},
						],
						['Name', 'Tag'],
						{ layout: 'vertical', padStart: '  ' }
					);
				}

				return {
					snapshotId: initResult.existingId!,
					name: initResult.existingName!,
					tag: initResult.existingTag ?? undefined,
					runtime: buildConfig.runtime,
					sizeBytes: totalSize,
					fileCount: fileList.length,
					createdAt: new Date().toISOString(),
					unchanged: true,
					userMetadata: finalMetadata,
				};
			}

			// Encrypt the archive if public key is provided (private snapshots only)
			let uploadPath = archivePath;
			let uploadSize = archiveSize;

			if (initResult.publicKey) {
				const encryptedPath = join(tempDir, 'snapshot.tar.gz.enc');

				await tui.spinner({
					message: 'Encrypting snapshot...',
					type: 'simple',
					clearOnSuccess: true,
					callback: async () => {
						const publicKey = createPublicKey({
							key: initResult.publicKey!,
							format: 'pem',
							type: 'spki',
						});

						const src = createReadStream(archivePath);
						const dst = createWriteStream(encryptedPath);

						await encryptFIPSKEMDEMStream(publicKey, src, dst);

						await new Promise<void>((resolve, reject) => {
							dst.once('finish', resolve);
							dst.once('error', reject);
							dst.end();
						});
					},
				});

				uploadPath = encryptedPath;
				uploadSize = Bun.file(encryptedPath).size;
			}

			if (initResult.uploadUrl) {
				// Private snapshot: upload directly to S3
				// Use Bun.file() directly as body - Bun sets Content-Length automatically from file size
				await tui.spinner({
					message: 'Uploading snapshot...',
					clearOnSuccess: true,
					callback: async () => {
						const uploadFile = Bun.file(uploadPath);
						const response = await fetch(initResult.uploadUrl!, {
							method: 'PUT',
							headers: {
								'Content-Type': 'application/gzip',
							},
							body: uploadFile,
						});

						if (!response.ok) {
							throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
						}
					},
				});
			} else {
				// Public snapshot: upload via Catalyst (with virus scanning)
				// Note: We read file as ArrayBuffer to ensure Content-Length header is preserved.
				// ReadableStream causes fetch() to use chunked encoding which strips Content-Length.
				try {
					await tui.spinner({
						message: 'Uploading and scanning snapshot...',
						clearOnSuccess: true,
						clearOnError: true,
						callback: async () => {
							const uploadBuffer = await Bun.file(uploadPath).arrayBuffer();
							await snapshotUpload(client, {
								snapshotId: initResult.snapshotId!,
								body: uploadBuffer,
								contentLength: uploadSize,
								orgId,
							});
						},
					});
				} catch (err) {
					const errorMessage = err instanceof Error ? err.message : String(err);
					const malwareMatch = MALWARE_REGEX.exec(errorMessage);

					if (malwareMatch) {
						const virusName = malwareMatch[1];

						if (options.json) {
							console.log(
								JSON.stringify(
									{
										snapshotId: '',
										name: finalName ?? '',
										tag: opts.tag,
										runtime: buildConfig.runtime,
										sizeBytes: totalSize,
										fileCount: fileList.length,
										createdAt: new Date().toISOString(),
										error: errorMessage,
										malwareDetected: true,
										virusName,
									},
									null,
									2
								)
							);
							process.exit(ErrorCode.MALWARE_DETECTED);
						}

						console.log('');
						tui.errorBox(
							'Malware Detected',
							`Your snapshot was rejected because it contains malware.\n\nVirus: ${virusName}\n\nPlease remove the infected files and try again.`
						);
						tui.fatal(
							'Snapshot build failed due to malware detection',
							ErrorCode.MALWARE_DETECTED
						);
					}

					throw err;
				}
			}

			const snapshot = await tui.spinner({
				message: 'Finalizing snapshot...',
				clearOnSuccess: true,
				callback: async () => {
					return await snapshotBuildFinalize(client, {
						snapshotId: initResult.snapshotId!,
						sizeBytes: totalSize,
						fileCount: fileList.length,
						files: fileList,
						dependencies: buildConfig.dependencies,
						env: finalEnv,
						metadata: finalMetadata,
						orgId,
					});
				},
			});

			if (!options.json) {
				tui.success(`Created snapshot ${tui.bold(snapshot.snapshotId)}`);
				console.log('');

				tui.table(
					[
						{
							Name: snapshot.name,
							Description: snapshot.description ?? '-',
							Runtime: buildConfig.runtime,
							Tag: snapshot.tag ?? 'latest',
							Size: tui.formatBytes(snapshot.sizeBytes),
							Files: snapshot.fileCount.toFixed(),
							Created: snapshot.createdAt,
						},
					],
					['Name', 'Description', 'Runtime', 'Tag', 'Size', 'Files', 'Created'],
					{ layout: 'vertical', padStart: '  ' }
				);

				if (buildConfig.dependencies && buildConfig.dependencies.length > 0) {
					console.log('');
					tui.info('Dependencies:');
					for (const dep of buildConfig.dependencies) {
						console.log(`  ${tui.muted('•')} ${dep}`);
					}
				}

				if (finalEnv && Object.keys(finalEnv).length > 0) {
					console.log('');
					tui.info('Environment:');
					for (const key of Object.keys(finalEnv)) {
						console.log(`  ${tui.muted('•')} ${key}=${tui.maskSecret(finalEnv[key])}`);
					}
				}

				if (finalMetadata && Object.keys(finalMetadata).length > 0) {
					console.log('');
					tui.info('Metadata:');
					for (const key of Object.keys(finalMetadata)) {
						console.log(`  ${tui.muted('•')} ${key}=${finalMetadata[key]}`);
					}
				}

				if (snapshot.files && snapshot.files.length > 0) {
					console.log('');
					tui.info('Files:');
					printFileTree(snapshot.files);
				}
			}

			return {
				snapshotId: snapshot.snapshotId,
				name: snapshot.name,
				tag: snapshot.tag ?? undefined,
				runtime: buildConfig.runtime,
				sizeBytes: snapshot.sizeBytes,
				fileCount: snapshot.fileCount,
				createdAt: snapshot.createdAt,
				userMetadata: snapshot.userMetadata ?? undefined,
			};
		} finally {
			try {
				await rm(tempDir, { recursive: true, force: true });
			} catch {
				// Ignore cleanup errors
			}
		}
	},
});

export default buildSubcommand;
