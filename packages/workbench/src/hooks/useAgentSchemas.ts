import type { JSONSchema7 } from 'ai';
import { useCallback, useEffect, useState } from 'react';

export interface AgentSchema {
	input?: {
		code?: string;
		json?: JSONSchema7;
	};
	output?: {
		code?: string;
		json?: string;
	};
}

export interface AgentMetadata {
	agentId: string;
	description?: string;
	filename?: string;
	id: string;
	identifier?: string;
	name: string;
	version?: string;
}

export interface AgentSchemaData {
	examples?: unknown[];
	metadata: AgentMetadata;
	schema: AgentSchema;
}

export interface AgentSchemasResponse {
	agents: Record<string, AgentSchemaData>;
}

export interface UseAgentSchemasOptions {
	apiKey?: string;
	baseUrl?: string;
	enabled?: boolean;
}

export interface UseAgentSchemasResult {
	data: AgentSchemasResponse | null;
	error: Error | null;
	isLoading: boolean;
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
				headers.Authorization = `Bearer ${apiKey}`;
			}

			const response = await fetch(url, {
				method: 'GET',
				headers,
			});

			if (!response.ok) {
				// Handle 404/500 gracefully without throwing
				if (response.status === 401) {
					setError(new Error('Unauthorized: Invalid or missing API key'));

					return;
				}

				if (response.status === 404 || response.status >= 500) {
					setError(new Error(`Server error: ${response.status} ${response.statusText}`));

					return;
				}

				setError(new Error(`HTTP ${response.status}: ${response.statusText}`));

				return;
			}

			try {
				const result = (await response.json()) as AgentSchemasResponse;

				setData(result);
			} catch (jsonError) {
				setError(new Error('Invalid JSON response from server'));

				console.error('Failed to parse JSON response:', jsonError);
			}
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
		error,
		isLoading,
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
		error,
		isLoading,
		metadata: agentData?.metadata || null,
		refetch,
		schema: agentData?.schema || null,
	};
}
