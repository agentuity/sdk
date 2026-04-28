import { z } from 'zod';
import {
	getMonitorNode,
	listDistressedNodes,
	listMonitorNodeContainers,
	listMonitorNodes,
	MonitorWebSocketClient,
	type MachineMonitorState,
	type MonitorMessage,
	type MonitorScope,
} from '@agentuity/core';
import { getAPIBaseURL } from '../../api.ts';
import { getCommand } from '../../command-prefix.ts';
import { createSubcommand } from '../../types.ts';
import * as tui from '../../tui.ts';

const monitorOptionsSchema = z.object({
	machine: z.string().optional().describe('Monitor a specific machine id'),
	deployment: z.string().optional().describe('Monitor machines for a deployment id'),
	distressed: z.boolean().optional().describe('Only include distressed machines'),
	snapshot: z.boolean().optional().describe('One-shot snapshot (no stream watch)'),
});

export const monitorSubcommand = createSubcommand({
	name: 'monitor',
	description: 'Monitor infrastructure machines in real time',
	tags: ['read-only', 'slow', 'requires-auth'],
	requires: { auth: true, apiClient: true },
	optional: { org: true },
	idempotent: true,
	examples: [
		{ command: getCommand('cloud monitor --snapshot'), description: 'Show a monitor snapshot' },
		{
			command: getCommand('cloud monitor --distressed'),
			description: 'Watch distressed machines',
		},
		{ command: getCommand('cloud monitor --machine mach_123'), description: 'Watch one machine' },
	],
	schema: {
		options: monitorOptionsSchema,
	},
	webUrl: '/infrastructure/monitoring',

	async handler(ctx) {
		const { apiClient, options, opts, auth, config, orgId } = ctx;

		if (opts.machine && opts.distressed) {
			ctx.logger.fatal('--machine and --distressed are mutually exclusive.');
		}

		if (opts.deployment && opts.distressed) {
			ctx.logger.fatal('--deployment and --distressed are mutually exclusive.');
		}

		if (opts.snapshot || options.json) {
			const machines = await getSnapshotMachines({
				apiClient,
				machineId: opts.machine,
				deploymentId: opts.deployment,
				distressed: opts.distressed,
			});

			if (options.json) {
				console.log(JSON.stringify(machines, null, 2));
				return machines;
			}

			renderMachineTable(machines);
			return machines;
		}

		const machineMap = new Map<string, MachineMonitorState>();

		const initialMachines = await getSnapshotMachines({
			apiClient,
			machineId: opts.machine,
			deploymentId: opts.deployment,
			distressed: opts.distressed,
		});

		for (const machine of initialMachines) {
			machineMap.set(machine.machineId, machine);
		}

		renderWatchTable(machineMap, {
			mode: 'snapshot',
			machineId: opts.machine,
			deploymentId: opts.deployment,
			distressed: opts.distressed,
		});

		tui.info('Connecting to monitoring stream...');

		let processingChain = Promise.resolve();
		let resolveWait: (() => void) | null = null;

		const monitorClient = new MonitorWebSocketClient({
			baseUrl: getAPIBaseURL(config),
			token: auth.apiKey,
			orgId,
			scope: toMonitorScope(opts.machine, opts.deployment),
			onOpen: () => {
				tui.success('Connected to monitoring stream');
			},
			onError: (error) => {
				tui.error(`Monitoring stream error: ${error.message}`);
			},
			onClose: () => {
				tui.info('Monitoring stream disconnected');
				resolveWait?.();
			},
			onMessage: (message) => {
				processingChain = processingChain.then(async () => {
					await applyMonitorMessage(machineMap, message, apiClient, opts.deployment);
					renderWatchTable(machineMap, {
						mode: 'watch',
						machineId: opts.machine,
						deploymentId: opts.deployment,
						distressed: opts.distressed,
						lastMessage: message,
					});
				});
			},
		});

		monitorClient.connect();

		await new Promise<void>((resolve) => {
			resolveWait = resolve;
			const onSigInt = () => {
				monitorClient.close();
				process.off('SIGINT', onSigInt);
				resolve();
			};
			process.on('SIGINT', onSigInt);
		});

		return Array.from(machineMap.values());
	},
});

async function getSnapshotMachines(params: {
	apiClient: Parameters<typeof listMonitorNodes>[0];
	machineId?: string;
	deploymentId?: string;
	distressed?: boolean;
}): Promise<MachineMonitorState[]> {
	const { apiClient, machineId, deploymentId, distressed } = params;

	let machines: MachineMonitorState[];
	if (distressed) {
		machines = await listDistressedNodes(apiClient);
	} else if (machineId) {
		machines = [await getMonitorNode(apiClient, machineId)];
	} else {
		machines = await listMonitorNodes(apiClient);
	}

	if (!deploymentId) {
		return machines;
	}

	const results = await Promise.all(
		machines.map(async (machine) => {
			const containers = await listMonitorNodeContainers(apiClient, machine.machineId);
			const hasDeployment = containers.some(
				(container) => container.deploymentId === deploymentId
			);
			return hasDeployment ? machine : null;
		})
	);
	return results.filter((m): m is MachineMonitorState => m !== null);
}

function toMonitorScope(machineId?: string, deploymentId?: string): MonitorScope {
	if (machineId) {
		return { scope: 'machine', machineId };
	}
	if (deploymentId) {
		return { scope: 'deployment', deploymentId };
	}
	return { scope: 'org' };
}

