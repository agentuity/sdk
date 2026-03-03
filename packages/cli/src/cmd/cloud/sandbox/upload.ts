import { z } from 'zod';
import { readFileSync, statSync } from 'node:fs';
import { createCommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { createSandboxClient } from './util.ts';
import { getCommand } from '../../../command-prefix.ts';
import { sandboxUploadArchive, sandboxResolve } from '@agentuity/server';

export const uploadSubcommand = createCommand({
	name: 'upload',
	aliases: ['ul'],
	description: 'Upload a compressed archive to a sandbox and extract it',
	tags: ['slow', 'requires-auth'],
	requires: { auth: true, apiClient: true },
	examples: [
		{
			command: getCommand('cloud sandbox upload sbx_abc123 ./archive.tar.gz'),
			description: 'Upload and extract a tar.gz archive to sandbox root',
		},
		{
			command: getCommand('cloud sandbox upload sbx_abc123 ./archive.zip --path /subdir'),
			description: 'Upload and extract a zip archive to a specific directory',
		},
		{
			command: getCommand('cloud sandbox upload sbx_abc123 ./archive.bin --format tar.gz'),
			description: 'Upload with explicit format specification',
		},
	],
	schema: {
		args: z.object({
			sandboxId: z.string().describe('The sandbox ID'),
			archive: z.string().describe('Path to the archive file to upload'),
		}),
		options: z.object({
			path: z.string().optional().describe('Destination path in sandbox (defaults to root)'),
			format: z
				.enum(['zip', 'tar.gz'])
				.optional()
				.describe('Archive format (auto-detected if not specified)'),
		}),
		response: z.object({
			success: z.boolean(),
			bytes: z.number(),
		}),
	},

	async handler(ctx) {
		const { args, opts, options, auth, logger, apiClient } = ctx;

		// Resolve sandbox to get region and orgId using CLI API
		const sandboxInfo = await sandboxResolve(apiClient, args.sandboxId);
		const { region, orgId } = sandboxInfo;

		const client = createSandboxClient(logger, auth, region);

		const stat = statSync(args.archive);
		if (!stat.isFile()) {
			logger.fatal(`${args.archive} is not a file`);
		}

		const content = readFileSync(args.archive);
		const bytes = content.length;

		const format = opts.format ?? detectFormat(args.archive);

		await sandboxUploadArchive(client, {
			sandboxId: args.sandboxId,
			archive: content,
			path: opts.path || '.',
			format,
			orgId,
		});

		if (!options.json) {
			tui.success(`Uploaded and extracted ${formatSize(bytes)} to sandbox`);
		}

		return { success: true, bytes };
	},
});

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} bytes`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function detectFormat(filename: string): 'zip' | 'tar.gz' {
	const lower = filename.toLowerCase();
	if (lower.endsWith('.zip')) return 'zip';
	return 'tar.gz';
}

export default uploadSubcommand;
