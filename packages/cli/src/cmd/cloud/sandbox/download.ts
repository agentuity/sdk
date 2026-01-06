import { z } from 'zod';
import { writeFileSync } from 'node:fs';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createSandboxClient } from './util';
import { getCommand } from '../../../command-prefix';
import { sandboxDownloadArchive } from '@agentuity/server';

export const downloadSubcommand = createCommand({
	name: 'download',
	aliases: ['dl'],
	description: 'Download files from a sandbox as a compressed archive',
	tags: ['slow', 'requires-auth'],
	requires: { auth: true, region: true, org: true },
	examples: [
		{
			command: getCommand('cloud sandbox download sbx_abc123 ./backup.tar.gz'),
			description: 'Download sandbox files as tar.gz archive',
		},
		{
			command: getCommand('cloud sandbox download sbx_abc123 ./backup.zip --format zip'),
			description: 'Download sandbox files as zip archive',
		},
		{
			command: getCommand('cloud sandbox download sbx_abc123 ./backup.tar.gz --path /subdir'),
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
				.default('tar.gz')
				.optional()
				.describe('Archive format (zip or tar.gz)'),
		}),
		response: z.object({
			success: z.boolean(),
			output: z.string(),
			bytes: z.number(),
		}),
	},

	async handler(ctx) {
		const { args, opts, options, auth, region, logger, orgId } = ctx;

		const client = createSandboxClient(logger, auth, region);
		const format = opts.format || 'tar.gz';

		const stream = await sandboxDownloadArchive(client, {
			sandboxId: args.sandboxId,
			path: opts.path || '.',
			format,
			orgId,
		});

		const chunks: Uint8Array[] = [];
		const reader = stream.getReader();

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			chunks.push(value);
		}

		const totalBytes = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
		const buffer = new Uint8Array(totalBytes);
		let offset = 0;
		for (const chunk of chunks) {
			buffer.set(chunk, offset);
			offset += chunk.length;
		}

		writeFileSync(args.output, buffer);

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

export default downloadSubcommand;
