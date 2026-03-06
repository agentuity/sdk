import { z } from 'zod';
import { createSubcommand } from '../../types';
import * as tui from '../../tui';
import { getCommand } from '../../command-prefix';
import { ErrorCode } from '../../errors';
import { resolveHubUrl, hubFetchHeaders } from './hub-url';

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

const SessionListResponseSchema = z.array(
	z.object({
		sessionId: z.string().describe('Session ID'),
		label: z.string().describe('Human-readable session label'),
		status: z.string().describe('Session status'),
		mode: z.string().describe('Session mode (sandbox or tui)'),
		createdAt: z.string().describe('Creation timestamp'),
		taskCount: z.number().describe('Number of tasks'),
		subAgentCount: z.number().describe('Number of sub-agents'),
		observerCount: z.number().describe('Number of observers'),
		participantCount: z.number().describe('Total participant count'),
	})
);

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
	schema: {
		options: z.object({
			hubUrl: z.string().optional().describe('Hub URL override'),
		}),
		response: SessionListResponseSchema,
	},
	async handler(ctx) {
		const { options, opts } = ctx;
		const hubUrl = await resolveHubUrl(opts?.hubUrl);

		if (!hubUrl) {
			tui.fatal(
				'Could not find a running Coder Hub.\n\nEither:\n  - Start the Hub with: bun run dev\n  - Set AGENTUITY_CODER_HUB_URL environment variable\n  - Pass --hub-url flag',
				ErrorCode.NETWORK_ERROR
			);
			return [];
		}

		let data: {
			sessions: {
				websocket: Array<{
					sessionId: string;
					label: string;
					status: string;
					mode: string;
					createdAt: string;
					taskCount: number;
					subAgentCount: number;
					observerCount: number;
					participantCount: number;
				}>;
				sandbox: Array<Record<string, unknown>>;
			};
			total: number;
		};

		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 10_000);
			const resp = await fetch(`${hubUrl}/api/hub/sessions`, {
				headers: hubFetchHeaders(),
				signal: controller.signal,
			});
			clearTimeout(timeout);
			if (!resp.ok) {
				tui.fatal(
					`Hub returned ${resp.status}: ${resp.statusText}. Is the Coder Hub running at ${hubUrl}?`,
					ErrorCode.API_ERROR
				);
				return [];
			}
			data = (await resp.json()) as typeof data;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			tui.fatal(
				`Could not connect to Coder Hub at ${hubUrl}: ${msg}\n\nSet AGENTUITY_CODER_HUB_URL or start the Hub with: bun run dev`,
				ErrorCode.NETWORK_ERROR
			);
			return [];
		}

		const sessions = data.sessions.websocket;

		if (options.json) {
			return sessions;
		}

		if (sessions.length === 0) {
			tui.info('No active Coder Hub sessions.');
			return [];
		}

		const tableData = sessions.map((s) => ({
			'Session ID': s.sessionId.length > 20 ? s.sessionId.slice(0, 17) + '...' : s.sessionId,
			Label: s.label || '-',
			Status: s.status,
			Mode: s.mode,
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
			{ name: 'Observers', alignment: 'right' },
			{ name: 'Agents', alignment: 'right' },
			{ name: 'Tasks', alignment: 'right' },
			{ name: 'Created', alignment: 'right' },
		]);

		return sessions;
	},
});
