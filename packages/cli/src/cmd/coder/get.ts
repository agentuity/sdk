import { z } from 'zod';
import {
	CoderClient,
	CoderSessionArchivedError,
	CoderSessionNotFoundError,
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

function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	const remainSec = seconds % 60;
	if (minutes < 60) return `${minutes}m ${remainSec}s`;
	const hours = Math.floor(minutes / 60);
	const remainMin = minutes % 60;
	return `${hours}h ${remainMin}m`;
}

export const getSubcommand = createSubcommand({
	name: 'get',
	aliases: ['show', 'inspect'],
	description: 'Show detailed information about a Coder Hub session',
	tags: ['read-only', 'fast', 'requires-auth'],
	requires: { auth: true, org: true },
	examples: [
		{
			command: getCommand('coder get codesess_abc123'),
			description: 'Get a session by ID',
		},
		{
			command: getCommand('coder get codesess_abc123 --json'),
			description: 'Get session details as JSON',
		},
	],
	idempotent: true,
	schema: {
		args: z.object({
			session_id: z.string().describe('Coder session ID to inspect'),
		}),
		options: z.object({
			url: z.string().optional().describe('Coder API URL override'),
		}),
	},
	async handler(ctx) {
		const { args, options, opts } = ctx;
		const sessionId = args.session_id;
		const client = new CoderClient({
			apiKey: ctx.auth.apiKey,
			url: opts?.url,
			orgId: ctx.orgId,
		});

		let data: {
			sessionId: string;
			label: string;
			status: string;
			createdAt: string;
			mode: string;
			context?: {
				branch?: string;
				workingDirectory?: string;
			};
			participants?: Array<{
				id: string;
				role: string;
				transport: string;
				connectedAt: string;
				idle: boolean;
			}>;
			tasks?: Array<{
				taskId: string;
				agent: string;
				status: string;
				prompt: string;
				duration?: number;
				startedAt: string;
				completedAt?: string;
			}>;
			agentActivity?: Record<
				string,
				{
					name: string;
					status: string;
					currentTool?: string;
					toolCallCount: number;
					lastActivity: number;
				}
			>;
		};

		try {
			data = (await client.getSession(sessionId)) as unknown as typeof data;
		} catch (err) {
			if (err instanceof CoderSessionNotFoundError) {
				tui.fatal(`Session not found: ${sessionId}`, ErrorCode.RESOURCE_NOT_FOUND);
				return;
			}
			if (err instanceof CoderSessionArchivedError) {
				tui.fatal(`Session has shut down: ${sessionId}`, ErrorCode.RESOURCE_NOT_FOUND);
				return;
			}

			if (err instanceof ValidationOutputError) {
				ctx.logger.trace('Validation response URL: %s', err.url ?? 'unknown');
				ctx.logger.trace('Validation issues: %s', JSON.stringify(err.issues, null, 2));
			}
			const msg = err instanceof Error ? err.message : String(err);
			tui.fatal(`Failed to inspect Coder session ${sessionId}: ${msg}`, ErrorCode.NETWORK_ERROR);
			return;
		}

		if (options.json) {
			return data;
		}

		// Header
		const label = data.label || data.sessionId;
		console.log();
		console.log(`  Session: ${label} (${data.sessionId})`);
		const parts = [`Status: ${data.status}`, `Mode: ${data.mode}`];
		if (data.context?.branch) parts.push(`Branch: ${data.context.branch}`);
		console.log(`  ${parts.join(' | ')}`);
		console.log(`  Created: ${data.createdAt}`);

		// Participants
		console.log();
		console.log('  Participants:');
		const participants = data.participants ?? [];
		if (participants.length === 0) {
			console.log('    (none)');
		} else {
			for (const p of participants) {
				const idle = p.idle ? '  (idle)' : '';
				const connected = p.connectedAt
					? `  connected ${formatRelativeTime(p.connectedAt)}`
					: '';
				console.log(
					`    ${p.id.padEnd(12)} ${p.role.padEnd(10)} ${p.transport}${connected}${idle}`
				);
			}
		}

		// Tasks
		const tasks = data.tasks ?? [];
		if (tasks.length > 0) {
			console.log();
			console.log('  Tasks:');
			for (const t of tasks) {
				const dur = t.duration ? formatDuration(t.duration) : '-';
				const prompt = t.prompt.length > 40 ? t.prompt.slice(0, 37) + '...' : t.prompt;
				console.log(
					`    ${t.taskId.padEnd(10)} ${t.agent.padEnd(10)} ${t.status.padEnd(10)} ${prompt.padEnd(42)} ${dur}`
				);
			}
		}

		// Agent Activity
		const agents = Object.values(data.agentActivity ?? {});
		if (agents.length > 0) {
			console.log();
			console.log('  Agent Activity:');
			for (const a of agents) {
				const tool = a.currentTool
					? `${a.currentTool} (${a.toolCallCount} calls)`
					: `${a.toolCallCount} calls`;
				const lastAct = a.lastActivity
					? formatRelativeTime(new Date(a.lastActivity).toISOString())
					: '-';
				console.log(
					`    ${a.name.padEnd(12)} ${a.status.padEnd(8)} ${tool.padEnd(28)} last: ${lastAct}`
				);
			}
		}

		console.log();

		return data;
	},
});
