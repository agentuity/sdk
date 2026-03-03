import type { AgentRole, ReasoningEffort, ThinkingConfig } from '../types.ts';

export interface AgentDefinition {
	/** Internal role key for config lookup */
	role: AgentRole;
	/** Open Code agent ID (prefixed, e.g. 'ag-lead') */
	id: string;
	displayName: string;
	description: string;
	defaultModel: string;
	systemPrompt: string;
	/** Agent mode: 'primary', 'subagent', or 'all' (default) */
	mode?: 'primary' | 'subagent' | 'all';
	/**
	 * Hide agent from @ autocomplete menu.
	 * Agent can still be invoked programmatically via Task tool.
	 * Only applies to subagents.
	 */
	hidden?: boolean;
	tools?: {
		include?: string[];
		exclude?: string[];
	};
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
	/**
	 * Ordered list of fallback model IDs to try when the primary model fails
	 * with a retryable error (429 rate limit, 500/502/503 server error).
	 * Models are tried in order until one succeeds.
	 *
	 * Example: ['anthropic/claude-sonnet-4-20250514', 'openai/gpt-4.1']
	 */
	fallbackModels?: string[];
}

export interface AgentRegistry {
	get(role: AgentRole): AgentDefinition | undefined;
	getAll(): AgentDefinition[];
	has(role: AgentRole): boolean;
}
