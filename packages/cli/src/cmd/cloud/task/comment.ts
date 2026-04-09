import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createStorageAdapter, createStorageAdapterOptionalOrg, truncate } from './util';
import { getCommand } from '../../../command-prefix';
import { whoami } from '@agentuity/server';
import { getCachedUserInfo, setCachedUserInfo } from '../../../cache';
import { defaultProfileName } from '../../../config';
import type { Comment } from '@agentuity/core';

// ── Create ─────────────────────────────────────────────────────────────

const createCommentSubcommand = createCommand({
	name: 'create',
	aliases: ['new', 'add'],
	description: 'Add a comment to a task',
	tags: ['mutating', 'slow', 'requires-auth'],
	requires: { auth: true, apiClient: true },
	examples: [
		{
			command: getCommand(
				'cloud task comment create task_abc123 "Looks good, ready for review"'
			),
			description: 'Add a comment to a task',
		},
		{
			command: getCommand(
				'cloud task comment create task_abc123 "Agent note" --user-id agent_001 --user-name "My Agent" --user-type agent'
			),
			description: 'Add a comment as an agent',
		},
	],
	schema: {
		args: z.object({
			taskId: z.string().min(1).describe('the task ID to comment on'),
			body: z.string().min(1).describe('the comment text'),
		}),
		options: z.object({
			userId: z.string().optional().describe('author user ID (defaults to authenticated user)'),
			userName: z.string().optional().describe('author display name (used with --user-id)'),
			userType: z
				.enum(['human', 'agent'])
				.optional()
				.describe('author type - human or agent (default: human)'),
		}),
		response: z.object({
			success: z.boolean().describe('Whether the operation succeeded'),
			comment: z.object({
				id: z.string().describe('Comment ID'),
				task_id: z.string().describe('Task ID'),
				body: z.string().describe('Comment body'),
				user_id: z.string().describe('Author user ID'),
				created_at: z.string().describe('Creation timestamp'),
			}),
			durationMs: z.number().describe('Operation duration in milliseconds'),
		}),
	},

	async handler(ctx) {
		const { args, opts, options } = ctx;
		const started = Date.now();
		const storage = await createStorageAdapter(ctx);

		const userId = opts.userId ?? ctx.auth.userId;
		let author: { id: string; name: string; type?: 'human' | 'agent' } | undefined;

		if (opts.userId) {
			author = {
				id: opts.userId,
				name: opts.userName ?? opts.userId,
				type: opts.userType ?? 'human',
			};
		} else {
			const profileName = ctx.config?.name ?? defaultProfileName;
			const cached = getCachedUserInfo(profileName);
			if (cached) {
				const name = [cached.firstName, cached.lastName].filter(Boolean).join(' ');
				if (name) {
					author = { id: userId, name, type: opts.userType ?? 'human' };
				}
			} else {
				try {
					const user = await whoami(ctx.apiClient);
					const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
					if (name) {
						author = { id: userId, name, type: opts.userType ?? 'human' };
					}
					setCachedUserInfo(profileName, userId, user.firstName, user.lastName);
				} catch {
					// Fall back to no author EntityRef
				}
			}
		}

		const comment = await storage.createComment(args.taskId, args.body, userId, author);
		const durationMs = Date.now() - started;

		if (!options.json) {
			tui.success(`Comment created: ${tui.bold(comment.id)}`);

			const tableData: Record<string, string> = {
				ID: comment.id,
				Task: comment.task_id,
				Body: comment.body,
				Author: comment.author ? `${comment.author.name} (${comment.author.id})` : userId,
				Created: new Date(comment.created_at).toLocaleString(),
			};

			tui.table([tableData], Object.keys(tableData), { layout: 'vertical', padStart: '  ' });
		}

		return {
			success: true,
			comment: {
				id: comment.id,
				task_id: comment.task_id,
				body: comment.body,
				user_id: comment.user_id,
				created_at: comment.created_at,
			},
			durationMs,
		};
	},
});

// ── Get ────────────────────────────────────────────────────────────────

