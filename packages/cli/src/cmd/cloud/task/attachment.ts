import { basename, join } from 'path';
import { stat as fsStat } from 'node:fs/promises';
import { z } from 'zod';
import { createCommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { createStorageAdapter } from './util.ts';
import { getCommand } from '../../../command-prefix.ts';
import type { Attachment } from '@agentuity/core';

function formatBytes(bytes: number | undefined): string {
	if (bytes === undefined || bytes === null) return '—';
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function truncate(s: string, max: number): string {
	if (s.length <= max) return s;
	return `${s.slice(0, max - 1)}…`;
}

// ── Upload ──────────────────────────────────────────────────────────────

const uploadSubcommand = createCommand({
	name: 'upload',
	aliases: ['up', 'put'],
	description: 'Upload a file attachment to a task',
	tags: ['mutating', 'slow', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud task attachment upload task_abc123 ./report.pdf'),
			description: 'Upload a file to a task',
		},
	],
	schema: {
		args: z.object({
			taskId: z.string().min(1).describe('the task ID to attach the file to'),
			file: z.string().min(1).describe('local file path to upload'),
		}),
		response: z.object({
			success: z.boolean().describe('Whether the operation succeeded'),
			attachment: z.object({
				id: z.string().describe('Attachment ID'),
				filename: z.string().describe('Filename'),
				content_type: z.string().optional().describe('Content type'),
				size: z.number().optional().describe('File size in bytes'),
			}),
			durationMs: z.number().describe('Operation duration in milliseconds'),
		}),
	},

	async handler(ctx) {
		const { args, options } = ctx;
		const started = Date.now();
		const storage = await createStorageAdapter(ctx);

		const file = Bun.file(args.file);
		if (!(await file.exists())) {
			tui.fatal(`File not found: ${args.file}`);
		}

		const filename = basename(args.file);
		const contentType = file.type || 'application/octet-stream';
		const size = file.size;

		// Step 1: Get presigned upload URL
		const presign = await tui.spinner({
			message: 'Requesting upload URL',
			clearOnSuccess: true,
			callback: async () => {
				return storage.uploadAttachment(args.taskId, {
					filename,
					content_type: contentType,
					size,
				});
			},
		});

		// Step 2: Upload file to presigned URL
		await tui.spinner({
			message: `Uploading ${filename}`,
			clearOnSuccess: true,
			callback: async () => {
				const response = await fetch(presign.presigned_url, {
					method: 'PUT',
					body: file.stream(),
					headers: {
						'Content-Type': contentType,
					},
					duplex: 'half',
				});
				if (!response.ok) {
					tui.fatal(`Upload failed: ${response.statusText}`);
				}
			},
		});

		// Step 3: Confirm the upload
		const attachment = await tui.spinner({
			message: 'Confirming upload',
			clearOnSuccess: true,
			callback: async () => {
				return storage.confirmAttachment(presign.attachment.id);
			},
		});

		const durationMs = Date.now() - started;

		if (!options.json) {
			tui.success(`Attachment uploaded: ${tui.bold(attachment.id)}`);

			const tableData: Record<string, string> = {
				ID: attachment.id,
				Filename: attachment.filename,
				'Content Type': attachment.content_type ?? '—',
				Size: formatBytes(attachment.size),
				Task: attachment.task_id,
				Created: new Date(attachment.created_at).toLocaleString(),
			};

			tui.table([tableData], Object.keys(tableData), { layout: 'vertical', padStart: '  ' });
		}

		return {
			success: true,
			attachment: {
				id: attachment.id,
				filename: attachment.filename,
				content_type: attachment.content_type,
				size: attachment.size,
			},
			durationMs,
		};
	},
});

// ── List ────────────────────────────────────────────────────────────────

const listAttachmentsSubcommand = createCommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List attachments for a task',
	tags: ['read-only', 'slow', 'requires-auth'],
	idempotent: true,
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud task attachment list task_abc123'),
			description: 'List all attachments for a task',
		},
	],
	schema: {
		args: z.object({
			taskId: z.string().min(1).describe('the task ID to list attachments for'),
		}),
		response: z.object({
			success: z.boolean().describe('Whether the operation succeeded'),
			attachments: z.array(
				z.object({
					id: z.string(),
					filename: z.string(),
					content_type: z.string().optional(),
					size: z.number().optional(),
					created_at: z.string(),
				})
			),
			total: z.number().describe('Total number of attachments'),
			durationMs: z.number().describe('Operation duration in milliseconds'),
		}),
	},

	async handler(ctx) {
		const { args, options } = ctx;
		const started = Date.now();
		const storage = await createStorageAdapter(ctx);

		const result = await storage.listAttachments(args.taskId);
		const durationMs = Date.now() - started;

		if (!options.json) {
			if (result.attachments.length === 0) {
				tui.info('No attachments found');
			} else {
				const tableData = result.attachments.map((att: Attachment) => ({
					ID: tui.muted(truncate(att.id, 28)),
					Filename: truncate(att.filename, 40),
					'Content Type': att.content_type ?? tui.muted('—'),
					Size: formatBytes(att.size),
					Created: new Date(att.created_at).toLocaleDateString(),
				}));

				tui.table(tableData, [
					{ name: 'ID', alignment: 'left' },
					{ name: 'Filename', alignment: 'left' },
					{ name: 'Content Type', alignment: 'left' },
					{ name: 'Size', alignment: 'right' },
					{ name: 'Created', alignment: 'left' },
				]);

				tui.info(
					`${result.total} ${tui.plural(result.total, 'attachment', 'attachments')} (${durationMs.toFixed(1)}ms)`
				);
			}
		}

		return {
			success: true,
			attachments: result.attachments.map((att: Attachment) => ({
				id: att.id,
				filename: att.filename,
				content_type: att.content_type,
				size: att.size,
				created_at: att.created_at,
			})),
			total: result.total,
			durationMs,
		};
	},
});

