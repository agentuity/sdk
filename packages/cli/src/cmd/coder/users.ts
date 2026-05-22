import { z } from 'zod';
import { CoderClient, type CoderUser } from '@agentuity/core/coder';
import { ValidationOutputError } from '@agentuity/core';
import { createSubcommand } from '../../types.ts';
import * as tui from '../../tui.ts';
import { getCommand } from '../../command-prefix.ts';
import { ErrorCode } from '../../errors.ts';

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

export const usersSubcommand = createSubcommand({
	name: 'users',
	aliases: ['user'],
	description: 'List known Coder users',
	tags: ['read-only', 'fast', 'requires-auth'],
	idempotent: true,
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand('coder users'),
			description: 'List known users',
		},
		{
			command: getCommand('coder users --search jenny'),
			description: 'Filter users by display name',
		},
		{
			command: getCommand('coder users --json'),
			description: 'Return users as JSON',
		},
	],
	schema: {
		options: z.object({
			search: z.string().optional().describe('Filter users by display name'),
			url: z.string().optional().describe('Coder API URL override'),
		}),
	},
	async handler(ctx) {
		const { options, opts } = ctx;
		const client = new CoderClient({
			apiKey: ctx.auth.apiKey,
			url: opts?.url,
			orgId: ctx.orgId,
		});

		let users: CoderUser[] = [];
		try {
			const response = await client.listUsers({ search: opts?.search });
			users = response.users;
		} catch (err) {
			if (err instanceof ValidationOutputError) {
				ctx.logger.trace('Validation response URL: %s', err.url ?? 'unknown');
				ctx.logger.trace('Validation issues: %s', JSON.stringify(err.issues, null, 2));
			}
			const msg = err instanceof Error ? err.message : String(err);
			tui.fatal(`Failed to list Coder users: ${msg}`, ErrorCode.NETWORK_ERROR);
		}

		if (options.json) {
			return users;
		}

		if (users.length === 0) {
			tui.info('No Coder users found.');
			return [];
		}

		tui.table(
			users.map((u) => ({
				User: u.displayName,
				Email: u.email,
				Provider: u.provider,
				'Last Login': formatRelativeTime(u.lastLoginAt),
				'Last Seen': formatRelativeTime(u.lastSeenAt),
				Joined: formatRelativeTime(u.createdAt),
			})),
			[
				{ name: 'User', alignment: 'left' },
				{ name: 'Email', alignment: 'left' },
				{ name: 'Provider', alignment: 'left' },
				{ name: 'Last Login', alignment: 'right' },
				{ name: 'Last Seen', alignment: 'right' },
				{ name: 'Joined', alignment: 'right' },
			]
		);

		return users;
	},
});
