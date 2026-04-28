import { basename, join } from 'path';
import { z } from 'zod';
import { createCommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { createStorageAdapter, parseMetadataFlag, cacheTaskId } from './util.ts';
import { getCommand } from '../../../command-prefix.ts';
import { whoami } from '@agentuity/server';
import type { TaskPriority, TaskStatus, TaskType, UserType } from '@agentuity/core';
import { getCachedUserInfo, setCachedUserInfo } from '../../../cache/index.ts';
import { defaultProfileName } from '../../../config.ts';

const TaskCreateResponseSchema = z.object({
	success: z.boolean().describe('Whether the operation succeeded'),
	task: z.object({
		id: z.string().describe('Task ID'),
		title: z.string().describe('Task title'),
		type: z.string().describe('Task type'),
		status: z.string().describe('Task status'),
		priority: z.string().describe('Task priority'),
		created_at: z.string().describe('Creation timestamp'),
		tags: z
			.array(z.object({ id: z.string(), name: z.string() }))
			.optional()
			.describe('Tags attached to the task'),
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
	requires: { auth: true, apiClient: true },
	optional: { project: true },
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
				'cloud task create "Fix login bug" --type bug --tag sandbox --tag regression'
			),
			description: 'Create a task with tags (auto-creates tags that do not exist)',
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
			createdId: z
				.string()
				.min(1)
				.optional()
				.describe('the ID of the creator (agent or user, defaults to authenticated user)'),
			createdName: z
				.string()
				.min(1)
				.optional()
				.describe('the display name of the creator (used with --created-id)'),
			createdType: z
				.enum(['human', 'agent'])
				.optional()
				.describe('the type of the creator - human user or AI agent (default: human)'),
			projectId: z.string().optional().describe('project ID to associate with the task'),
			projectName: z
				.string()
				.optional()
				.describe('project display name (used with --project-id)'),
			description: z.string().optional().describe('task description'),
			priority: z
				.enum(['high', 'medium', 'low', 'none'])
				.optional()
				.describe('task priority (default: none)'),
			status: z
				.enum(['open', 'in_progress', 'started', 'done', 'completed', 'closed', 'cancelled'])
				.optional()
				.describe('initial task status (default: open)'),
			parentId: z.string().optional().describe('parent task ID for subtasks'),
			assignedId: z.string().optional().describe('ID of the assigned agent or user'),
			tag: z
				.array(z.string())
				.optional()
				.describe('tag name to attach (repeatable, auto-creates missing tags)'),
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

		// Resolve creator info
		const createdId = opts.createdId ?? ctx.auth.userId;
		const createdType = (opts.createdType as UserType) ?? 'human';
		let creator: { id: string; name: string; type?: UserType } | undefined;
		if (opts.createdId) {
			// Explicit creator — use createdId as name fallback (like project pattern)
			creator = {
				id: opts.createdId,
				name: opts.createdName ?? opts.createdId,
				type: createdType,
			};
		} else {
			// Using auth userId — check cache first, then fall back to whoami API call
			const profileName = ctx.config?.name ?? defaultProfileName;
			const cached = getCachedUserInfo(profileName);
			if (cached) {
				const name = [cached.firstName, cached.lastName].filter(Boolean).join(' ');
				if (name) {
					creator = { id: createdId, name, type: createdType };
				}
			} else {
				// Fetch from API and cache
				try {
					const user = await whoami(ctx.apiClient);
					const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
					if (name) {
						creator = { id: createdId, name, type: createdType };
					}
					setCachedUserInfo(profileName, createdId, user.firstName, user.lastName);
				} catch {
					// Fall back to no creator EntityRef — task DB will use id as name
				}
			}
		}

		// Resolve project info
		let project: { id: string; name: string } | undefined;
		if (opts.projectId) {
			// Explicit project via flags
			project = { id: opts.projectId, name: opts.projectName ?? opts.projectId };
		} else if (ctx.project?.projectId) {
			// Auto-detect from project context — read name from package.json
			let projectName = ctx.project.projectId;
			try {
				const pkgPath = join(ctx.projectDir, 'package.json');
				const pkgFile = Bun.file(pkgPath);
				if (await pkgFile.exists()) {
					const pkg = await pkgFile.json();
					if (pkg.name) {
						projectName = pkg.name;
					}
				}
			} catch {
				// Fall back to projectId as name
			}
			project = { id: ctx.project.projectId, name: projectName };
		}

		const task = await storage.create({
			title: args.title,
			type: opts.type as TaskType,
			created_id: createdId,
			creator,
			project,
			description: opts.description,
			priority: opts.priority as TaskPriority,
			status: opts.status as TaskStatus,
			parent_id: opts.parentId,
			assigned_id: opts.assignedId,
			tag_ids: opts.tag,
			metadata,
		});

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

		const durationMs = Date.now() - started;

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

			if (task.tags?.length) {
				tableData['Tags'] = task.tags.map((t) => t.name).join(', ');
			}

			if (project) {
				tableData['Project'] = project.name;
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
				...(task.tags?.length
					? { tags: task.tags.map((t) => ({ id: t.id, name: t.name })) }
					: {}),
			},
			...(attachmentInfo ? { attachment: attachmentInfo } : {}),
			durationMs,
		};
	},
});

export default createSubcommand;
