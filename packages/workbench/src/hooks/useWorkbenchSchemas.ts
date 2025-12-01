import { useWorkbench } from '../components/internal/WorkbenchProvider';
/**
 * Hook to access agent schemas from the WorkbenchProvider context
 * This is preferred over using useAgentSchemas directly in components
 * since the provider manages the schema data centrally
 */
export function useWorkbenchSchemas() {
	const { schemas, schemasLoading, schemasError, refetchSchemas } = useWorkbench();

	return {
		/** Raw schema data from the API */
		schemas,
		/** Whether schemas are currently loading */
		isLoading: schemasLoading,
		/** Any error that occurred while fetching schemas */
		error: schemasError,
		/** Function to refetch schemas from the API */
		refetch: refetchSchemas,
		/** Array of agent names available in schemas */
		agentNames: schemas ? Object.keys(schemas.agents) : [],
		/** Number of agents available */
		agentCount: schemas ? Object.keys(schemas.agents).length : 0,
	};
}

/**
 * Hook to get a specific agent's schema by name
 */
export function useWorkbenchAgentSchema(agentName: string) {
	const { schemas } = useWorkbench();

	const agentData = schemas?.agents[agentName] || null;

	return {
		/** Agent schema data if found */
		data: agentData,
		/** Input schema for the agent */
		inputSchema: agentData?.schema.input || null,
		/** Output schema for the agent */
		outputSchema: agentData?.schema.output || null,
		/** Agent metadata */
		metadata: agentData?.metadata || null,
		/** Whether the agent exists in the current schemas */
		exists: !!agentData,
	};
}

/**
 * Hook to get all agent schemas as an array
 */
export function useWorkbenchAllAgentSchemas() {
	const { schemas } = useWorkbench();

	const allAgents = schemas
		? Object.entries(schemas.agents).map(([name, agentData]) => ({
				name,
				...agentData,
			}))
		: [];

	return {
		/** Array of all agent schema data */
		agents: allAgents,
		/** Whether any schemas are available */
		hasSchemas: allAgents.length > 0,
		/** Count of available schemas */
		count: allAgents.length,
	};
}
