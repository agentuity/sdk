import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { UIMessage } from 'ai';
import type { WorkbenchConfig } from '@agentuity/core/workbench';
import type { WorkbenchContextType, ConnectionStatus } from '../../types/config';
import { useAgentSchemas } from '../../hooks/useAgentSchemas';
import { useWorkbenchWebsocket } from '../../hooks/useWorkbenchWebsocket';
import { useLogger } from '../../hooks/useLogger';
import { getTotalTokens, parseTokensHeader, defaultBaseUrl } from '../../lib/utils';

const WorkbenchContext = createContext<WorkbenchContextType | null>(null);

export function useWorkbench() {
	const context = useContext(WorkbenchContext);
	if (!context) {
		throw new Error('useWorkbench must be used within a WorkbenchProvider');
	}
	return context;
}

interface WorkbenchProviderProps {
	config: Omit<WorkbenchConfig, 'route'> & {
		baseUrl?: string | null;
		projectId?: string;
	};
	children: React.ReactNode;
}

export function WorkbenchProvider({ config, children }: WorkbenchProviderProps) {
	const logger = useLogger('WorkbenchProvider');

	// localStorage utilities scoped by project
	const getStorageKey = useCallback(
		(key: string) => `agentuity_workbench_${config.projectId}_${key}`,
		[config.projectId]
	);

	const saveSelectedAgent = useCallback(
		(agentId: string) => {
			try {
				localStorage.setItem(getStorageKey('selected_agent'), agentId);
			} catch (error) {
				console.warn('Failed to save selected agent to localStorage:', error);
			}
		},
		[getStorageKey]
	);

	const loadSelectedAgent = useCallback((): string | null => {
		try {
			return localStorage.getItem(getStorageKey('selected_agent'));
		} catch (error) {
			console.warn('Failed to load selected agent from localStorage:', error);
			return null;
		}
	}, [getStorageKey]);

	const [messages, setMessages] = useState<UIMessage[]>([]);
	const [selectedAgent, setSelectedAgent] = useState<string>('');
	const [inputMode, setInputMode] = useState<'text' | 'form'>('text');
	const [isLoading, setIsLoading] = useState(false);
	const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connected'); // Default to connected when websocket is disabled

	// Config values
	const baseUrl = config.baseUrl === undefined ? defaultBaseUrl : config.baseUrl;
	const apiKey = config.apiKey;
	const isBaseUrlNull = config.baseUrl === null;

	// Log baseUrl state
	useEffect(() => {
		if (isBaseUrlNull) {
			logger.debug('🚫 baseUrl is null - disabling API calls and websocket');
		} else {
			logger.debug('✅ baseUrl configured:', baseUrl);
		}
	}, [isBaseUrlNull, baseUrl, logger]);

	// Set disconnected status if baseUrl is null
	useEffect(() => {
		if (isBaseUrlNull) {
			logger.debug('🔌 Setting connection status to disconnected (baseUrl is null)');
			setConnectionStatus('disconnected');
		}
	}, [isBaseUrlNull, logger]);

	useEffect(() => {
		if (isBaseUrlNull) {
			logger.debug('📋 Schema fetching disabled (baseUrl is null)');
		}
	}, [isBaseUrlNull, logger]);

	const {
		data: schemaData,
		isLoading: schemasLoading,
		error: schemasError,
		refetch: refetchSchemas,
	} = useAgentSchemas({
		baseUrl,
		apiKey,
		enabled: !isBaseUrlNull,
	});

	// WebSocket connection for dev server restart detection
	const wsBaseUrl = isBaseUrlNull ? undefined : baseUrl;
	useEffect(() => {
		if (isBaseUrlNull) {
			logger.debug('🔌 WebSocket connection disabled (baseUrl is null)');
		}
	}, [isBaseUrlNull, logger]);

	const { connected } = useWorkbenchWebsocket({
		enabled: !isBaseUrlNull,
		baseUrl: wsBaseUrl,
		apiKey,
		onConnect: () => {
			setConnectionStatus('connected');
			refetchSchemas();
		},
		onReconnect: () => {
			setConnectionStatus('connected');
			refetchSchemas();
		},
		onAlive: () => {
			setConnectionStatus('connected');
			refetchSchemas();
		},
		onRestarting: () => {
			setConnectionStatus('restarting');
		},
	});

	useEffect(() => {
		if (!isBaseUrlNull && !connected && connectionStatus !== 'restarting') {
			setConnectionStatus('disconnected');
		}
	}, [connected, connectionStatus, isBaseUrlNull]);

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
			logger.debug('🔍 Available agents:', agents);

			// Try to load previously selected agent from localStorage
			const savedAgentId = loadSelectedAgent();
			logger.debug('💾 Saved agent from localStorage:', savedAgentId);

			// Check if saved agent still exists in available agents
			const savedAgent = savedAgentId
				? Object.values(agents).find((agent) => agent.metadata.agentId === savedAgentId)
				: null;

			if (savedAgent && savedAgentId) {
				logger.debug('✅ Restoring saved agent:', savedAgent.metadata.name);
				setSelectedAgent(savedAgentId);
			} else {
				// Fallback to first agent alphabetically
				const sortedAgents = Object.values(agents).sort((a, b) =>
					a.metadata.name.localeCompare(b.metadata.name)
				);
				const firstAgent = sortedAgents[0];
				logger.debug(
					'🎯 No saved agent found, using first agent (alphabetically):',
					firstAgent
				);
				logger.debug('🆔 Setting selectedAgent to:', firstAgent.metadata.agentId);
				setSelectedAgent(firstAgent.metadata.agentId);
				// Save this selection for next time
				saveSelectedAgent(firstAgent.metadata.agentId);
			}
		}
	}, [agents, selectedAgent, loadSelectedAgent, saveSelectedAgent, logger]);

	// Fetch suggestions from API if endpoint is provided
	useEffect(() => {
		// No API endpoints hardcoded for now
	}, []);

	const _fetchSuggestions = async () => {
		// No API endpoints for now
	};

	const submitMessage = async (value: string, _mode: 'text' | 'form' = 'text') => {
		if (!selectedAgent) return;

		logger.debug('🚀 Submitting message with selectedAgent:', selectedAgent);
		const selectedAgentData = agents
			? Object.values(agents).find((agent) => agent.metadata.agentId === selectedAgent)
			: undefined;
		logger.debug('📊 Found selectedAgentData:', selectedAgentData);
		const hasInputSchema = selectedAgentData?.schema?.input?.json;
		logger.debug('📝 hasInputSchema:', hasInputSchema, 'value:', value);

		// Only require value for agents with input schemas
		if (hasInputSchema && !value.trim()) {
			logger.debug('❌ Returning early - hasInputSchema but no value');
			return;
		}

		logger.debug('✅ Validation passed, continuing with message submission...');

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

		logger.debug('🔗 baseUrl:', baseUrl, 'isBaseUrlNull:', isBaseUrlNull);
		if (!baseUrl || isBaseUrlNull) {
			logger.debug('❌ Message submission blocked - baseUrl is null or missing');
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

			logger.debug('🌐 About to make API call...');
			// Call execution endpoint with timeout
			const headers: Record<string, string> = {
				'Content-Type': 'application/json',
			};
			if (apiKey) {
				headers.Authorization = `Bearer ${apiKey}`;
			}

			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

			const startTime = performance.now();

			try {
				const requestPayload = {
					agentId: selectedAgent,
					input: parsedInput,
				};
				logger.debug('📤 API Request payload:', requestPayload);
				const response = await fetch(`${baseUrl}/_agentuity/workbench/execute`, {
					method: 'POST',
					headers,
					body: JSON.stringify(requestPayload),
					signal: controller.signal,
				});
				clearTimeout(timeoutId);

				if (!response.ok) {
					let errorMessage = `Request failed with status ${response.status}`;
					try {
						const errorData = await response.json();
						errorMessage = errorData.error || errorData.message || errorMessage;
					} catch {
						// If JSON parsing fails, use status text
						errorMessage = response.statusText || errorMessage;
					}
					throw new Error(errorMessage);
				}

				let result;
				try {
					result = await response.json();
				} catch (jsonError) {
					throw new Error(`Invalid JSON response from server: ${jsonError}`);
				}

				const endTime = performance.now();
				const clientDuration = ((endTime - startTime) / 1000).toFixed(1); // Duration in seconds

				// Extract duration from response header, fallback to client-side timing
				const durationHeader = response.headers.get('x-agentuity-duration');
				const duration = durationHeader || `${clientDuration}s`;

				// Extract token count from response header
				const tokensHeader = response.headers.get('x-agentuity-tokens');
				const tokensRecord = tokensHeader ? parseTokensHeader(tokensHeader) : undefined;
				const totalTokens = tokensRecord ? getTotalTokens(tokensRecord) : undefined;

				// Format result as JSON string for display
				const resultText =
					typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result);

				const assistantMessage: UIMessage & { tokens?: string; duration?: string } = {
					id: (Date.now() + 1).toString(),
					role: 'assistant',
					parts: [{ type: 'text', text: resultText }],
					tokens: totalTokens?.toString(),
					duration,
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
		logger.debug('🔄 handleAgentSelect called with:', agentId);
		setSelectedAgent(agentId);
		// Save selection to localStorage for persistence across sessions
		saveSelectedAgent(agentId);
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
		isLoading: isLoading || !!schemasLoading,
		submitMessage,
		// Schema data from API
		schemas: schemaData,
		schemasLoading: !!schemasLoading,
		schemasError,
		refetchSchemas,
		// Connection status
		connectionStatus,
	};

	return <WorkbenchContext.Provider value={contextValue}>{children}</WorkbenchContext.Provider>;
}
