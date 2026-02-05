import { z } from 'zod';
import type { BackgroundTaskConfig } from './background/types';
import type { SkillsConfig } from './skills/types';
import type { TmuxConfig } from './tmux/types';

// Re-export types from @opencode-ai/plugin
export type {
	Plugin,
	PluginInput,
	Hooks as PluginHooks,
	ToolDefinition,
} from '@opencode-ai/plugin';

export type { BackgroundTaskConfig } from './background/types';
export type { SkillsConfig, LoadedSkill, SkillMetadata, SkillScope } from './skills';
export type { TmuxConfig } from './tmux/types';

export const AgentRoleSchema = z.enum([
	'lead',
	'scout',
	'builder',
	'architect',
	'reviewer',
	'memory',
	'expert',
	'runner',
	'reasoner',
	'product',
	'monitor',
]);
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
	/** Reasoning effort for OpenAI models */
	reasoningEffort?: ReasoningEffort;
	/** Extended thinking configuration for Anthropic models */
	thinking?: ThinkingConfig;
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

/** Extended thinking configuration for Anthropic models */
export const ThinkingConfigSchema = z.object({
	type: z.enum(['enabled', 'disabled']),
	budgetTokens: z.number().optional(),
});
export type ThinkingConfig = z.infer<typeof ThinkingConfigSchema>;

/** Reasoning effort for OpenAI models */
export const ReasoningEffortSchema = z.enum(['low', 'medium', 'high', 'xhigh']);
export type ReasoningEffort = z.infer<typeof ReasoningEffortSchema>;

/** Model variant for Anthropic thinking levels */
export const ModelVariantSchema = z.enum(['low', 'medium', 'high', 'max']);
export type ModelVariant = z.infer<typeof ModelVariantSchema>;

/** Enhanced agent model configuration */
export interface AgentModelConfig {
	/** Model ID in provider/model-id format */
	model?: string;
	/** Temperature for response creativity (0.0-2.0) */
	temperature?: number;
	/** Model variant for Anthropic thinking levels */
	variant?: ModelVariant;
	/** Reasoning effort for OpenAI models */
	reasoningEffort?: ReasoningEffort;
	/** Extended thinking configuration for Anthropic models */
	thinking?: ThinkingConfig;
	/** Maximum agentic steps before forcing text response */
	maxSteps?: number;
}

export const AgentModelConfigSchema = z.object({
	model: z.string().optional(),
	temperature: z.number().min(0).max(2).optional(),
	variant: ModelVariantSchema.optional(),
	reasoningEffort: ReasoningEffortSchema.optional(),
	thinking: ThinkingConfigSchema.optional(),
	maxSteps: z.number().optional(),
});

export interface CoderConfig {
	org?: string;
	disabledMcps?: string[];
	/** CLI command patterns to block for security (e.g., 'cloud secrets', 'auth token') */
	blockedCommands?: string[];
	background?: BackgroundTaskConfig;
	skills?: SkillsConfig;
	tmux?: TmuxConfig;
}

export const BackgroundTaskConfigSchema = z.object({
	enabled: z.boolean(),
	defaultConcurrency: z.number(),
	staleTimeoutMs: z.number(),
	providerConcurrency: z.record(z.string(), z.number()).optional(),
	modelConcurrency: z.record(z.string(), z.number()).optional(),
});

export const SkillsConfigSchema = z.object({
	enabled: z.boolean(),
	paths: z.array(z.string()).optional(),
	disabled: z.array(z.string()).optional(),
});

export const TmuxConfigSchema = z.object({
	enabled: z.boolean(),
	maxPanes: z.number(),
	mainPaneMinWidth: z.number(),
	agentPaneMinWidth: z.number(),
});

export const CoderConfigSchema = z.object({
	org: z.string().optional(),
	disabledMcps: z.array(z.string()).optional(),
	blockedCommands: z.array(z.string()).optional(),
	background: BackgroundTaskConfigSchema.optional(),
	skills: SkillsConfigSchema.optional(),
	tmux: TmuxConfigSchema.optional(),
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
