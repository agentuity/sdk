import type { AgentRole } from '../types';
import type { AgentDefinition, AgentRegistry } from './types';
import { leadAgent } from './lead';
import { scoutAgent } from './scout';
import { builderAgent } from './builder';
import { architectAgent } from './architect';
import { reviewerAgent } from './reviewer';
import { memoryAgent } from './memory';
import { expertAgent } from './expert';
import { plannerAgent } from './planner';
import { runnerAgent } from './runner';
import { reasonerAgent } from './reasoner';
import { productAgent } from './product';

export type { AgentDefinition, AgentRegistry } from './types';

export const agents: Record<AgentRole, AgentDefinition> = {
	lead: leadAgent,
	scout: scoutAgent,
	builder: builderAgent,
	architect: architectAgent,
	reviewer: reviewerAgent,
	memory: memoryAgent,
	expert: expertAgent,
	planner: plannerAgent,
	runner: runnerAgent,
	reasoner: reasonerAgent,
	product: productAgent,
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
