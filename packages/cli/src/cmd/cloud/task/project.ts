import { z } from 'zod';
import { createCommand } from '../../../types.ts';
import * as tui from '../../../tui.ts';
import { createStorageAdapter } from './util.ts';
import { getCommand } from '../../../command-prefix.ts';

// ── List ────────────────────────────────────────────────────────────────

const listProjectsSubcommand = createCommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List all task projects',
	tags: ['read-only', 'slow', 'requires-auth'],
	requires: { auth: true },
	idempotent: true,
	examples: [
		{
			command: getCommand('cloud task project list'),
			description: 'List all projects',
		},
	],
	schema: {
		response: z.object({
			success: z.boolean(),
			projects: z.array(z.object({ id: z.string(), name: z.string() })),
			total: z.number(),
			durationMs: z.number(),
		}),
	},

	async handler(ctx) {
		const { options } = ctx;
		const started = Date.now();
		const storage = await createStorageAdapter(ctx);
		const result = await storage.listProjects();
		const durationMs = Date.now() - started;

		if (!options.json) {
			if (result.projects.length === 0) {
				tui.info('No projects found.');
			} else {
				tui.table(
					result.projects.map((p) => ({ id: p.id, name: p.name })),
					['id', 'name']
				);
				tui.info(`${result.projects.length} project(s) (${durationMs.toFixed(1)}ms)`);
			}
		}

		return {
			success: true,
			projects: result.projects,
			total: result.projects.length,
			durationMs,
		};
	},
});

// ── Create ──────────────────────────────────────────────────────────────

const createProjectSubcommand = createCommand({
	name: 'create',
	description: 'Create a new task project',
	tags: ['mutating', 'slow', 'requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud task project create "My Project"'),
			description: 'Create a new project',
		},
	],
	schema: {
		args: z.object({
			name: z.string().min(1).describe('the project name'),
		}),
		response: z.object({
			success: z.boolean(),
			project: z.object({ id: z.string(), name: z.string() }),
			durationMs: z.number(),
		}),
	},

	async handler(ctx) {
		const { args, options } = ctx;
		const started = Date.now();
		const storage = await createStorageAdapter(ctx);
		const project = await storage.createProject({ name: args.name });
		const durationMs = Date.now() - started;

		if (!options.json) {
			tui.success(`Created project: ${project.name} (${project.id})`);
		}

		return { success: true, project, durationMs };
	},
});

// ── Get ─────────────────────────────────────────────────────────────────

const getProjectSubcommand = createCommand({
	name: 'get',
	description: 'Get a task project by ID',
	tags: ['read-only', 'slow', 'requires-auth'],
	requires: { auth: true },
	idempotent: true,
	examples: [
		{
			command: getCommand('cloud task project get prj_abc123'),
			description: 'Get project details',
		},
	],
	schema: {
		args: z.object({
			id: z.string().min(1).describe('the project ID'),
		}),
		response: z.object({
			success: z.boolean(),
			project: z.object({ id: z.string(), name: z.string() }),
			durationMs: z.number(),
		}),
	},

	async handler(ctx) {
		const { args, options } = ctx;
		const started = Date.now();
		const storage = await createStorageAdapter(ctx);
		try {
			const project = await storage.getProject(args.id);
			const durationMs = Date.now() - started;

			if (!options.json) {
				tui.table([{ id: project.id, name: project.name }], ['id', 'name'], {
					layout: 'vertical',
				});
			}

			return { success: true, project, durationMs };
		} catch (_err) {
			const durationMs = Date.now() - started;
			if (!options.json) {
				tui.error(`Project not found: ${args.id}`);
			}
			return { success: false, project: { id: args.id, name: '' }, durationMs };
		}
	},
});

// ── Delete ──────────────────────────────────────────────────────────────

const deleteProjectSubcommand = createCommand({
	name: 'delete',
	aliases: ['del', 'rm'],
	description: 'Delete a task project',
	tags: ['mutating', 'slow', 'requires-auth', 'destructive'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud task project delete prj_abc123'),
			description: 'Delete a project',
		},
	],
	schema: {
		args: z.object({
			id: z.string().min(1).describe('the project ID'),
		}),
		response: z.object({
			success: z.boolean(),
			durationMs: z.number(),
		}),
	},

	async handler(ctx) {
		const { args, options } = ctx;
		const started = Date.now();
		const storage = await createStorageAdapter(ctx);
		try {
			await storage.deleteProject(args.id);
			const durationMs = Date.now() - started;

			if (!options.json) {
				tui.success(`Deleted project: ${args.id}`);
			}

			return { success: true, durationMs };
		} catch (_err) {
			const durationMs = Date.now() - started;
			if (!options.json) {
				tui.error(`Failed to delete project: ${args.id}`);
			}
			return { success: false, durationMs };
		}
	},
});

// ── Parent command ──────────────────────────────────────────────────────

export const projectSubcommand = createCommand({
	name: 'project',
	aliases: ['proj'],
	description: 'Manage task projects',
	tags: ['requires-auth'],
	requires: { auth: true },
	examples: [
		{
			command: getCommand('cloud task project list'),
			description: 'List all projects',
		},
		{
			command: getCommand('cloud task project create "My Project"'),
			description: 'Create a new project',
		},
		{
			command: getCommand('cloud task project get prj_abc123'),
			description: 'Get project details',
		},
		{
			command: getCommand('cloud task project delete prj_abc123'),
			description: 'Delete a project',
		},
	],
	subcommands: [
		listProjectsSubcommand,
		createProjectSubcommand,
		getProjectSubcommand,
		deleteProjectSubcommand,
	],
});
