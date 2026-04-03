import { z } from 'zod';
import { CoderClient } from '@agentuity/core/coder';
import { ValidationOutputError } from '@agentuity/core';
import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { getCommand } from '../../command-prefix';
import { ErrorCode } from '../../errors';

function formatRelativeTime(isoDate: string): string {
	const parsed = new Date(isoDate).getTime();
	if (Number.isNaN(parsed)) return 'unknown';
	const diffMs = Math.max(0, Date.now() - parsed);
	const seconds = Math.floor(diffMs / 1000);
	if (seconds < 60) return `${seconds}s ago`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

export const participantsSubcommand = createSubcommand({
	name: 'participants',
	aliases: ['participant', 'members'],
	description: 'List participants for a Coder session',
	tags: ['read-only', 'fast', 'requires-auth'],
	idempotent: true,
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand('coder participants codesess_abc123'),
			description: 'List session participants',
		},
		{
			command: getCommand('coder participants codesess_abc123 --json'),
			description: 'Get session participants as JSON',
		},
	],
	schema: {
		args: z.object({
			sessionId: z.string().describe('Session ID to list participants for'),
		}),
		options: z.object({
			url: z.string().optional().describe('Coder API URL override'),
		}),
	},
	async handler(ctx) {
		const { args, opts, options } = ctx;
		const client = new CoderClient({
			apiKey: ctx.auth.apiKey,
			url: opts?.url,
			orgId: ctx.orgId,
		});

		try {
			const data = await client.listParticipants(args.sessionId);

			if (options.json) {
				return data;
			}

			if (data.participants.length === 0) {
				tui.info(`No participants found for session ${args.sessionId}.`);
				return data;
			}

			tui.table(
				data.participants.map((p) => ({
					ID: p.id,
					Role: p.role,
					'Agent Role': p.agentRole ?? '-',
					Transport: p.transport ?? '-',
					Connected: p.connectedAt ? formatRelativeTime(p.connectedAt) : '-',
					'Last Activity': p.lastActivityAt ? formatRelativeTime(p.lastActivityAt) : '-',
				})),
				[
					{ name: 'ID', alignment: 'left' },
					{ name: 'Role', alignment: 'left' },
					{ name: 'Agent Role', alignment: 'left' },
					{ name: 'Transport', alignment: 'center' },
					{ name: 'Connected', alignment: 'right' },
					{ name: 'Last Activity', alignment: 'right' },
				]
			);

			return data;
		} catch (err) {
			if (err instanceof ValidationOutputError) {
				ctx.logger.trace('Validation response URL: %s', err.url ?? 'unknown');
				ctx.logger.trace('Validation issues: %s', JSON.stringify(err.issues, null, 2));
			}
			const msg = err instanceof Error ? err.message : String(err);
			tui.fatal(
				`Failed to list participants for session ${args.sessionId}: ${msg}`,
				ErrorCode.NETWORK_ERROR
			);
		}
	},
});