// ── Download ────────────────────────────────────────────────────────────

const downloadSubcommand = createCommand({
	name: 'download',
	aliases: ['dl', 'get'],
	description: 'Download a task attachment',
	tags: ['read-only', 'slow', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud task attachment download att_abc123'),
			description: 'Download an attachment to the current directory',
		},
		{
			command: getCommand('cloud task attachment download att_abc123 --output ./downloads/'),
			description: 'Download an attachment to a specific directory',
		},
	],
	schema: {
		args: z.object({
			attachmentId: z.string().min(1).describe('the attachment ID to download'),
		}),
		options: z.object({
			output: z
				.string()
				.optional()
				.describe('output file path or directory (defaults to current directory)'),
		}),
		response: z.object({
			success: z.boolean().describe('Whether the operation succeeded'),
			path: z.string().describe('Path where the file was saved'),
			size: z.number().describe('Downloaded file size in bytes'),
			durationMs: z.number().describe('Operation duration in milliseconds'),
		}),
	},

	async handler(ctx) {
		const { args, opts, options } = ctx;
		const started = Date.now();
		const storage = await createStorageAdapter(ctx);

		// Step 1: Get presigned download URL
		const presign = await tui.spinner({
			message: 'Requesting download URL',
			clearOnSuccess: true,
			callback: async () => {
				return storage.downloadAttachment(args.attachmentId);
			},
		});

		// Step 2: Download the file
		const response = await tui.spinner({
			message: 'Downloading',
			clearOnSuccess: true,
			callback: async () => {
				const res = await fetch(presign.presigned_url);
				if (!res.ok) {
					tui.fatal(`Download failed: ${res.statusText}`);
				}
				return res;
			},
		});

		// Determine output path
		// Extract filename from Content-Disposition header or URL
		let filename = 'attachment';
		const disposition = response.headers.get('content-disposition');
		if (disposition) {
			const match = disposition.match(/filename[*]?=(?:UTF-8''|"?)([^";]+)/i);
			if (match?.[1]) {
				filename = decodeURIComponent(match[1].replace(/"/g, ''));
			}
		} else {
			// Try to extract filename from the presigned URL path
			const urlPath = new URL(presign.presigned_url).pathname;
			const urlFilename = basename(urlPath);
			if (urlFilename && urlFilename !== '/') {
				filename = decodeURIComponent(urlFilename);
			}
		}

		// Sanitize filename against path traversal
		filename = filename.replace(/\0/g, ''); // strip null bytes
		filename = filename.replace(/[/\\]/g, '_'); // replace path separators
		filename = filename.replace(/^\.+/, ''); // strip leading dots
		if (!filename || filename === '.' || filename === '..') {
			filename = 'attachment';
		}

		let outputPath: string;
		if (opts.output) {
			try {
				const stats = await fsStat(opts.output);
				if (stats.isDirectory()) {
					outputPath = join(opts.output, filename);
				} else {
					// It's an existing file — use it directly
					outputPath = opts.output;
				}
			} catch {
				// Path doesn't exist — treat as target file path
				outputPath = opts.output;
			}
		} else {
			outputPath = join(process.cwd(), filename);
		}

		// Step 3: Write file to disk
		const size = await tui.spinner({
			message: `Saving to ${outputPath}`,
			clearOnSuccess: true,
			callback: async () => {
				const bytes = await Bun.write(outputPath, response);
				return bytes;
			},
		});

		const durationMs = Date.now() - started;

		if (!options.json) {
			tui.success(`Downloaded to ${tui.bold(outputPath)} (${formatBytes(size)})`);
		}

		return {
			success: true,
			path: outputPath,
			size,
			durationMs,
		};
	},
});

// ── Delete ──────────────────────────────────────────────────────────────

const deleteAttachmentSubcommand = createCommand({
	name: 'delete',
	aliases: ['rm', 'remove'],
	description: 'Delete a task attachment',
	tags: ['mutating', 'slow', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud task attachment delete att_abc123'),
			description: 'Delete an attachment',
		},
	],
	schema: {
		args: z.object({
			attachmentId: z.string().min(1).describe('the attachment ID to delete'),
		}),
		response: z.object({
			success: z.boolean().describe('Whether the operation succeeded'),
			attachmentId: z.string().describe('Deleted attachment ID'),
			durationMs: z.number().describe('Operation duration in milliseconds'),
		}),
	},

	async handler(ctx) {
		const { args, options } = ctx;
		const started = Date.now();
		const storage = await createStorageAdapter(ctx);

		await storage.deleteAttachment(args.attachmentId);

		const durationMs = Date.now() - started;

		if (!options.json) {
			tui.success(`Attachment deleted: ${tui.bold(args.attachmentId)}`);
		}

		return {
			success: true,
			attachmentId: args.attachmentId,
			durationMs,
		};
	},
});

// ── Parent command ──────────────────────────────────────────────────────

export const attachmentSubcommand = createCommand({
	name: 'attachment',
	aliases: ['attach', 'att'],
	description: 'Manage task attachments',
	tags: ['requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud task attachment upload task_abc123 ./report.pdf'),
			description: 'Upload a file to a task',
		},
		{
			command: getCommand('cloud task attachment list task_abc123'),
			description: 'List task attachments',
		},
		{
			command: getCommand('cloud task attachment download att_abc123'),
			description: 'Download an attachment',
		},
		{
			command: getCommand('cloud task attachment delete att_abc123'),
			description: 'Delete an attachment',
		},
	],
	subcommands: [
		uploadSubcommand,
		listAttachmentsSubcommand,
		downloadSubcommand,
		deleteAttachmentSubcommand,
	],
});
