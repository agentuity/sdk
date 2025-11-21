import { z } from 'zod';
import { listResources, deleteResources } from '@agentuity/server';
import enquirer from 'enquirer';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCatalystAPIClient } from '../../../config';
import { getCommand } from '../../../command-prefix';

export const deleteSubcommand = createSubcommand({
	name: 'delete',
	description: 'Delete cloud resource(s) for an organization',
	tags: ['destructive', 'deletes-resource', 'slow', 'requires-auth', 'requires-deployment'],
	aliases: ['rm', 'del', 'remove'],
	idempotent: false,
	requires: { auth: true, org: true, region: true },
	examples: [
		getCommand('cloud resource delete'),
		getCommand('cloud resource delete --type db --name my-database'),
		getCommand('cloud resource delete --type s3 --name uploads'),
		getCommand('--explain cloud resource delete --type db --name old-db'),
		getCommand('--dry-run cloud resource rm --type s3 --name temp-bucket'),
	],
	schema: {
		options: z.object({
			type: z.enum(['db', 's3']).optional().describe('Resource type (db or s3)'),
			name: z.string().optional().describe('Resource name to delete'),
			confirm: z.boolean().optional().describe('Skip confirmation prompts'),
		}),
		response: z.object({
			success: z.boolean().describe('Whether deletion succeeded'),
			count: z.number().describe('Number of resources deleted'),
			resources: z.array(z.string()).describe('Deleted resource names'),
		}),
	},

	async handler(ctx) {
		const { logger, opts, config, orgId, region, auth } = ctx;

		const catalystClient = getCatalystAPIClient(config, logger, auth);

		// Determine what to delete
		let resourcesToDelete: Array<{ type: 'db' | 's3'; name: string }> = [];

		if (opts.type && opts.name) {
			// Command line arguments provided
			resourcesToDelete = [{ type: opts.type, name: opts.name }];
		} else {
			// Fetch resources and prompt for selection
			const resources = await tui.spinner({
				message: `Fetching resources for ${orgId} in ${region}`,
				clearOnSuccess: true,
				callback: async () => {
					return listResources(catalystClient, orgId, region!);
				},
			});

			if (resources.db.length === 0 && resources.s3.length === 0) {
				tui.info('No resources found to delete');
				return { success: false, count: 0, resources: [] };
			}

			// Build choices for multi-select and resource map
			const choices: Array<{ name: string; message: string }> = [];
			const resourceMap = new Map<string, { type: 'db' | 's3'; name: string }>();

			for (const db of resources.db) {
				const key = `db:${db.name}`;
				choices.push({
					name: key,
					message: `Database: ${db.name}`,
				});
				resourceMap.set(key, { type: 'db', name: db.name });
			}

			for (const s3 of resources.s3) {
				const key = `s3:${s3.bucket_name}`;
				choices.push({
					name: key,
					message: `Storage: ${s3.bucket_name}`,
				});
				resourceMap.set(key, { type: 's3', name: s3.bucket_name });
			}

			const response = await enquirer.prompt<{ resources: string[] }>({
				type: 'multiselect',
				name: 'resources',
				message: 'Select resource(s) to delete:',
				choices,
			});

			// Map selected keys back to resource objects
			resourcesToDelete = response.resources
				.map((key) => resourceMap.get(key))
				.filter((r): r is { type: 'db' | 's3'; name: string } => r !== undefined);
		}

		if (resourcesToDelete.length === 0) {
			tui.info('No resources selected for deletion');
			return { success: false, count: 0, resources: [] };
		}

		// Confirm deletion
		if (!opts.confirm) {
			const resourceNames = resourcesToDelete.map((r) => `${r.type}:${r.name}`).join(', ');
			tui.warning(`You are about to delete: ${tui.bold(resourceNames)}`);

			const confirm = await enquirer.prompt<{ confirm: boolean }>({
				type: 'confirm',
				name: 'confirm',
				message: 'Are you sure you want to delete these resources?',
				initial: false,
			});

			if (!confirm.confirm) {
				tui.info('Deletion cancelled');
				return { success: false, count: 0, resources: [] };
			}
		}

		// Delete resources
		const deleted = await tui.spinner({
			message: `Deleting ${resourcesToDelete.length} resource(s)`,
			clearOnSuccess: true,
			callback: async () => {
				return deleteResources(catalystClient, orgId, region!, resourcesToDelete);
			},
		});

		if (deleted.length > 0) {
			tui.success(`Deleted ${deleted.length} resource(s): ${deleted.join(', ')}`);
		} else {
			tui.error('Failed to delete resources');
		}

		return {
			success: deleted.length > 0,
			count: deleted.length,
			resources: deleted,
		};
	},
});
