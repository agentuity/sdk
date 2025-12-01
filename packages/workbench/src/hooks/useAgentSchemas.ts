import { useState, useEffect, useCallback } from 'react';

export interface AgentSchema {
	input?: {
		code?: string;
		json?: string;
	};
	output?: {
		code?: string;
		json?: string;
	};
}

export interface AgentMetadata {
	id: string;
	name: string;
	description?: string;
	version?: string;
	filename?: string;
	identifier?: string;
}

export interface AgentSchemaData {
	schema: AgentSchema;
	metadata: AgentMetadata;
}

export interface AgentSchemasResponse {
	agents: Record<string, AgentSchemaData>;
}

export interface UseAgentSchemasOptions {
	baseUrl?: string;
	apiKey?: string;
	enabled?: boolean;
}

export interface UseAgentSchemasResult {
	data: AgentSchemasResponse | null;
	isLoading: boolean;
	error: Error | null;
	refetch: () => void;
}

/**
 * React hook for fetching agent schemas from the workbench metadata endpoint
 *
 * @example
 * ```tsx
 * const { data, isLoading, error, refetch } = useAgentSchemas({
 *   baseUrl: 'http://localhost:3000',
 *   apiKey: 'your-api-key', // optional
 *   enabled: true
 * });
 *
 * if (isLoading) return <div>Loading schemas...</div>;
 * if (error) return <div>Error: {error.message}</div>;
 * if (data) {
 *   Object.entries(data.agents).forEach(([name, agentData]) => {
 *     console.log(`Agent ${name}:`, agentData.schema);
 *   });
 * }
 * ```
 */
export function useAgentSchemas(options: UseAgentSchemasOptions = {}): UseAgentSchemasResult {
	const { baseUrl = '', apiKey, enabled = true } = options;

	const [data, setData] = useState<AgentSchemasResponse | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	const fetchSchemas = useCallback(async () => {
		if (!enabled) return;

		setIsLoading(true);
		setError(null);

		try {
			const url = `${baseUrl}/_agentuity/workbench/metadata.json`;
			const headers: HeadersInit = {
				'Content-Type': 'application/json',
			};

			if (apiKey) {
				headers['Authorization'] = `Bearer ${apiKey}`;
			}

			const response = await fetch(url, {
				method: 'GET',
				headers,
			});

			if (!response.ok) {
				if (response.status === 401) {
					throw new Error('Unauthorized: Invalid or missing API key');
				}
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const result = (await response.json()) as AgentSchemasResponse;
			setData(result);
		} catch (err) {
			const error = err instanceof Error ? err : new Error('Unknown error occurred');
			setError(error);
			console.error('Failed to fetch agent schemas:', error);
		} finally {
			setIsLoading(false);
		}
	}, [baseUrl, apiKey, enabled]);

	const refetch = useCallback(() => {
		void fetchSchemas();
	}, [fetchSchemas]);

	useEffect(() => {
		void fetchSchemas();
	}, [fetchSchemas]);

	return {
		data,
		isLoading,
		error,
		refetch,
	};
}

/**
 * Helper hook to get a specific agent's schema by name
 */
export function useAgentSchema(agentName: string, options: UseAgentSchemasOptions = {}) {
	const { data, isLoading, error, refetch } = useAgentSchemas(options);

	const agentData = data?.agents[agentName] || null;

	return {
		data: agentData,
		isLoading,
		error,
		refetch,
		schema: agentData?.schema || null,
		metadata: agentData?.metadata || null,
	};
}
