import { createCoderPlugin } from './plugin/plugin';
import type { PluginInput, PluginHooks } from './types';

// NOTE: Do NOT export functions from main index.ts!
// OpenCode treats ALL exports as plugin instances and calls them.
// Only the default export should be a function.

// Re-export types only (not functions)
export type { PluginInput, PluginHooks } from './types';
export type {
	AgentRole,
	AgentConfig,
	AgentContext,
	CoderTask,
	CoderConfig,
	BackgroundTaskConfig,
	McpConfig,
	TaskStatus,
} from './types';

const Coder = async (ctx: PluginInput): Promise<PluginHooks> => {
	return createCoderPlugin(ctx);
};

export default Coder;
