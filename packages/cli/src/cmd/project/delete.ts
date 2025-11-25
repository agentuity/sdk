import { z } from 'zod';
import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { projectDelete, projectList } from '@agentuity/server';
import enquirer from 'enquirer';
import { getCommand } from '../../command-prefix';

export const deleteSubcommand = createSubcommand({
	name: 'delete',
	description: 'Delete a project',
	tags: ['destructive', 'deletes-resource', 'slow', 'requires-auth'],
	aliases: ['rm', 'del'],
	requires: { auth: true, apiClient: true },
	idempotent: false,
	examples: [
		getCommand('project delete'),
		getCommand('project delete proj_abc123def456'),
		getCommand('project delete proj_abc123def456 --confirm'),
		getCommand('project rm proj_abc123def456'),
		getCommand('--explain project delete proj_abc123def456'),
		getCommand('--dry-run project delete proj_abc123def456'),
	],
	schema: {
		args: z.object({
			id: z.string().optional().describe('the project id'),
		}),
		options: z.object({
			confirm: z.boolean().optional().describe('Skip confirmation prompts'),
		}),
		response: z.object({
			success: z.boolean().describe('Whether the deletion succeeded'),
			projectIds: z.array(z.string()).describe('Deleted project IDs'),
			count: z.number().describe('Number of projects deleted'),
		}),
	},

	async handler(ctx) {
		const { args, opts, apiClient } = ctx;

		let projectIds: string[] = [];

		if (args.id) {
			// Command line argument provided
			projectIds = [args.id];
		} else {
			// Check TTY before attempting to prompt
			if (!process.stdin.isTTY) {
				tui.fatal('--id is required in non-interactive mode');
			}

			// Fetch projects and prompt for selection
			const projects = await tui.spinner({
				message: 'Fetching projects',
				clearOnSuccess: true,
				callback: async () => {
					return projectList(apiClient);
				},
			});

			if (projects.length === 0) {
				tui.info('No projects found to delete');
				return { success: false, projectIds: [], count: 0 };
			}

			// Sort projects by name
			projects.sort((a, b) => a.name.localeCompare(b.name));

			// Build choices for multi-select
			const choices: Array<{ name: string; message: string }> = projects.map((project) => ({
				name: project.id,
				message: `${project.name.padEnd(25)} ${tui.muted(project.id)} (${project.orgName})`,
			}));

			const response = await enquirer.prompt<{ projects: string[] }>({
				type: 'multiselect',
				name: 'projects',
				message: 'Select project(s) to delete:',
				choices,
			});

			projectIds = response.projects;
		}

		if (projectIds.length === 0) {
			tui.info('No projects selected for deletion');
			return { success: false, projectIds: [], count: 0 };
		}

		const skipConfirm = opts?.confirm === true;

		if (!process.stdout.isTTY && !skipConfirm) {
			tui.fatal('no TTY and --confirm is false');
		}

		// Confirm deletion
		if (!skipConfirm) {
			const projectNames = projectIds.join(', ');
			tui.warning(`You are about to delete: ${tui.bold(projectNames)}`);

			const confirm = await enquirer.prompt<{ confirm: boolean }>({
				type: 'confirm',
				name: 'confirm',
				message: `Are you sure you want to delete ${projectIds.length > 1 ? 'these projects' : 'this project'}?`,
				initial: false,
			});

			if (!confirm.confirm) {
				tui.info('Deletion cancelled');
				return { success: false, projectIds: [], count: 0 };
			}
		}

		const deleted = await tui.spinner({
			message: `Deleting ${projectIds.length} project(s)`,
			clearOnSuccess: true,
			callback: async () => {
				return projectDelete(apiClient, ...projectIds);
			},
		});

		if (deleted.length > 0) {
			tui.success(`Deleted ${deleted.length} project(s): ${deleted.join(', ')}`);
		} else {
			tui.error('Failed to delete projects');
		}

		return {
			success: deleted.length > 0,
			projectIds: deleted,
			count: deleted.length,
		};
	},
});