const getCommentSubcommand = createCommand({
	name: 'get',
	aliases: ['show'],
	description: 'Get a comment by ID',
	tags: ['read-only', 'slow', 'requires-auth'],
	idempotent: true,
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud task comment get cmt_abc123'),
			description: 'Get comment details',
		},
	],
	schema: {
		args: z.object({
			commentId: z.string().min(1).describe('the comment ID to get'),
		}),
		response: z.object({
			success: z.boolean().describe('Whether the operation succeeded'),
			comment: z.object({
				id: z.string().describe('Comment ID'),
				task_id: z.string().describe('Task ID'),
				body: z.string().describe('Comment body'),
				user_id: z.string().describe('Author user ID'),
				author: z
					.object({
						id: z.string(),
						name: z.string(),
						type: z.enum(['human', 'agent']).optional(),
					})
					.optional()
					.describe('Author reference'),
				created_at: z.string().describe('Creation timestamp'),
				updated_at: z.string().describe('Last update timestamp'),
			}),
			durationMs: z.number().describe('Operation duration in milliseconds'),
		}),
	},

	async handler(ctx) {
		const { args, options } = ctx;
		const started = Date.now();
		const storage = await createStorageAdapterOptionalOrg(ctx);

		const comment = await storage.getComment(args.commentId);
		const durationMs = Date.now() - started;

		if (!options.json) {
			const tableData: Record<string, string> = {
				ID: comment.id,
				Task: comment.task_id,
				Body: comment.body,
				Author: comment.author
					? `${comment.author.name} (${comment.author.id})`
					: comment.user_id,
				Created: new Date(comment.created_at).toLocaleString(),
				Updated: new Date(comment.updated_at).toLocaleString(),
			};

			tui.table([tableData], Object.keys(tableData), { layout: 'vertical', padStart: '  ' });
		}

		return {
			success: true,
			comment: {
				id: comment.id,
				task_id: comment.task_id,
				body: comment.body,
				user_id: comment.user_id,
				author: comment.author,
				created_at: comment.created_at,
				updated_at: comment.updated_at,
			},
			durationMs,
		};
	},
});

// ── Update ─────────────────────────────────────────────────────────────

const updateCommentSubcommand = createCommand({
	name: 'update',
	aliases: ['edit'],
	description: 'Update a comment body',
	tags: ['mutating', 'slow', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud task comment update cmt_abc123 "Updated comment text"'),
			description: 'Update a comment',
		},
	],
	schema: {
		args: z.object({
			commentId: z.string().min(1).describe('the comment ID to update'),
			body: z.string().min(1).describe('the new comment text'),
		}),
		response: z.object({
			success: z.boolean().describe('Whether the operation succeeded'),
			comment: z.object({
				id: z.string().describe('Comment ID'),
				task_id: z.string().describe('Task ID'),
				body: z.string().describe('Updated comment body'),
				updated_at: z.string().describe('Last update timestamp'),
			}),
			durationMs: z.number().describe('Operation duration in milliseconds'),
		}),
	},

	async handler(ctx) {
		const { args, options } = ctx;
		const started = Date.now();
		const storage = await createStorageAdapter(ctx);

		const comment = await storage.updateComment(args.commentId, args.body);
		const durationMs = Date.now() - started;

		if (!options.json) {
			tui.success(`Comment updated: ${tui.bold(comment.id)}`);

			const tableData: Record<string, string> = {
				ID: comment.id,
				Task: comment.task_id,
				Body: comment.body,
				Updated: new Date(comment.updated_at).toLocaleString(),
			};

			tui.table([tableData], Object.keys(tableData), { layout: 'vertical', padStart: '  ' });
		}

		return {
			success: true,
			comment: {
				id: comment.id,
				task_id: comment.task_id,
				body: comment.body,
				updated_at: comment.updated_at,
			},
			durationMs,
		};
	},
});

// ── Delete ─────────────────────────────────────────────────────────────

