import { z } from 'zod';
import type { Logger, BuildMetadata } from '../../types';
import type { APIClient } from '../../api';

interface AgentSyncPayload {
	id: string;
	name: string;
	agentId: string;
	description?: string;
	version: string;
	filename: string;
	projectId: string;
}

interface EvalSyncPayload {
	id: string;
	name: string;
	identifier: string;
	description?: string;
	version: string;
	filename: string;
	projectId: string;
	agentIdentifier: string;
}

interface IDevmodeSyncService {
	sync(
		currentMetadata: BuildMetadata,
		previousMetadata: BuildMetadata | undefined,
		projectId: string,
		deploymentId: string
	): Promise<void>;
}

// Shared diff logic for agents
function getAgentsToSync(
	currentAgents: BuildMetadata['agents'],
	previousAgentIds: Set<string>,
	projectId: string,
	logger: Logger
): { create: AgentSyncPayload[]; delete: string[] } {
	const agentsToCreate: AgentSyncPayload[] = [];
	const currentAgentIds = new Set<string>();

	for (const agent of currentAgents || []) {
		currentAgentIds.add(agent.id);
		// If ID is not in previous, add to create
		if (!previousAgentIds.has(agent.id)) {
			logger.debug(
				'[CLI AGENT SYNC] Preparing to create: id="%s", name="%s"',
				agent.id,
				agent.name
			);

			agentsToCreate.push({
				id: agent.id,
				name: agent.name,
				agentId: agent.agentId,
				description: agent.description,
				version: agent.version,
				filename: agent.filename,
				projectId,
			});
		}
	}

	// If ID is in previous but not in current, add to delete
	const agentsToDelete: string[] = [];
	for (const previousId of previousAgentIds) {
		if (!currentAgentIds.has(previousId)) {
			logger.debug('[CLI AGENT SYNC] Preparing to delete: id="%s"', previousId);
			agentsToDelete.push(previousId);
		}
	}

	return { create: agentsToCreate, delete: agentsToDelete };
}

// Shared diff logic for evals
function getEvalsToSync(
	currentMetadata: BuildMetadata,
	previousEvalIds: Set<string>,
	projectId: string,
	logger: Logger
): { create: EvalSyncPayload[]; delete: string[] } {
	const evalsToCreate: EvalSyncPayload[] = [];
	const currentEvalIds = new Set<string>();

	for (const agent of currentMetadata.agents || []) {
		if (agent.evals) {
			for (const evalItem of agent.evals) {
				currentEvalIds.add(evalItem.id);
				// If ID is not in previous, add to create
				if (!previousEvalIds.has(evalItem.id)) {
					logger.debug(
						'[CLI EVAL SYNC] Preparing to create: id="%s", name="%s"',
						evalItem.id,
						evalItem.name
					);

					evalsToCreate.push({
						...evalItem,
						identifier: evalItem.identifier,
						projectId,
						agentIdentifier: agent.agentId,
					});
				}
			}
		}
	}

	// If ID is in previous but not in current, add to delete
	const evalsToDelete: string[] = [];
	for (const previousId of previousEvalIds) {
		if (!currentEvalIds.has(previousId)) {
			logger.debug('[CLI EVAL SYNC] Preparing to delete: id="%s"', previousId);
			evalsToDelete.push(previousId);
		}
	}

	return { create: evalsToCreate, delete: evalsToDelete };
}

class DevmodeSyncService implements IDevmodeSyncService {
	constructor(
		private logger: Logger,
		private apiClient: APIClient
	) {}

