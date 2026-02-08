import type { AgentRole } from '../types';
import type { AgentDefinition, AgentRegistry } from './types';
import { leadAgent } from './lead';
import { scoutAgent } from './scout';
import { builderAgent } from './builder';
import { architectAgent } from './architect';
import { reviewerAgent } from './reviewer';
import { memoryAgent } from './memory';
import { expertAgent } from './expert';
import { expertBackendAgent } from './expert-backend';
import { expertFrontendAgent } from './expert-frontend';
import { expertOpsAgent } from './expert-ops';
import { runnerAgent } from './runner';
import { productAgent } from './product';
import { monitorAgent } from './monitor';

export type { AgentDefinition, AgentRegistry } from './types';

export const agents: Record<AgentRole, AgentDefinition> = {
	lead: leadAgent,
	scout: scoutAgent,
	builder: builderAgent,
	architect: architectAgent,
	reviewer: reviewerAgent,
	memory: memoryAgent,
	expert: expertAgent,
	'expert-backend': expertBackendAgent,
	'expert-frontend': expertFrontendAgent,
	'expert-ops': expertOpsAgent,
	runner: runnerAgent,
	product: productAgent,
	monitor: monitorAgent,
};

export function getAgent(role: AgentRole): AgentDefinition {
	return agents[role];
}

export function getAgentByRole(role: AgentRole): AgentDefinition | undefined {
	return agents[role];
}

export function getAgentById(id: string): AgentDefinition | undefined {
	return Object.values(agents).find((a) => a.id === id);
}

export function getAllAgents(): AgentDefinition[] {
	return Object.values(agents);
}

export function createAgentRegistry(): AgentRegistry {
	return {
		get(role: AgentRole): AgentDefinition | undefined {
			return agents[role];
		},
		getAll(): AgentDefinition[] {
			return Object.values(agents);
		},
		has(role: AgentRole): boolean {
			return role in agents;
		},
	};
}
