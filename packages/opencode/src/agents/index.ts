import type { AgentRole } from '../types';
import type { AgentDefinition, AgentRegistry } from './types';
import { leadAgent } from './lead';
import { scoutAgent } from './scout';
import { builderAgent } from './builder';
import { srBuilderAgent } from './sr-builder';
import { reviewerAgent } from './reviewer';
import { memoryAgent } from './memory';
import { expertAgent } from './expert';
import { plannerAgent } from './planner';

export type { AgentDefinition, AgentRegistry } from './types';

export const agents: Record<AgentRole, AgentDefinition> = {
	lead: leadAgent,
	scout: scoutAgent,
	builder: builderAgent,
	'sr-builder': srBuilderAgent,
	reviewer: reviewerAgent,
	memory: memoryAgent,
	expert: expertAgent,
	planner: plannerAgent,
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
