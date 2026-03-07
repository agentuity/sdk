import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { createStorageAdapter } from './util';
import { getCommand } from '../../../command-prefix';

// ── List ────────────────────────────────────────────────────────────────

const listUsersSubcommand = createCommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List all task users',
	tags: ['read-only', 'slow', 'requires-auth'],
	requires: { auth: true },
	idempotent: true,
	examples: [
		{
			command: getCommand('cloud task user list'),
			description: 'List all users',
		},
	],
	schema: {
		response: z.object({
			success: z.boolean(),
			users: z.array(
				z.object({
					id: z.string(),
					name: z.string(),
					type: z.string().optional(),
				})
			),
			total: z.number(),
			durationMs: z.number(),
		}),
	},

	async handler(ctx) {
		const { options } = ctx;
		const started = Date.now();
		const storage = await createStorageAdapter(ctx);
		const result = await storage.listUsers();
		const durationMs = Date.now() - started;

		if (!options.json) {
			if (result.users.length === 0) {
				tui.info('No users found.');
			} else {
				tui.table(
					result.users.map((u) => ({
						id: u.id,
						name: u.name,
						type: (u as { type?: string }).type ?? 'human',
					})),
					['id', 'name', 'type']
				);
				tui.info(`${result.users.length} user(s) (${durationMs.toFixed(1)}ms)`);
			}
		}

		return { success: true, users: result.users, total: result.users.length, durationMs };
	},
});

// ── Create ──────────────────────────────────────────────────────────────

const createUserSubcommand = createCommand({
	name: 'create',
	description: 'Create a new task user',
	tags: ['mutating', 'slow', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud task user create "Jane Doe"'),
			description: 'Create a human user',
		},
		{
			command: getCommand('cloud task user create "My Agent" --type agent'),
			description: 'Create an agent user',
		},
	],
	schema: {
		args: z.object({
			name: z.string().min(1).describe('the user display name'),
		}),
		options: z.object({
			type: z.enum(['human', 'agent']).optional().describe('user type (human or agent)'),
		}),
		response: z.object({
			success: z.boolean(),
			user: z.object({
				id: z.string(),
				name: z.string(),
				type: z.string().optional(),
			}),
			durationMs: z.number(),
		}),
	},

	async handler(ctx) {
		const { args, opts, options } = ctx;
		const started = Date.now();
		const storage = await createStorageAdapter(ctx);
		const user = await storage.createUser({ name: args.name, type: opts.type });
		const durationMs = Date.now() - started;

		if (!options.json) {
			tui.success(`Created user: ${user.name} (${user.id})`);
		}

		return { success: true, user, durationMs };
	},
});

// ── Get ─────────────────────────────────────────────────────────────────

const getUserSubcommand = createCommand({
	name: 'get',
	description: 'Get a task user by ID',
	tags: ['read-only', 'slow', 'requires-auth'],
	requires: { auth: true },
	idempotent: true,
	examples: [
		{
			command: getCommand('cloud task user get usr_abc123'),
			description: 'Get user details',
		},
	],
	schema: {
		args: z.object({
			id: z.string().min(1).describe('the user ID'),
		}),
		response: z.object({
			success: z.boolean(),
			user: z.object({
				id: z.string(),
				name: z.string(),
				type: z.string().optional(),
			}),
			durationMs: z.number(),
		}),
	},

	async handler(ctx) {
		const { args, options } = ctx;
		const started = Date.now();
		const storage = await createStorageAdapter(ctx);
		const user = await storage.getUser(args.id);
		const durationMs = Date.now() - started;

		if (!options.json) {
			tui.table(
				[{ id: user.id, name: user.name, type: (user as { type?: string }).type ?? 'human' }],
				['id', 'name', 'type'],
				{ layout: 'vertical' }
			);
		}

		return { success: true, user, durationMs };
	},
});

// ── Parent command ──────────────────────────────────────────────────────

export const userSubcommand = createCommand({
	name: 'user',
	description: 'Manage task users',
	tags: ['requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud task user list'),
			description: 'List all users',
		},
		{
			command: getCommand('cloud task user create "Jane Doe"'),
			description: 'Create a new user',
		},
		{
			command: getCommand('cloud task user get usr_abc123'),
			description: 'Get user details',
		},
	],
	subcommands: [listUsersSubcommand, createUserSubcommand, getUserSubcommand],
});