	async sync(
		currentMetadata: BuildMetadata,
		previousMetadata: BuildMetadata | undefined,
		projectId: string,
		deploymentId: string
	): Promise<void> {
		this.logger.debug(
			'[CLI SYNC] sync() called with projectId=%s, deploymentId=%s',
			projectId,
			deploymentId
		);
		this.logger.debug(
			'[CLI SYNC] currentMetadata has %d agents',
			currentMetadata.agents?.length ?? 0
		);

		// Build previous agent IDs set
		const previousAgentIds = new Set<string>();
		if (previousMetadata) {
			this.logger.debug(
				'[CLI SYNC] Previous metadata found with %d agent(s)',
				previousMetadata.agents?.length ?? 0
			);
			for (const agent of previousMetadata.agents || []) {
				previousAgentIds.add(agent.id);
			}
		} else {
			this.logger.debug('[CLI SYNC] No previous metadata, all agents will be treated as new');
		}

		// Build previous eval IDs set
		const previousEvalIds = new Set<string>();
		if (previousMetadata) {
			let prevEvalCount = 0;
			for (const agent of previousMetadata.agents || []) {
				if (agent.evals) {
					for (const evalItem of agent.evals) {
						previousEvalIds.add(evalItem.id);
						prevEvalCount++;
					}
				}
			}
			this.logger.debug('Previous metadata found with %d eval(s)', prevEvalCount);
		} else {
			this.logger.debug('No previous metadata, all evals will be treated as new');
		}

		const currentAgents = currentMetadata.agents || [];
		this.logger.debug('Processing %d current agent(s)', currentAgents.length);

		let currentEvalCount = 0;
		for (const agent of currentMetadata.agents || []) {
			if (agent.evals) {
				currentEvalCount += agent.evals.length;
				this.logger.debug(
					'[CLI EVAL SYNC] Agent "%s" has %d eval(s)',
					agent.name,
					agent.evals.length
				);
				for (const evalItem of agent.evals) {
					this.logger.debug(
						'[CLI EVAL SYNC]   - %s (id: %s, identifier: %s)',
						evalItem.name,
						evalItem.id,
						evalItem.identifier
					);
				}
			}
		}
		this.logger.debug('[CLI EVAL SYNC] Total current eval(s): %d', currentEvalCount);

		// Get agents and evals to sync using shared diff logic
		const { create: agentsToCreate, delete: agentsToDelete } = getAgentsToSync(
			currentAgents,
			previousAgentIds,
			projectId,
			this.logger
		);
		const { create: evalsToCreate, delete: evalsToDelete } = getEvalsToSync(
			currentMetadata,
			previousEvalIds,
			projectId,
			this.logger
		);

		if (agentsToCreate.length > 0 || agentsToDelete.length > 0) {
			this.logger.debug(
				'Bulk syncing %d agent(s) to create, %d agent(s) to delete',
				agentsToCreate.length,
				agentsToDelete.length
			);
		}
		this.logger.debug(
			'[CLI EVAL SYNC] Evals to sync: %d to create, %d to delete',
			evalsToCreate.length,
			evalsToDelete.length
		);

		// Sync both in parallel
		try {
			await Promise.all([
				this.syncAgents(agentsToCreate, agentsToDelete, deploymentId),
				this.syncEvals(evalsToCreate, evalsToDelete, deploymentId),
			]);

			if (agentsToCreate.length > 0 || agentsToDelete.length > 0) {
				this.logger.debug(
					'Successfully bulk synced %d agent(s) to create, %d agent(s) to delete',
					agentsToCreate.length,
					agentsToDelete.length
				);
			}
			if (evalsToCreate.length > 0 || evalsToDelete.length > 0) {
				this.logger.debug(
					'Successfully bulk synced %d eval(s) to create, %d eval(s) to delete',
					evalsToCreate.length,
					evalsToDelete.length
				);
			}
		} catch (error) {
			this.logger.error('Failed to bulk sync agents/evals: %s', error);
			if (error instanceof Error) {
				this.logger.error('Error details: %s', error.message);
			}
			throw error;
		}
	}

	private async syncAgents(
		agents: AgentSyncPayload[],
		agentsToDelete: string[],
		deploymentId: string
	): Promise<void> {
		if (agents.length === 0 && agentsToDelete.length === 0) {
			return;
		}

		const payload = {
			create: agents,
			delete: agentsToDelete,
			deploymentId,
		};
		this.logger.trace(
			'[CLI AGENT SYNC] Sending payload to POST /cli/devmode/agent: %s',
			JSON.stringify(payload, null, 2)
		);

		await this.apiClient.post('/cli/devmode/agent', payload, z.object({ success: z.boolean() }));
	}

