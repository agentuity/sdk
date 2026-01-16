import type { WorkbenchConfig } from '@agentuity/core/workbench';
import type { UIMessage } from 'ai';
import type { AgentSchemaData, AgentSchemasResponse } from '../hooks/useAgentSchemas';

/**
 * Extended message type with execution metadata.
 * This is the canonical message shape used throughout the workbench.
 */
export interface WorkbenchMessage extends UIMessage {
	/** Session ID from x-session-id header */
	sessionId?: string;
	/** Raw tokens header value (format: "model:count model2:count2") */
	tokens?: string;
	/** Duration string (e.g., "1.5s") */
	duration?: string;
	/** Unix timestamp when the message was created */
	timestamp?: number;
}

export interface Agent {
	avatar?: string;
	description?: string;
	id: string;
	name: string;
}

export type ConnectionStatus = 'connected' | 'restarting' | 'disconnected';

// Context type for the provider
export interface WorkbenchContextType {
	agents: Record<string, AgentSchemaData>;
	clearAgentState: (agentId: string) => Promise<void>;
	config: WorkbenchConfig;
	connectionStatus: ConnectionStatus;
	env: {
		agentuity: boolean;
		authenticated: boolean;
		cloud: boolean;
	};
	generateSample: (agentId: string) => Promise<string>;
	inputMode: 'text' | 'form';
	isGeneratingSample: boolean;
	isLoading: boolean;
	messages: WorkbenchMessage[];
	portals?: {
		actionBar?: {
			pre?: React.ReactNode;
			post?: React.ReactNode;
		};
	};
	refetchSchemas: () => void;
	schemas: AgentSchemasResponse | null;
	schemasError: Error | null;
	schemasLoading: boolean;
	selectedAgent: string;
	setInputMode: (mode: 'text' | 'form') => void;
	setMessages: (
		messages: WorkbenchMessage[] | ((prev: WorkbenchMessage[]) => WorkbenchMessage[])
	) => void;
	setSelectedAgent: (agentId: string) => void;
	submitMessage: (value: string, mode?: 'text' | 'form') => Promise<void>;
}

export interface ErrorInfo {
	message: string;
	stack?: string;
	code?: string;
	cause?: unknown;
}
