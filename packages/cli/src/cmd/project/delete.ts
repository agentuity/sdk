import { z } from 'zod';
import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { projectDelete, projectList, projectGet, listOrganizations } from '@agentuity/server';
import enquirer from 'enquirer';
import { getCommand } from '../../command-prefix';

interface ProjectDisplayInfo {
	id: string;
	name: string;
	orgName: string;
}

function formatProjectDisplay(project: ProjectDisplayInfo): string {
	return `${project.orgName}/${project.name} (${project.id})`;
}

export const deleteSubcommand = createSubcommand({
	name: 'delete',
	description: 'Delete a project',
	tags: ['destructive', 'deletes-resource', 'slow', 'requires-auth'],
	aliases: ['rm', 'del'],
	requires: { auth: true, apiClient: true },
	idempotent: false,
	examples: [
		{ command: getCommand('project delete'), description: 'Delete item' },
		{ command: getCommand('project delete proj_abc123def456'), description: 'Delete item' },
		{
			command: getCommand('project delete proj_abc123def456 --confirm'),
			description: 'Use confirm option',
		},
		{ command: getCommand('project rm proj_abc123def456'), description: 'Delete item' },
		{
			command: getCommand('--explain project delete proj_abc123def456'),
			description: 'Delete item',
		},
		{
			command: getCommand('--dry-run project delete proj_abc123def456'),
			description: 'Delete item',
		},
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

		let projectsToDelete: ProjectDisplayInfo[] = [];

		if (args.id) {
			// Command line argument provided - validate and fetch project details
			const projectInfo = await tui.spinner({
				message: 'Fetching project details',
				clearOnSuccess: true,
				callback: async () => {
					try {
						const project = await projectGet(apiClient, { id: args.id!, mask: true, keys: false });

						// Fetch org name
						let orgName = project.orgId;
						try {
							const orgs = await listOrganizations(apiClient);
							const org = orgs.find((o) => o.id === project.orgId);
							if (org) {
								orgName = org.name;
							}
						} catch {
							// Fall back to orgId if org lookup fails
						}

						return {
							id: project.id,
							name: project.name,
							orgName,
						};
					} catch {
						return null;
					}
				},
			});

			if (!projectInfo) {
				tui.error(`Project not found: ${args.id}`);
				return { success: false, projectIds: [], count: 0 };
			}

			projectsToDelete = [projectInfo];
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

			// Map selected IDs to full project info
			projectsToDelete = response.projects
				.map((id) => {
					const project = projects.find((p) => p.id === id);
					return project ? { id: project.id, name: project.name, orgName: project.orgName } : null;
				})
				.filter((p): p is ProjectDisplayInfo => p !== null);
		}

		if (projectsToDelete.length === 0) {
			tui.info('No projects selected for deletion');
			return { success: false, projectIds: [], count: 0 };
		}

		const skipConfirm = opts?.confirm === true;

		if (!process.stdout.isTTY && !skipConfirm) {
			tui.fatal('no TTY and --confirm is false');
		}

		// Confirm deletion
		if (!skipConfirm) {
			const projectDisplay =
				projectsToDelete.length === 1
					? formatProjectDisplay(projectsToDelete[0])
					: projectsToDelete.map((p) => `\n  • ${formatProjectDisplay(p)}`).join('');
			tui.warning(`You are about to delete: ${tui.bold(projectDisplay)}`);

			const confirm = await enquirer.prompt<{ confirm: boolean }>({
				type: 'confirm',
				name: 'confirm',
				message: `Are you sure you want to delete ${projectsToDelete.length > 1 ? 'these projects' : 'this project'}?`,
				initial: false,
			});

			if (!confirm.confirm) {
				tui.info('Deletion cancelled');
				return { success: false, projectIds: [], count: 0 };
			}
		}

		const projectIds = projectsToDelete.map((p) => p.id);
		const deleted = await tui.spinner({
			message: `Deleting ${projectsToDelete.length} project(s)`,
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
