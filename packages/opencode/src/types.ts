import { z } from 'zod';

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

export interface PluginClient {
	app: {
		log: (options: {
			body: { service: string; level: string; message: string; extra?: unknown };
		}) => void;
	};
	tui?: {
		showToast?: (options: { body: { message: string } }) => void;
	};
	session?: {
		prompt?: (options: {
			path: { id: string };
			body: {
				parts: Array<{ type: 'text'; text: string }>;
				agent?: string;
			};
			noReply?: boolean;
		}) => Promise<void>;
	};
}

export interface PluginContext {
	directory: string;
	client: PluginClient;
}

export interface CompactingInput {
	sessionID: string;
}

export interface CompactingOutput {
	context: string[];
	prompt?: string;
}

export interface PluginHooks {
	agents?: Record<string, AgentConfig>;
	tool?: Record<string, unknown>; // Open Code tool format (created via tool() helper)
	config?: (config: Record<string, unknown>) => Promise<void>;
	'chat.message'?: (input: unknown, output: unknown) => Promise<void>;
	'chat.params'?: (input: unknown, output: unknown) => Promise<void>;
	'tool.execute.before'?: (input: unknown, output: unknown) => Promise<void>;
	'tool.execute.after'?: (input: unknown, output: unknown) => Promise<void>;
	event?: (input: unknown) => Promise<void>;
	'experimental.session.compacting'?: (
		input: CompactingInput,
		output: CompactingOutput
	) => Promise<void>;
}

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

export interface ToolDefinition {
	description: string;
	args: unknown; // Zod schema or JSON schema
	execute: (args: unknown, context: unknown) => Promise<unknown>;
}
