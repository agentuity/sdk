import type { AgentRole } from '../types.ts';
import type { AgentDefinition, AgentRegistry } from './types.ts';
import { leadAgent } from './lead.ts';
import { scoutAgent } from './scout.ts';
import { builderAgent } from './builder.ts';
import { architectAgent } from './architect.ts';
import { reviewerAgent } from './reviewer.ts';
import { memoryAgent } from './memory/index.ts';
import { expertAgent } from './expert.ts';
import { expertBackendAgent } from './expert-backend.ts';
import { expertFrontendAgent } from './expert-frontend.ts';
import { expertOpsAgent } from './expert-ops.ts';
import { runnerAgent } from './runner.ts';
import { productAgent } from './product.ts';

export type { AgentDefinition, AgentRegistry } from './types.ts';

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
