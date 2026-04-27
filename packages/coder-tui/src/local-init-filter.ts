import type { AgentDefinition, HubToolDefinition, InitMessage } from './protocol.ts';

const LOCAL_TUI_HIDDEN_HUB_TOOL_NAMES = new Set(['sandbox_exec']);

function filterHubToolsForLocalTui(tools?: HubToolDefinition[]): HubToolDefinition[] | undefined {
	if (!tools) return tools;

	const filtered = tools.filter((tool) => !LOCAL_TUI_HIDDEN_HUB_TOOL_NAMES.has(tool.name));
	return filtered.length === tools.length ? tools : filtered;
}

function filterAgentHubToolsForLocalTui(agents?: AgentDefinition[]): AgentDefinition[] | undefined {
	if (!agents) return agents;

	let changed = false;
	const filteredAgents = agents.map((agent) => {
		const filteredHubTools = filterHubToolsForLocalTui(agent.hubTools);
		if (filteredHubTools === agent.hubTools) {
			return agent;
		}

		changed = true;
		return {
			...agent,
			hubTools: filteredHubTools && filteredHubTools.length > 0 ? filteredHubTools : undefined,
		};
	});

	return changed ? filteredAgents : agents;
}

export function adaptInitMessageForLocalTui(
	init: InitMessage,
	options: {
		isRemoteSession: boolean;
	}
): InitMessage {
	if (options.isRemoteSession) {
		return init;
	}

	const tools = filterHubToolsForLocalTui(init.tools);
	const agents = filterAgentHubToolsForLocalTui(init.agents);

	if (tools === init.tools && agents === init.agents) {
		return init;
	}

	return {
		...init,
		tools,
		agents,
	};
}
