import { z } from 'zod';
import {
	CoderClient,
	type CoderSessionListItem,
	CoderSessionListItemSchema,
} from '@agentuity/core/coder';
import { ValidationOutputError } from '@agentuity/core';
import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { getCommand } from '../../command-prefix';
import { ErrorCode } from '../../errors';

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
	description: 'List active Coder Hub sessions',
	tags: ['read-only', 'fast', 'requires-auth'],
	examples: [
		{
			command: getCommand('coder ls'),
			description: 'List all active sessions',
		},
		{
			command: getCommand('coder list --json'),
			description: 'List sessions as JSON',
		},
	],
	aliases: ['ls'],
	idempotent: true,
	requires: { auth: true, org: true },
	schema: {
		options: z.object({
			url: z.string().optional().describe('Coder API URL override'),
		}),
		response: z.array(CoderSessionListItemSchema),
	},
	async handler(ctx) {
		const { options, opts } = ctx;
		const client = new CoderClient({
			apiKey: ctx.auth.apiKey,
			url: opts?.url,
			orgId: ctx.orgId,
		});

		let sessions: CoderSessionListItem[] = [];
		try {
			const response = await client.listSessions();
			sessions = response.sessions;
		} catch (err) {
			if (err instanceof ValidationOutputError) {
				ctx.logger.trace('Validation response URL: %s', err.url ?? 'unknown');
				ctx.logger.trace('Validation issues: %s', JSON.stringify(err.issues, null, 2));
			}
			const msg = err instanceof Error ? err.message : String(err);
			tui.fatal(`Failed to list Coder sessions: ${msg}`, ErrorCode.NETWORK_ERROR);
		}

		if (options.json) {
			return sessions;
		}

		if (sessions.length === 0) {
			tui.info('No active Coder Hub sessions.');
			return [];
		}

		const tableData = sessions.map((s) => ({
			'Session ID': s.sessionId,
			Label: s.label || '-',
			Status: s.status,
			Mode: s.mode,
			Owner: s.owner?.name ?? s.owner?.userId ?? '-',
			Observers: String(s.observerCount),
			Agents: String(s.subAgentCount),
			Tasks: String(s.taskCount),
			Created: formatRelativeTime(s.createdAt),
		}));

		tui.table(tableData, [
			{ name: 'Session ID', alignment: 'left' },
			{ name: 'Label', alignment: 'left' },
			{ name: 'Status', alignment: 'center' },
			{ name: 'Mode', alignment: 'center' },
			{ name: 'Owner', alignment: 'left' },
			{ name: 'Observers', alignment: 'right' },
			{ name: 'Agents', alignment: 'right' },
			{ name: 'Tasks', alignment: 'right' },
			{ name: 'Created', alignment: 'right' },
		]);

		return sessions;
	},
});
