import { z } from 'zod';

// Re-export types from @opencode-ai/plugin
export type {
	Plugin,
	PluginInput,
	Hooks as PluginHooks,
	ToolDefinition,
} from '@opencode-ai/plugin';

export const AgentRoleSchema = z.enum(['lead', 'scout', 'builder', 'reviewer', 'memory', 'expert']);
export type AgentRole = z.infer<typeof AgentRoleSchema>;

export const TaskStatusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const OrchestrationPatternSchema = z.enum(['single', 'fanout', 'pipeline']);
export type OrchestrationPattern = z.infer<typeof OrchestrationPatternSchema>;

export const CadenceStatusSchema = z.enum([
	'running',
	'paused',
	'completed',
	'failed',
	'cancelled',
]);
export type CadenceStatus = z.infer<typeof CadenceStatusSchema>;

export const CadenceSandboxModeSchema = z.enum(['off', 'per_iteration', 'persistent']);
export type CadenceSandboxMode = z.infer<typeof CadenceSandboxModeSchema>;

export interface CadenceLoop {
	loopId: string;
	parentId?: string;
	projectLabel?: string;
	sessionId?: string;
	status: CadenceStatus;
	iteration: number;
	maxIterations: number;
	prompt: string;
	createdAt: string;
	updatedAt: string;
	lastError?: string;
	sandbox?: {
		mode: CadenceSandboxMode;
		sandboxId?: string;
	};
}

export interface AgentConfig {
	/** Agent description - explains what it does and when to use it */
	description: string;
	/** Model ID in provider/model-id format */
	model: string;
	/** System prompt content (not a file path) */
	prompt: string;
	/** Agent mode: 'primary', 'subagent', or 'all' (default) */
	mode?: 'primary' | 'subagent' | 'all';
	/** Tool configuration */
	tools?: Record<string, boolean>;
	/** Model variant for thinking/reasoning (e.g., 'high', 'max' for Anthropic) */
	variant?: string;
	/** Temperature for response creativity (0.0-2.0) */
	temperature?: number;
	/** Maximum agentic steps before forcing text response */
	maxSteps?: number;
}

export interface AgentContext {
	projectRoot: string;
	orgId?: string;
	sessionId?: string;
	taskId?: string;
}

export interface CoderTask {
	id: string;
	title: string;
	description?: string;
	status: TaskStatus;
	createdAt: Date;
	updatedAt: Date;
	assignedTo?: AgentRole;
	parentTaskId?: string;
	result?: string;
	error?: string;
}

export interface CoderConfig {
	org?: string;
	agents?: Partial<Record<AgentRole, AgentModelConfig>>;
	disabledMcps?: string[];
	/** CLI command patterns to block for security (e.g., 'cloud secrets', 'auth token') */
	blockedCommands?: string[];
}

export interface AgentModelConfig {
	model?: string;
	temperature?: number;
}

export const CoderConfigSchema = z.object({
	org: z.string().optional(),
	agents: z
		.record(
			AgentRoleSchema,
			z.object({
				model: z.string().optional(),
				temperature: z.number().min(0).max(2).optional(),
			})
		)
		.optional(),
	disabledMcps: z.array(z.string()).optional(),
	blockedCommands: z.array(z.string()).optional(),
});

export interface McpConfig {
	name: string;
	type: 'remote';
	url: string;
	enabled: boolean;
	headers?: Record<string, string>;
}

// Note: PluginInput and PluginHooks are now imported from @opencode-ai/plugin above.

export interface CommandDefinition {
	name: string;
	description?: string;
	template: string;
	agent?: string;
	model?: string;
	argumentHint?: string;
	/** Force command to run as subagent for context isolation */
	subtask?: boolean;
}

// ToolDefinition is re-exported from @opencode-ai/plugin above
