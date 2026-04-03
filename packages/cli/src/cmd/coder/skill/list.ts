import { z } from 'zod';
import { CoderClient, type CoderSavedSkill, CoderSavedSkillSchema } from '@agentuity/core/coder';
import { ValidationOutputError } from '@agentuity/core';
import { createSubcommand } from '../../../types';
import * as tui from '../../../tui';
import { getCommand } from '../../../command-prefix';
import { ErrorCode } from '../../../errors';

function formatRelativeTime(isoDate: string): string {
	const diffMs = Date.now() - new Date(isoDate).getTime();
	const seconds = Math.floor(diffMs / 1000);
	if (seconds < 60) return `${seconds}s ago`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

export const listSubcommand = createSubcommand({
	name: 'list',
	aliases: ['ls'],
	description: 'List saved skills',
	tags: ['read-only', 'fast', 'requires-auth'],
	idempotent: true,
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand('coder skill list'),
			description: 'List saved skills',
		},
		{
			command: getCommand('coder skill list --json'),
			description: 'Return saved skills as JSON',
		},
	],
	schema: {
		options: z.object({
			url: z.string().optional().describe('Coder API URL override'),
		}),
		response: z.array(CoderSavedSkillSchema),
	},
	async handler(ctx) {
		const { options, opts } = ctx;
		const client = new CoderClient({
			apiKey: ctx.auth.apiKey,
			url: opts?.url,
			orgId: ctx.orgId,
		});

		let skills: CoderSavedSkill[] = [];
		try {
			const response = await client.listSavedSkills();
			skills = response.skills;
		} catch (err) {
			if (err instanceof ValidationOutputError) {
				ctx.logger.trace('Validation response URL: %s', err.url ?? 'unknown');
				ctx.logger.trace('Validation issues: %s', JSON.stringify(err.issues, null, 2));
			}
			const msg = err instanceof Error ? err.message : String(err);
			tui.fatal(`Failed to list Coder saved skills: ${msg}`, ErrorCode.NETWORK_ERROR);
		}

		if (options.json) {
			return skills;
		}

		if (skills.length === 0) {
			tui.info('No Coder saved skills found.');
			return [];
		}

		tui.table(
			skills.map((s) => ({
				ID: s.id,
				Name: s.name,
				Repo: s.repo,
				Source: s.source,
				Installs: s.installs !== undefined ? String(s.installs) : '-',
				Created: formatRelativeTime(s.createdAt),
			})),
			[
				{ name: 'ID', alignment: 'left' },
				{ name: 'Name', alignment: 'left' },
				{ name: 'Repo', alignment: 'left' },
				{ name: 'Source', alignment: 'left' },
				{ name: 'Installs', alignment: 'right' },
				{ name: 'Created', alignment: 'right' },
			]
		);

		return skills;
	},
});
