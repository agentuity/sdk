import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createSandboxClient } from './util';
import { getCommand } from '../../../command-prefix';
import { sandboxListFiles } from '@agentuity/server';

const FileInfoSchema = z.object({
	path: z.string(),
	size: z.number(),
	isDir: z.boolean(),
	mode: z.string(),
	modTime: z.string(),
});

const LsResponseSchema = z.object({
	files: z.array(FileInfoSchema),
	total: z.number(),
});

export const lsSubcommand = createCommand({
	name: 'files',
	aliases: ['lsf'],
	description: 'List files in a sandbox directory',
	tags: ['slow', 'requires-auth'],
	requires: { auth: true, region: true, org: true },
	examples: [
		{
			command: getCommand('cloud sandbox files sbx_abc123'),
			description: 'List files in the sandbox root directory',
		},
		{
			command: getCommand('cloud sandbox files sbx_abc123 /path/to/dir'),
			description: 'List files in a specific directory',
		},
		{
			command: getCommand('cloud sandbox files sbx_abc123 -l'),
			description: 'List files with permissions and modification time',
		},
		{
			command: getCommand('cloud sandbox files sbx_abc123 --json'),
			description: 'List files with JSON output',
		},
	],
	schema: {
		args: z.object({
			sandboxId: z.string().describe('The sandbox ID'),
			path: z.string().optional().describe('Path to list (defaults to root)'),
		}),
		options: z.object({
			long: z.boolean().default(false).optional().describe('Use long listing format with permissions and timestamps'),
		}),
		aliases: {
			long: ['l'],
		},
		response: LsResponseSchema,
	},

	async handler(ctx) {
		const { args, opts, options, auth, region, logger, orgId } = ctx;
		const client = createSandboxClient(logger, auth, region);

		const result = await sandboxListFiles(client, {
			sandboxId: args.sandboxId,
			path: args.path || '.',
			orgId,
		});

		if (!options.json) {
			if (result.files.length === 0) {
				console.log(tui.muted('Directory is empty'));
			} else {
				for (const file of result.files) {
					const typeIndicator = file.isDir ? tui.colorInfo('d') : tui.muted('-');
					const sizeStr = file.isDir ? tui.muted('-') : formatSize(file.size);

					if (opts.long) {
						const modTimeStr = formatModTime(file.modTime);
						console.log(
							`${typeIndicator}${file.mode.padEnd(5)} ${sizeStr.padStart(10)}  ${modTimeStr}  ${file.path}`
						);
					} else {
						console.log(`${typeIndicator} ${sizeStr.padStart(10)}  ${file.path}`);
					}
				}
				console.log(tui.muted(`\nTotal: ${result.files.length} items`));
			}
		}

		return { files: result.files, total: result.files.length };
	},
});

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatModTime(isoString: string): string {
	try {
		const date = new Date(isoString);
		const now = new Date();
		const isThisYear = date.getFullYear() === now.getFullYear();

		const month = date.toLocaleString('en-US', { month: 'short' });
		const day = date.getDate().toString().padStart(2, ' ');

		if (isThisYear) {
			const hours = date.getHours().toString().padStart(2, '0');
			const minutes = date.getMinutes().toString().padStart(2, '0');
			return `${month} ${day} ${hours}:${minutes}`;
		} else {
			return `${month} ${day}  ${date.getFullYear()}`;
		}
	} catch {
		return isoString.slice(0, 16);
	}
}

export default lsSubcommand;
