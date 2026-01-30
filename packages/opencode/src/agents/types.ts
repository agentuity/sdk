import type { AgentRole, ReasoningEffort, ThinkingConfig } from '../types';

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
}

export interface AgentRegistry {
	get(role: AgentRole): AgentDefinition | undefined;
	getAll(): AgentDefinition[];
	has(role: AgentRole): boolean;
}
