import React, { createContext, useContext, useEffect, useState } from 'react';
import type { UIMessage } from 'ai';
import type { WorkbenchConfig } from '@agentuity/core/workbench';
import type { WorkbenchContextType } from '../../types/config';
import { useAgentSchemas } from '../../hooks/useAgentSchemas';

const WorkbenchContext = createContext<WorkbenchContextType | null>(null);

export function useWorkbench() {
	const context = useContext(WorkbenchContext);
	if (!context) {
		throw new Error('useWorkbench must be used within a WorkbenchProvider');
	}
	return context;
}

interface WorkbenchProviderProps {
	config: WorkbenchConfig;
	children: React.ReactNode;
}

export function WorkbenchProvider({ config, children }: WorkbenchProviderProps) {
	const [messages, setMessages] = useState<UIMessage[]>([]);
	const [selectedAgent, setSelectedAgent] = useState<string>('');
	const [inputMode, setInputMode] = useState<'text' | 'form'>('text');
	const [isLoading, setIsLoading] = useState(false);

	// Config values
	const baseUrl = config.port ? `http://localhost:${config.port}` : undefined;
	const apiKey = config.apiKey;
	const shouldUseSchemas = true;

	// Debug logging
	useEffect(() => {
		if (process.env.NODE_ENV === 'development') {
			console.log('WorkbenchProvider Debug:', {
				baseUrl,
				shouldUseSchemas,
			});
		}
	}, [baseUrl, shouldUseSchemas]);

	const {
		data: schemaData,
		isLoading: schemasLoading,
		error: schemasError,
		refetch: refetchSchemas,
	} = useAgentSchemas({
		baseUrl,
		apiKey,
		enabled: shouldUseSchemas,
	});

	// Convert schema data to Agent format, no fallback
	const agents = schemaData?.agents;
	// Log schema fetch errors for debugging
	useEffect(() => {
		if (schemasError) {
			console.warn(
				'Failed to fetch agent schemas from API, using static configuration:',
				schemasError.message
			);
		}
	}, [schemasError]);

	const [suggestions, _setSuggestions] = useState<string[]>([]);

	// Set initial agent selection
	useEffect(() => {
		if (agents && Object.keys(agents).length > 0 && !selectedAgent) {
			setSelectedAgent(Object.keys(agents)[0]);
		}
	}, [agents, selectedAgent]);

	// Fetch suggestions from API if endpoint is provided
	useEffect(() => {
		// No API endpoints hardcoded for now
	}, []);

	const _fetchSuggestions = async () => {
		// No API endpoints for now
	};

	const submitMessage = async (value: string, _mode: 'text' | 'form' = 'text') => {
		if (!selectedAgent) return;

		const selectedAgentData = agents?.[selectedAgent];
		const hasInputSchema = selectedAgentData?.schema?.input?.json;

		// Only require value for agents with input schemas
		if (hasInputSchema && !value.trim()) return;

		// Add user message
		const displayText = hasInputSchema
			? value
			: `Running ${selectedAgentData?.metadata.name || 'agent'}...`;
		const userMessage: UIMessage = {
			id: Date.now().toString(),
			role: 'user',
			parts: [{ type: 'text', text: displayText }],
		};

		setMessages((prev) => [...prev, userMessage]);
		setIsLoading(true);

		if (!baseUrl) {
			const errorMessage: UIMessage = {
				id: (Date.now() + 1).toString(),
				role: 'assistant',
				parts: [
					{
						type: 'text',
						text: 'Error: No base URL configured. Please configure a port in the workbench config.',
					},
				],
			};
			setMessages((prev) => [...prev, errorMessage]);
			setIsLoading(false);
			return;
		}

		try {
			// Parse input - if it's JSON, parse it, otherwise use as string
			// For agents without input schema, send undefined
			let parsedInput: unknown;
			if (!hasInputSchema) {
				parsedInput = undefined;
			} else {
				try {
					parsedInput = JSON.parse(value);
				} catch {
					parsedInput = value;
				}
			}

			// Call execution endpoint with timeout
			const headers: Record<string, string> = {
				'Content-Type': 'application/json',
			};
			if (apiKey) {
				headers.Authorization = `Bearer ${apiKey}`;
			}

			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

			try {
				const response = await fetch(`${baseUrl}/_agentuity/workbench/execute`, {
					method: 'POST',
					headers,
					body: JSON.stringify({
						agentId: selectedAgent,
						input: parsedInput,
					}),
					signal: controller.signal,
				});
				clearTimeout(timeoutId);

				if (!response.ok) {
					const errorData = await response
						.json()
						.catch(() => ({ error: response.statusText }));
					throw new Error(errorData.error || `Request failed with status ${response.status}`);
				}

				const result = await response.json();

				// Format result as JSON string for display
				const resultText =
					typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result);

				const assistantMessage: UIMessage = {
					id: (Date.now() + 1).toString(),
					role: 'assistant',
					parts: [{ type: 'text', text: resultText }],
				};

				setMessages((prev) => [...prev, assistantMessage]);
			} catch (fetchError) {
				clearTimeout(timeoutId);
				throw fetchError;
			}
		} catch (error) {
			console.error('Failed to submit message:', error);
			const errorText =
				error instanceof Error
					? error.name === 'AbortError'
						? 'Request timed out. Please try again.'
						: error.message
					: 'Sorry, I encountered an error processing your message.';

			const errorMessage: UIMessage = {
				id: (Date.now() + 1).toString(),
				role: 'assistant',
				parts: [
					{
						type: 'text',
						text: errorText,
					},
				],
			};
			setMessages((prev) => [...prev, errorMessage]);
		} finally {
			setIsLoading(false);
		}
	};

	const handleAgentSelect = async (agentId: string) => {
		setSelectedAgent(agentId);
		// No handlers configured for now
	};

	const contextValue: WorkbenchContextType = {
		config,
		agents: agents || {},
		suggestions,
		messages,
		setMessages,
		selectedAgent,
		setSelectedAgent: handleAgentSelect,
		inputMode,
		setInputMode,
		isLoading: isLoading || (shouldUseSchemas && !!schemasLoading),
		submitMessage,
		// Schema data from API
		schemas: schemaData,
		schemasLoading: !!schemasLoading,
		schemasError,
		refetchSchemas,
	};

	return <WorkbenchContext.Provider value={contextValue}>{children}</WorkbenchContext.Provider>;
}
