// Export 4 main AI elements/components
export { Chat } from './components/internal/Chat';
export { Header } from './components/internal/Header';
export { App } from './components/App';
export { Inline } from './components/Inline';
export { ConnectionStatus } from './components/ConnectionStatus';

// Export provider
export { WorkbenchProvider } from './components/internal/WorkbenchProvider';

// Export hooks
export { useAgentSchemas, useAgentSchema } from './hooks/useAgentSchemas';
export {
	useWorkbenchSchemas,
	useWorkbenchAgentSchema,
	useWorkbenchAllAgentSchemas,
} from './hooks/useWorkbenchSchemas';

export type {
	AgentSchema,
	AgentMetadata,
	AgentSchemaData,
	AgentSchemasResponse,
	UseAgentSchemasOptions,
	UseAgentSchemasResult,
} from './hooks/useAgentSchemas';

export type { ConnectionStatus as ConnectionStatusType } from './types/config';
