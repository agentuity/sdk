import type { WorkbenchConfig } from "@agentuity/core/workbench";
import type { UIMessage } from "ai";
import type {
	AgentSchemaData,
	AgentSchemasResponse,
} from "../hooks/useAgentSchemas";

export interface Agent {
	id: string;
	name: string;
	description?: string;
	avatar?: string;
}

export type ConnectionStatus = "connected" | "restarting" | "disconnected";

// Context type for the provider
export interface WorkbenchContextType {
	config: WorkbenchConfig;
	agents: Record<string, AgentSchemaData>;
	suggestions: string[];
	messages: UIMessage[];
	setMessages: (
		messages: UIMessage[] | ((prev: UIMessage[]) => UIMessage[]),
	) => void;
	selectedAgent: string;
	setSelectedAgent: (agentId: string) => void;
	inputMode: "text" | "form";
	setInputMode: (mode: "text" | "form") => void;
	isLoading: boolean;
	submitMessage: (value: string, mode?: "text" | "form") => Promise<void>;
	generateSample: (agentId: string) => Promise<string>;
	isGeneratingSample: boolean;
	isAuthenticated: boolean;
	// Schema data from API
	schemas: AgentSchemasResponse | null;
	schemasLoading: boolean;
	schemasError: Error | null;
	refetchSchemas: () => void;
	// Connection status
	connectionStatus: ConnectionStatus;
	// Clear agent state
	clearAgentState: (agentId: string) => Promise<void>;
}
