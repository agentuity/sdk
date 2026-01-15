import type { McpConfig } from '../types';
import { grepAppMcp } from './grep-app';
import { context7Mcp } from './context7';

export { grepAppMcp } from './grep-app';
export { context7Mcp } from './context7';

export type McpName = 'grep_app' | 'context7';

const allBuiltinMcps: Record<McpName, McpConfig> = {
	grep_app: grepAppMcp,
	context7: context7Mcp,
};

export function createBuiltinMcps(disabledMcps: string[] = []): Record<string, McpConfig> {
	const mcps: Record<string, McpConfig> = {};
	const disabled = new Set(disabledMcps);

	for (const [name, config] of Object.entries(allBuiltinMcps)) {
		if (!disabled.has(name)) {
			mcps[name] = config;
		}
	}

	return mcps;
}

export function getMcp(name: McpName): McpConfig {
	return allBuiltinMcps[name];
}

export function getAllMcps(): McpConfig[] {
	return Object.values(allBuiltinMcps);
}