	private async syncEvals(
		evals: EvalSyncPayload[],
		evalsToDelete: string[],
		deploymentId: string
	): Promise<void> {
		if (evals.length === 0 && evalsToDelete.length === 0) {
			return;
		}

		const payload = {
			deploymentId,
			create: evals,
			delete: evalsToDelete,
		};

		this.logger.debug(
			'[CLI EVAL SYNC] Sending payload to POST /cli/devmode/eval: %s',
			JSON.stringify(payload, null, 2)
		);

		try {
			await this.apiClient.post(
				'/cli/devmode/eval',
				payload,
				z.object({ success: z.boolean() })
			);
		} catch (error) {
			this.logger.error('[CLI EVAL SYNC] Sync failed: %s', error);
			throw error;
		}
	}
}

class MockDevmodeSyncService implements IDevmodeSyncService {
	constructor(private logger: Logger) {}

	async sync(
		currentMetadata: BuildMetadata,
		previousMetadata: BuildMetadata | undefined,
		projectId: string,
		deploymentId: string
	): Promise<void> {
		// Build previous agent IDs set
		this.logger.debug('Mock syncing agents and evals for deploymentId: %s', deploymentId);
		const previousAgentIds = new Set<string>();
		if (previousMetadata) {
			for (const agent of previousMetadata.agents || []) {
				previousAgentIds.add(agent.id);
			}
		}

		// Build previous eval IDs set
		const previousEvalIds = new Set<string>();
		if (previousMetadata) {
			for (const agent of previousMetadata.agents || []) {
				if (agent.evals) {
					for (const evalItem of agent.evals) {
						previousEvalIds.add(evalItem.id);
					}
				}
			}
		}

		// Get agents and evals to sync using shared diff logic
		const { create: agentsToCreate, delete: agentsToDelete } = getAgentsToSync(
			currentMetadata.agents,
			previousAgentIds,
			projectId,
			this.logger
		);
		const { create: evalsToCreate, delete: evalsToDelete } = getEvalsToSync(
			currentMetadata,
			previousEvalIds,
			projectId,
			this.logger
		);

		// Log the requests that would be made
		if (agentsToCreate.length > 0 || agentsToDelete.length > 0) {
			this.logger.debug(
				'[MOCK] Would make request: POST /cli/devmode/agent with %d agent(s) to create, %d agent(s) to delete',
				agentsToCreate.length,
				agentsToDelete.length
			);
			this.logger.debug(
				'[MOCK] Request payload: %s',
				JSON.stringify({ create: agentsToCreate, delete: agentsToDelete }, null, 2)
			);
		}

		if (evalsToCreate.length > 0 || evalsToDelete.length > 0) {
			this.logger.debug(
				'[MOCK] Would make request: POST /cli/devmode/eval with %d eval(s) to create, %d eval(s) to delete',
				evalsToCreate.length,
				evalsToDelete.length
			);
			this.logger.debug(
				'[MOCK] Request payload: %s',
				JSON.stringify({ create: evalsToCreate, delete: evalsToDelete }, null, 2)
			);
		}

		if (
			agentsToCreate.length === 0 &&
			agentsToDelete.length === 0 &&
			evalsToCreate.length === 0 &&
			evalsToDelete.length === 0
		) {
			this.logger.debug('[MOCK] No requests would be made (no changes detected)');
		}
	}
}

export function createDevmodeSyncService({
	logger,
	apiClient,
	mock = false,
}: {
	logger: Logger;
	apiClient: APIClient | null;
	mock?: boolean;
}): IDevmodeSyncService {
	if (mock) {
		return new MockDevmodeSyncService(logger);
	}

	if (!apiClient) {
		throw new Error('apiClient is required when not in mock mode');
	}

	return new DevmodeSyncService(logger, apiClient);
}
