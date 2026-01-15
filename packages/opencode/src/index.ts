import { createCoderPlugin } from './plugin/plugin';
import type { PluginContext, PluginHooks } from './types';

// NOTE: Do NOT export functions from main index.ts!
// OpenCode treats ALL exports as plugin instances and calls them.
// Only the default export should be a function.

// Re-export types only (not functions)
export type { PluginContext, PluginHooks } from './types';
export type {
	AgentRole,
	AgentConfig,
	AgentContext,
	CoderTask,
	CoderConfig,
	McpConfig,
	TaskStatus,
} from './types';

const Coder = async (ctx: PluginContext): Promise<PluginHooks> => {
	return createCoderPlugin(ctx);
};

export default Coder;
