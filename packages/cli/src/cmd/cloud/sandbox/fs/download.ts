import { z } from 'zod';
import { createWriteStream } from 'node:fs';
import { dirname } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createCommand } from '../../../../types';
import * as tui from '../../../../tui';
import { createSandboxClient, resolveSandboxTarget } from '../util';
import { getCommand } from '../../../../command-prefix';
import { sandboxDownloadArchive } from '@agentuity/server';

export const downloadSubcommand = createCommand({
	name: 'download',
	aliases: ['dl'],
	description: 'Download files from a sandbox as a compressed archive',
	tags: ['slow', 'requires-auth'],
	requires: { auth: true, apiClient: true },
	examples: [
		{
			command: getCommand('cloud sandbox fs download sbx_abc123 ./backup.tar.gz'),
			description: 'Download sandbox files as tar.gz archive',
		},
		{
			command: getCommand('cloud sandbox fs download sbx_abc123 ./backup.zip --format zip'),
			description: 'Download sandbox files as zip archive',
		},
		{
			command: getCommand('cloud sandbox fs download sbx_abc123 ./backup.tar.gz --path /subdir'),
			description: 'Download only a specific directory',
		},
	],
	schema: {
		args: z.object({
			sandboxId: z.string().describe('The sandbox ID'),
			output: z.string().describe('Output file path for the archive'),
		}),
		options: z.object({
			path: z.string().optional().describe('Path in sandbox to download (defaults to root)'),
			format: z
				.enum(['zip', 'tar.gz'])
				.optional()
				.describe('Archive format (auto-detected from filename if not specified)'),
		}),
		response: z.object({
			success: z.boolean(),
			output: z.string(),
			bytes: z.number(),
		}),
	},

	async handler(ctx) {
		const { args, opts, options, auth, logger, apiClient } = ctx;

		const { region, orgId } = await resolveSandboxTarget(
			logger,
			auth,
			apiClient,
			args.sandboxId,
			ctx.config?.name ?? 'production',
			ctx.config
		);

		const client = createSandboxClient(logger, auth, region);

		const format = opts.format ?? detectFormat(args.output);

		const stream = await sandboxDownloadArchive(client, {
			sandboxId: args.sandboxId,
			path: opts.path || '.',
			format,
			orgId,
		});
		await mkdir(dirname(args.output), { recursive: true });
		await pipeline(Readable.fromWeb(stream), createWriteStream(args.output));
		const totalBytes = Bun.file(args.output).size;

		if (!options.json) {
			tui.success(`Downloaded ${formatSize(totalBytes)} to ${args.output}`);
		}

		return { success: true, output: args.output, bytes: totalBytes };
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

export default downloadSubcommand;
