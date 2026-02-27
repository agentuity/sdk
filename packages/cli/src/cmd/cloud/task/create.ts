import { basename } from 'path';
import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createStorageAdapter, parseMetadataFlag, cacheTaskId } from './util';
import { getCommand } from '../../../command-prefix';
import type { TaskPriority, TaskStatus, TaskType } from '@agentuity/core';

const TaskCreateResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	task: z.object({
		id: z.string().describe('Task ID'),
		title: z.string().describe('Task title'),
		type: z.string().describe('Task type'),
		status: z.string().describe('Task status'),
		priority: z.string().describe('Task priority'),
		created_at: z.string().describe('Creation timestamp'),
	}),
	attachment: z
		.object({
			id: z.string().describe('Attachment ID'),
			filename: z.string().describe('Attached filename'),
		})
		.optional()
		.describe('Attached file info (when --file is used)'),
	durationMs: z.number().describe('Operation duration in milliseconds'),
});

export const createSubcommand = createCommand({
	name: 'create',
	aliases: ['new', 'add'],
	description: 'Create a new task',
	tags: ['mutating', 'slow', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud task create "Fix login bug" --type bug --created-id agent_001'),
			description: 'Create a bug task',
		},
		{
			command: getCommand(
				'cloud task create "Add dark mode" --type feature --created-id agent_001 --priority high --description "Implement dark mode toggle"'
			),
			description: 'Create a feature with priority and description',
		},
		{
			command: getCommand(
				'cloud task create "Q1 Planning" --type epic --created-id agent_001 --metadata \'{"team":"engineering"}\''
			),
			description: 'Create an epic with metadata',
		},
	],
	schema: {
		args: z.object({
			title: z.string().min(1).describe('the task title'),
		}),
		options: z.object({
			type: z.enum(['epic', 'feature', 'enhancement', 'bug', 'task']).describe('the task type'),
			createdId: z.string().min(1).describe('the ID of the creator (agent or user)'),
			description: z.string().optional().describe('task description'),
			priority: z
				.enum(['high', 'medium', 'low', 'none'])
				.optional()
				.describe('task priority (default: none)'),
			status: z
				.enum(['open', 'in_progress', 'closed'])
				.optional()
				.describe('initial task status (default: open)'),
			parentId: z.string().optional().describe('parent task ID for subtasks'),
			assignedId: z.string().optional().describe('ID of the assigned agent or user'),
			metadata: z.string().optional().describe('JSON metadata object'),
			file: z.string().optional().describe('file path to attach to the task'),
		}),
		response: TaskCreateResponseSchema,
	},

	async handler(ctx) {
		const { args, opts, options } = ctx;
		const started = Date.now();
		const storage = await createStorageAdapter(ctx);

		const metadata = parseMetadataFlag(opts.metadata);

		const task = await storage.create({
			title: args.title,
			type: opts.type as TaskType,
			created_id: opts.createdId,
			description: opts.description,
			priority: opts.priority as TaskPriority,
			status: opts.status as TaskStatus,
			parent_id: opts.parentId,
			assigned_id: opts.assignedId,
			metadata,
		});

		const durationMs = Date.now() - started;
		await cacheTaskId(ctx, task.id);

		// Handle --file attachment
		let attachmentInfo: { id: string; filename: string } | undefined;
		if (opts.file) {
			const file = Bun.file(opts.file);
			if (!(await file.exists())) {
				tui.fatal(`File not found: ${opts.file}`);
			}

			const filename = basename(opts.file);
			const contentType = file.type || 'application/octet-stream';
			const size = file.size;

			const presign = await storage.uploadAttachment(task.id, {
				filename,
				content_type: contentType,
				size,
			});

			const uploadResponse = await fetch(presign.presigned_url, {
				method: 'PUT',
				body: file.stream(),
				headers: {
					'Content-Type': contentType,
				},
				duplex: 'half',
			});
			if (!uploadResponse.ok) {
				tui.fatal(`Attachment upload failed: ${uploadResponse.statusText}`);
			}

			const attachment = await storage.confirmAttachment(presign.attachment.id);
			attachmentInfo = { id: attachment.id, filename: attachment.filename };
		}

		if (!options.json) {
			tui.success(`Task created: ${tui.bold(task.id)}`);

			const tableData: Record<string, string> = {
				Title: task.title,
				Type: task.type,
				Status: task.status,
				Priority: task.priority,
				Created: new Date(task.created_at).toLocaleString(),
			};

			if (task.description) {
				tableData['Description'] = task.description;
			}

			if (attachmentInfo) {
				tableData['Attachment'] = `${attachmentInfo.filename} (${attachmentInfo.id})`;
			}

			tui.table([tableData], Object.keys(tableData), { layout: 'vertical', padStart: '  ' });
		}

		return {
			success: true,
			task: {
				id: task.id,
				title: task.title,
				type: task.type,
				status: task.status,
				priority: task.priority,
				created_at: task.created_at,
			},
			...(attachmentInfo ? { attachment: attachmentInfo } : {}),
			durationMs,
		};
	},
});

export default createSubcommand;
