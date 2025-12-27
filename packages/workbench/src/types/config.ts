import type { WorkbenchConfig } from "@agentuity/core/workbench";
import type { UIMessage } from "ai";
import type {
	AgentSchemaData,
	AgentSchemasResponse,
} from "../hooks/useAgentSchemas";

export interface Agent {
	avatar?: string;
	description?: string;
	id: string;
	name: string;
}

export type ConnectionStatus = "connected" | "restarting" | "disconnected";

// Context type for the provider
export interface WorkbenchContextType {
	agents: Record<string, AgentSchemaData>;
	clearAgentState: (agentId: string) => Promise<void>;
	config: WorkbenchConfig;
	connectionStatus: ConnectionStatus;
	generateSample: (agentId: string) => Promise<string>;
	inputMode: "text" | "form";
	isAuthenticated: boolean;
	isGeneratingSample: boolean;
	isLoading: boolean;
	messages: UIMessage[];
	refetchSchemas: () => void;
	schemas: AgentSchemasResponse | null;
	schemasError: Error | null;
	schemasLoading: boolean;
	selectedAgent: string;
	setInputMode: (mode: "text" | "form") => void;
	setMessages: (
		messages: UIMessage[] | ((prev: UIMessage[]) => UIMessage[]),
	) => void;
	setSelectedAgent: (agentId: string) => void;
	submitMessage: (value: string, mode?: "text" | "form") => Promise<void>;
	suggestions: string[];
}
