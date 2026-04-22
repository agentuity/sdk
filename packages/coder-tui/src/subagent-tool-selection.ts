import type { AgentDefinition } from './protocol.ts';

const READ_ONLY_TOOL_NAMES = ['read', 'grep', 'find', 'ls'] as const;
const CODING_TOOL_NAMES = ['read', 'bash', 'edit', 'write'] as const;

function normalizeToolName(name: string): string {
	return name.trim().toLowerCase();
}

export function selectSubAgentToolNames(
	agentConfig: AgentDefinition,
): string[] {
	const declared = new Set(
		(agentConfig.tools ?? [])
			.filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
			.map(normalizeToolName),
	);
	const needsBash = declared.has('bash');
	const baseToolNames =
		agentConfig.readOnly && !needsBash ? READ_ONLY_TOOL_NAMES : CODING_TOOL_NAMES;

	if (declared.size === 0) {
		return agentConfig.strictToolSelection ? [] : [...baseToolNames];
	}

	const filtered = baseToolNames.filter((toolName) => declared.has(toolName));

	if (filtered.length > 0) {
		return filtered;
	}

	return agentConfig.strictToolSelection ? [] : [...baseToolNames];
}