async function applyMonitorMessage(
	machineMap: Map<string, MachineMonitorState>,
	message: MonitorMessage,
	apiClient: Parameters<typeof listMonitorNodes>[0],
	deploymentId?: string
) {
	if (message.type === 'snapshot') {
		machineMap.clear();
		for (const machine of message.machines) {
			machineMap.set(machine.machineId, machine);
		}
		if (deploymentId) {
			await filterMapByDeployment(machineMap, apiClient, deploymentId);
		}
		return;
	}

	if (message.type === 'update') {
		const existing = machineMap.get(message.machineId);
		const next: MachineMonitorState = {
			machineId: message.machineId,
			orgId: existing?.orgId ?? '',
			report: message.report,
			compositeScore: message.report.capacity?.compositeScore ?? existing?.compositeScore ?? 0,
			health: message.health,
			reportedAt: usecToISO(message.report.reportedAtUs) ?? existing?.reportedAt ?? '',
			updatedAt: new Date().toISOString(),
			gravity: existing?.gravity ?? '',
		};

		if (deploymentId) {
			const containers = await listMonitorNodeContainers(apiClient, message.machineId);
			const include = containers.some((container) => container.deploymentId === deploymentId);
			if (!include) {
				machineMap.delete(message.machineId);
				return;
			}
		}

		machineMap.set(message.machineId, next);
		return;
	}

	const existing = machineMap.get(message.machineId);
	if (existing) {
		existing.health = message.health;
		existing.updatedAt = new Date().toISOString();
		machineMap.set(message.machineId, existing);
	}
}

async function filterMapByDeployment(
	machineMap: Map<string, MachineMonitorState>,
	apiClient: Parameters<typeof listMonitorNodes>[0],
	deploymentId: string
) {
	const entries = Array.from(machineMap.keys());
	const results = await Promise.all(
		entries.map(async (machineId) => {
			const containers = await listMonitorNodeContainers(apiClient, machineId);
			const include = containers.some((container) => container.deploymentId === deploymentId);
			return { machineId, include };
		})
	);
	for (const { machineId, include } of results) {
		if (!include) {
			machineMap.delete(machineId);
		}
	}
}

function renderWatchTable(
	machineMap: Map<string, MachineMonitorState>,
	params: {
		mode: 'snapshot' | 'watch';
		machineId?: string;
		deploymentId?: string;
		distressed?: boolean;
		lastMessage?: MonitorMessage;
	}
) {
	console.clear();

	const subtitle = [
		params.mode === 'watch' ? 'Live mode' : 'Snapshot mode',
		params.machineId ? `machine=${params.machineId}` : undefined,
		params.deploymentId ? `deployment=${params.deploymentId}` : undefined,
		params.distressed ? 'distressed=true' : undefined,
	]
		.filter(Boolean)
		.join(' • ');

	tui.header('Cloud Monitor');
	if (subtitle) {
		tui.info(subtitle);
	}
	if (params.lastMessage && params.lastMessage.type === 'state_change') {
		tui.warning(
			`${params.lastMessage.machineId}: ${params.lastMessage.previousHealth} -> ${params.lastMessage.health}`
		);
	}

	renderMachineTable(Array.from(machineMap.values()));
	tui.info('Press Ctrl+C to stop watching.');
}

function renderMachineTable(machines: MachineMonitorState[]) {
	if (machines.length === 0) {
		tui.info('No machines found');
		return;
	}

	const rows = machines
		.slice()
		.sort((a, b) => a.machineId.localeCompare(b.machineId))
		.map((machine) => ({
			Machine: machine.machineId,
			Health: formatHealth(machine.health),
			CPU: formatPercent(machine.report?.host?.cpu?.usagePercent),
			Memory: formatPercent(machine.report?.host?.memory?.usagePercent),
			Disk: formatPercent(maxDiskUsage(machine.report?.host?.disks)),
			Pressure: formatScore(machine.compositeScore),
			Containers: `${machine.report?.capacity?.runningContainers ?? 0}/${machine.report?.capacity?.totalContainers ?? 0}`,
			'Last Report': formatAge(machine.reportedAt),
		}));

	tui.table(rows, [
		{ name: 'Machine' },
		{ name: 'Health' },
		{ name: 'CPU', alignment: 'right' },
		{ name: 'Memory', alignment: 'right' },
		{ name: 'Disk', alignment: 'right' },
		{ name: 'Pressure', alignment: 'right' },
		{ name: 'Containers', alignment: 'right' },
		{ name: 'Last Report' },
	]);
}

function formatHealth(health: string): string {
	if (health === 'CONNECTED') return '● CONNECTED';
	if (health === 'STALE') return '◌ STALE';
	if (health === 'DISCONNECTED') return '○ DISCONNECTED';
	return health;
}

function formatPercent(value?: number): string {
	if (value === undefined || value === null || Number.isNaN(value)) {
		return '-';
	}
	return `${value.toFixed(1)}%`;
}

function formatScore(score?: number): string {
	if (score === undefined || score === null || Number.isNaN(score)) {
		return '-';
	}
	if (score >= 0.85) {
		return `${score.toFixed(2)} ⚠`;
	}
	return score.toFixed(2);
}

function maxDiskUsage(disks?: Array<{ usagePercent: number }>): number | undefined {
	if (!disks || disks.length === 0) {
		return undefined;
	}
	return Math.max(...disks.map((d) => d.usagePercent));
}

function formatAge(timestamp: string): string {
	const date = new Date(timestamp);
	const time = date.getTime();
	if (Number.isNaN(time)) {
		return '-';
	}

	const diff = Date.now() - time;
	if (diff < 60_000) return `${Math.max(0, Math.floor(diff / 1000))}s ago`;
	if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
	if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
	return `${Math.floor(diff / 86_400_000)}d ago`;
}

function usecToISO(us?: number): string | undefined {
	if (us === undefined || us <= 0 || Number.isNaN(us)) {
		return undefined;
	}
	return new Date(Math.floor(us / 1000)).toISOString();
}

export default monitorSubcommand;