const deleteCommentSubcommand = createCommand({
	name: 'delete',
	aliases: ['rm', 'remove'],
	description: 'Delete a comment',
	tags: ['mutating', 'slow', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud task comment delete cmt_abc123'),
			description: 'Delete a comment',
		},
	],
	schema: {
		args: z.object({
			commentId: z.string().min(1).describe('the comment ID to delete'),
		}),
		response: z.object({
			success: z.boolean().describe('Whether the operation succeeded'),
			commentId: z.string().describe('Deleted comment ID'),
			durationMs: z.number().describe('Operation duration in milliseconds'),
		}),
	},

	async handler(ctx) {
		const { args, options } = ctx;
		const started = Date.now();
		const storage = await createStorageAdapter(ctx);

		await storage.deleteComment(args.commentId);

		const durationMs = Date.now() - started;

		if (!options.json) {
			tui.success(`Comment deleted: ${tui.bold(args.commentId)}`);
		}

		return {
			success: true,
			commentId: args.commentId,
			durationMs,
		};
	},
});

// ── List ───────────────────────────────────────────────────────────────

const listCommentsSubcommand = createCommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List comments on a task',
	tags: ['read-only', 'slow', 'requires-auth'],
	idempotent: true,
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud task comment list task_abc123'),
			description: 'List all comments on a task',
		},
		{
			command: getCommand('cloud task comment list task_abc123 --limit 10'),
			description: 'List first 10 comments',
		},
	],
	schema: {
		args: z.object({
			taskId: z.string().min(1).describe('the task ID to list comments for'),
		}),
		options: z.object({
			limit: z.number().optional().describe('maximum number of comments to return'),
			offset: z.number().optional().describe('pagination offset'),
		}),
		response: z.object({
			success: z.boolean().describe('Whether the operation succeeded'),
			comments: z.array(
				z.object({
					id: z.string(),
					body: z.string(),
					user_id: z.string(),
					author: z
						.object({
							id: z.string(),
							name: z.string(),
							type: z.enum(['human', 'agent']).optional(),
						})
						.optional(),
					created_at: z.string(),
					updated_at: z.string(),
				})
			),
			total: z.number().describe('Total number of comments'),
			durationMs: z.number().describe('Operation duration in milliseconds'),
		}),
	},

	async handler(ctx) {
		const { args, opts, options } = ctx;
		const started = Date.now();
		const storage = await createStorageAdapterOptionalOrg(ctx);

		const result = await storage.listComments(args.taskId, {
			limit: opts.limit,
			offset: opts.offset,
		});

		const durationMs = Date.now() - started;

		if (!options.json) {
			if (result.comments.length === 0) {
				tui.info('No comments found');
			} else {
				const tableData = result.comments.map((c: Comment) => ({
					ID: tui.muted(truncate(c.id, 28)),
					Author: c.author?.name ?? c.user_id,
					Body: truncate(c.body, 60),
					Created: new Date(c.created_at).toLocaleDateString(),
				}));

				tui.table(tableData, [
					{ name: 'ID', alignment: 'left' },
					{ name: 'Author', alignment: 'left' },
					{ name: 'Body', alignment: 'left' },
					{ name: 'Created', alignment: 'left' },
				]);

				tui.info(
					`${result.total} ${tui.plural(result.total, 'comment', 'comments')} (${durationMs.toFixed(1)}ms)`
				);
			}
		}

		return {
			success: true,
			comments: result.comments.map((c: Comment) => ({
				id: c.id,
				body: c.body,
				user_id: c.user_id,
				author: c.author,
				created_at: c.created_at,
				updated_at: c.updated_at,
			})),
			total: result.total,
			durationMs,
		};
	},
});

// ── Parent command ──────────────────────────────────────────────────────

export const commentSubcommand = createCommand({
	name: 'comment',
	aliases: ['comments', 'cmt'],
	description: 'Manage task comments',
	tags: ['requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud task comment create task_abc123 "Looks good"'),
			description: 'Add a comment to a task',
		},
		{
			command: getCommand('cloud task comment list task_abc123'),
			description: 'List comments on a task',
		},
		{
			command: getCommand('cloud task comment get cmt_abc123'),
			description: 'Get a comment by ID',
		},
		{
			command: getCommand('cloud task comment update cmt_abc123 "Updated text"'),
			description: 'Update a comment',
		},
		{
			command: getCommand('cloud task comment delete cmt_abc123'),
			description: 'Delete a comment',
		},
	],
	subcommands: [
		createCommentSubcommand,
		getCommentSubcommand,
		updateCommentSubcommand,
		deleteCommentSubcommand,
		listCommentsSubcommand,
	],
});
