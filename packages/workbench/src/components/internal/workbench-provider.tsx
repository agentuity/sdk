import type { WorkbenchConfig } from '@agentuity/core/workbench';
import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAgentSchemas } from '../../hooks/useAgentSchemas';
import { useLogger } from '../../hooks/useLogger';
import { useWorkbenchWebsocket } from '../../hooks/useWorkbenchWebsocket';
import { defaultBaseUrl } from '../../lib/utils';
import type { ConnectionStatus, WorkbenchContextType, WorkbenchMessage } from '../../types/config';

const WorkbenchContext = createContext<WorkbenchContextType | null>(null);

export function useWorkbench() {
	const context = useContext(WorkbenchContext);

	if (!context) {
		throw new Error('useWorkbench must be used within a WorkbenchProvider');
	}

	return context;
}

/**
 * Callback to get authentication headers for workbench requests.
 * Called before each API request with the request body.
 * Should return headers like X-Agentuity-Workbench-Signature and X-Agentuity-Workbench-Timestamp.
 */
export type GetAuthHeaders = (body: string) => Promise<Record<string, string>>;

interface WorkbenchProviderProps {
	config: Omit<WorkbenchConfig, 'route'> & {
		baseUrl?: string | null;
		projectId?: string;
	};
	env: {
		agentuity: boolean;
		authenticated: boolean;
		cloud: boolean;
	};
	children: React.ReactNode;
	portals?: {
		actionBar?: {
			pre?: React.ReactNode;
			post?: React.ReactNode;
		};
	};
	/**
	 * Optional callback to get authentication headers for requests to deployed agents.
	 * Called before each API request with the request body (empty string for GET/DELETE).
	 * Useful for signature-based authentication in production deployments.
	 */
	getAuthHeaders?: GetAuthHeaders;
}

export function WorkbenchProvider({
	config,
	env = {
		agentuity: false,
		authenticated: false,
		cloud: false,
	},
	children,
	portals,
	getAuthHeaders,
}: WorkbenchProviderProps) {
	const logger = useLogger('WorkbenchProvider');

	// Use ref for getAuthHeaders to prevent re-render loops when the callback changes identity
	const getAuthHeadersRef = useRef(getAuthHeaders);
	getAuthHeadersRef.current = getAuthHeaders;

	// localStorage utilities scoped by project
	const getStorageKey = useCallback(
		(key: string) =>
			`agentuity-workbench-${config.projectId ? `${config.projectId}-` : ''}${key}`,
		[config.projectId]
	);

	const saveSelectedAgent = useCallback(
		(agentId: string) => {
			try {
				localStorage.setItem(getStorageKey('selected-agent'), agentId);
			} catch (error) {
				logger.warn('Failed to save selected agent to localStorage:', error);
			}
		},
		[getStorageKey, logger.warn]
	);

	const loadSelectedAgent = useCallback((): string | null => {
		try {
			return localStorage.getItem(getStorageKey('selected-agent'));
		} catch (error) {
			logger.warn('Failed to load selected agent from localStorage:', error);
			return null;
		}
	}, [getStorageKey, logger.warn]);

	// Thread IDs are stored per baseUrl to avoid signature mismatch between environments
	// (local signs with 'agentuity', cloud signs with AGENTUITY_SDK_KEY)
	const getThreadStorageKey = useCallback(() => {
		// Use a hash of the baseUrl to create unique storage per endpoint
		const url = config.baseUrl ?? 'local';
		const urlHash =
			typeof url === 'string' ? btoa(encodeURIComponent(url)).slice(0, 16) : 'local';
		return getStorageKey(`thread-id-${urlHash}`);
	}, [getStorageKey, config.baseUrl]);

	const saveThreadId = useCallback(
		(threadId: string) => {
			try {
				localStorage.setItem(getThreadStorageKey(), threadId);
			} catch (error) {
				logger.warn('Failed to save thread id to localStorage:', error);
			}
		},
		[getThreadStorageKey, logger.warn]
	);

	const loadThreadId = useCallback((): string | null => {
		try {
			return localStorage.getItem(getThreadStorageKey());
		} catch (error) {
			logger.warn('Failed to load thread id from localStorage:', error);

			return null;
		}
	}, [getThreadStorageKey, logger.warn]);

	const applyThreadIdHeader = useCallback(
		(headers: Record<string, string>) => {
			const threadId = loadThreadId();
			if (threadId) {
				headers['x-thread-id'] = threadId;
			}
		},
		[loadThreadId]
	);

	const persistThreadIdFromResponse = useCallback(
		(response: Response) => {
			const threadId = response.headers.get('x-thread-id');
			if (threadId) {
				saveThreadId(threadId);
			}
		},
		[saveThreadId]
	);

	const [messages, setMessages] = useState<WorkbenchMessage[]>([]);
	const [selectedAgent, setSelectedAgent] = useState<string>('');
	const [inputMode, setInputMode] = useState<'text' | 'form'>('text');
	const [isLoading, setIsLoading] = useState(false);
	const [isGeneratingSample, setIsGeneratingSample] = useState(false);
	const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connected'); // Default to connected when websocket is disabled

	// Config values
	const baseUrl = config.baseUrl === undefined ? defaultBaseUrl : config.baseUrl;
	const apiKey = config.apiKey;
	const configHeaders = config.headers;
	const isBaseUrlNull = config.baseUrl === null;

	// Helper to build request headers with config headers, auth, and thread ID
	const buildRequestHeaders = useCallback(
		(additionalHeaders?: Record<string, string>): Record<string, string> => {
			const headers: Record<string, string> = {
				...(configHeaders || {}),
				...(additionalHeaders || {}),
			};

			if (apiKey) {
				headers.Authorization = `Bearer ${apiKey}`;
			}

			applyThreadIdHeader(headers);

			return headers;
		},
		[configHeaders, apiKey, applyThreadIdHeader]
	);

	// Async helper to get request headers including auth headers from callback
	const getRequestHeaders = useCallback(
		async (
			body: string,
			additionalHeaders?: Record<string, string>
		): Promise<Record<string, string>> => {
			const headers = buildRequestHeaders(additionalHeaders);

			// Call getAuthHeaders callback if provided (use ref to avoid re-render loops)
			if (getAuthHeadersRef.current) {
				try {
					const authHeaders = await getAuthHeadersRef.current(body);
					Object.assign(headers, authHeaders);
				} catch (error) {
					logger.warn('Failed to get auth headers:', error);
				}
			}

			return headers;
		},
		[buildRequestHeaders, logger]
	);

	// Log baseUrl state
	useEffect(() => {
		if (isBaseUrlNull) {
			logger.debug('🚫 baseUrl is null - disabling API calls and websocket');
		} else {
			logger.debug('✅ baseUrl configured:', baseUrl);
		}
	}, [isBaseUrlNull, baseUrl, logger]);

	// Set connection status based on baseUrl availability
	// In cloud mode, we don't have websocket so we set connected when baseUrl is available
	useEffect(() => {
		if (isBaseUrlNull) {
			logger.debug('🔌 Setting connection status to disconnected (baseUrl is null)');
			setConnectionStatus('disconnected');
		} else if (env.cloud) {
			// In cloud mode, we're "connected" as soon as we have a baseUrl
			// (no websocket to wait for)
			logger.debug('🔌 Setting connection status to connected (cloud mode with baseUrl)');
			setConnectionStatus('connected');
		}
	}, [isBaseUrlNull, env.cloud, logger]);

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
		baseUrl: baseUrl ?? undefined,
		apiKey,
		headers: configHeaders,
		enabled: !isBaseUrlNull,
		getAuthHeaders,
	});

	// WebSocket connection for dev server restart detection
	// Only enable for local dev - deployed agents don't have websocket endpoints
	const wsEnabled = !isBaseUrlNull && !env.cloud;
	const wsBaseUrl = wsEnabled && baseUrl ? baseUrl : undefined;

	useEffect(() => {
		if (isBaseUrlNull) {
			logger.debug('🔌 WebSocket connection disabled (baseUrl is null)');
		} else if (env.cloud) {
			logger.debug('🔌 WebSocket connection disabled (cloud mode)');
		}
	}, [isBaseUrlNull, env.cloud, logger]);

	const { connected } = useWorkbenchWebsocket({
		enabled: wsEnabled,
		baseUrl: wsBaseUrl,
		apiKey,
		headers: configHeaders,
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
		// In cloud mode, websocket is disabled so we stay 'connected' (no live connection tracking)
		// In local mode, track the websocket connection status
		if (!isBaseUrlNull && !env.cloud && !connected && connectionStatus !== 'restarting') {
			setConnectionStatus('disconnected');
		}
	}, [connected, connectionStatus, isBaseUrlNull, env.cloud]);

	// Convert schema data to Agent format, no fallback
	const agents = schemaData?.agents;

	// Log schema fetch errors for debugging
	useEffect(() => {
		if (schemasError) {
			logger.warn(
				'Failed to fetch agent schemas from API, using static configuration:',
				schemasError.message
			);
		}
	}, [schemasError, logger.warn]);

	// Fetch state for an agent
	const fetchAgentState = useCallback(
		async (agentId: string) => {
			if (!baseUrl) {
				logger.debug('⚠️ No baseUrl configured, skipping state fetch');
				return;
			}

			if (!agentId) {
				logger.debug('⚠️ No agentId provided, skipping state fetch');
				return;
			}

			try {
				const url = `${baseUrl}/_agentuity/workbench/state?agentId=${encodeURIComponent(agentId)}`;

				logger.debug('📡 Fetching state for agent:', agentId);

				const headers = await getRequestHeaders('');
				const response = await fetch(url, {
					method: 'GET',
					headers,
					credentials: 'include',
				});

				persistThreadIdFromResponse(response);

				if (response.ok) {
					const data = await response.json();
					const stateMessages = (data.messages || []) as Array<{
						type: 'input' | 'output';
						data: unknown;
						sessionId?: string;
						tokens?: string;
						duration?: string;
						timestamp?: number;
					}>;

					// Convert state messages to WorkbenchMessage format
					// Use stable IDs based on message index to prevent unnecessary re-renders
					const workbenchMessages: WorkbenchMessage[] = stateMessages.map((msg, index) => {
						const text =
							typeof msg.data === 'object'
								? JSON.stringify(msg.data, null, 2)
								: String(msg.data);

						// Use stable ID based on index and a hash of content to maintain identity
						const contentHash = text.substring(0, 20).replace(/[^a-zA-Z0-9]/g, '');

						return {
							id: `state_${agentId}_${index}_${contentHash}`,
							role: msg.type === 'input' ? 'user' : 'assistant',
							parts: [{ type: 'text', text }],
							sessionId: msg.sessionId,
							tokens: msg.tokens,
							duration: msg.duration,
							timestamp: msg.timestamp,
						};
					});

					setMessages(workbenchMessages);

					logger.debug('✅ Loaded state messages:', workbenchMessages.length);
				} else {
					logger.debug('⚠️ Failed to fetch state, starting with empty messages');

					setMessages([]);
				}
			} catch (error) {
				logger.debug('⚠️ Error fetching state:', error);

				setMessages([]);
			}
		},
		[baseUrl, logger, getRequestHeaders, persistThreadIdFromResponse]
	);

	// Set initial agent selection
	useEffect(() => {
		if (agents && Object.keys(agents).length > 0 && !selectedAgent) {
			logger.debug('🔍 Available agents:', agents);

			// First, check for agent query parameter in URL
			const urlParams = new URLSearchParams(window.location.search);
			const agentFromUrl = urlParams.get('agent');

			logger.debug('🔗 Agent from URL query param:', agentFromUrl);

			// Try to find agent by URL param (matches agentId)
			let agentToSelect: string | null = null;

			if (agentFromUrl) {
				const matchedAgent = Object.values(agents).find(
					(agent) => agent.metadata.agentId === agentFromUrl
				);

				if (matchedAgent) {
					logger.debug('✅ Found agent from URL param:', matchedAgent.metadata.name);

					agentToSelect = matchedAgent.metadata.agentId;
				}
			}

			// If no URL param match, try localStorage
			if (!agentToSelect) {
				const savedAgentId = loadSelectedAgent();

				logger.debug('💾 Saved agent from localStorage:', savedAgentId);

				const savedAgent = savedAgentId
					? Object.values(agents).find((agent) => agent.metadata.agentId === savedAgentId)
					: null;

				if (savedAgent && savedAgentId) {
					logger.debug('✅ Restoring saved agent:', savedAgent.metadata.name);

					agentToSelect = savedAgentId;
				}
			}

			// Fallback to first agent alphabetically
			if (!agentToSelect) {
				const sortedAgents = Object.values(agents).sort((a, b) =>
					a.metadata.name.localeCompare(b.metadata.name)
				);

				const firstAgent = sortedAgents[0];

				if (firstAgent) {
					logger.debug(
						'🎯 No saved agent found, using first agent (alphabetically):',
						firstAgent
					);

					agentToSelect = firstAgent.metadata.agentId;
				}
			}

			if (agentToSelect) {
				logger.debug('🆔 Setting selectedAgent to:', agentToSelect);

				setSelectedAgent(agentToSelect);
				saveSelectedAgent(agentToSelect);
				fetchAgentState(agentToSelect);
			}
		}
	}, [agents, selectedAgent, loadSelectedAgent, saveSelectedAgent, logger, fetchAgentState]);

	// Validate selected agent still exists when agents list changes (e.g., switching local ↔ cloud)
	useEffect(() => {
		if (!agents || Object.keys(agents).length === 0 || !selectedAgent) return;

		const agentExists = Object.values(agents).some(
			(agent) => agent.metadata.agentId === selectedAgent
		);

		if (!agentExists) {
			logger.debug('⚠️ Selected agent no longer exists, falling back to first agent');

			const sortedAgents = Object.values(agents).sort((a, b) =>
				a.metadata.name.localeCompare(b.metadata.name)
			);

			const firstAgent = sortedAgents[0];

			if (firstAgent) {
				setSelectedAgent(firstAgent.metadata.agentId);
				saveSelectedAgent(firstAgent.metadata.agentId);
				fetchAgentState(firstAgent.metadata.agentId);
			}
		}
	}, [agents, selectedAgent, logger, saveSelectedAgent, fetchAgentState]);

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
		// Note: We also add a placeholder assistant message so only the last message
		// shows a loading state while the request is in-flight.
		const now = Date.now();
		const displayText = hasInputSchema
			? value
			: `Running ${selectedAgentData?.metadata.name || 'agent'}...`;
		const userMessage: WorkbenchMessage = {
			id: now.toString(),
			role: 'user',
			parts: [{ type: 'text', text: displayText }],
			timestamp: now,
		};
		const assistantMessageId = (now + 1).toString();
		const placeholderAssistantMessage: WorkbenchMessage = {
			id: assistantMessageId,
			role: 'assistant',
			parts: [{ type: 'text', text: '', state: 'streaming' }],
		};

		setMessages((prev) => [...prev, userMessage, placeholderAssistantMessage]);
		setIsLoading(true);

		logger.debug('🔗 baseUrl:', baseUrl, 'isBaseUrlNull:', isBaseUrlNull);

		if (!baseUrl || isBaseUrlNull) {
			logger.debug('❌ Message submission blocked - baseUrl is null or missing');

			const errorMessage: WorkbenchMessage = {
				id: assistantMessageId,
				role: 'assistant',
				parts: [
					{
						type: 'text',
						text: 'Error: No base URL configured. Please configure a port in the workbench config.',
					},
				],
			};

			setMessages((prev) => prev.map((m) => (m.id === assistantMessageId ? errorMessage : m)));

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

			const startTime = performance.now();

			try {
				const requestPayload = {
					agentId: selectedAgent,
					input: parsedInput,
				};
				const requestBody = JSON.stringify(requestPayload);

				logger.debug('📤 API Request payload:', requestPayload);

				const headers = await getRequestHeaders(requestBody, {
					'Content-Type': 'application/json',
				});
				const response = await fetch(`${baseUrl}/_agentuity/workbench/execute`, {
					method: 'POST',
					headers,
					body: requestBody,
					credentials: 'include',
				});

				persistThreadIdFromResponse(response);

				if (!response.ok) {
					let errorText = `Request failed with status ${response.status}`;

					try {
						const errorData = await response.json();

						errorText = errorData.error || errorData.message || errorText;
					} catch {
						// If JSON parsing fails, use status text
						errorText = response.statusText || errorText;
					}

					const errorPayload = JSON.stringify({
						__agentError: true,
						message: errorText,
						code: `HTTP_${response.status}`,
					});

					const errorMessage: WorkbenchMessage = {
						id: assistantMessageId,
						role: 'assistant',
						parts: [{ type: 'text', text: errorPayload }],
					};

					setMessages((prev) =>
						prev.map((m) => (m.id === assistantMessageId ? errorMessage : m))
					);

					setIsLoading(false);

					return;
				}

				let responseBody: unknown;

				try {
					responseBody = await response.json();
				} catch (jsonError) {
					throw new Error(`Invalid JSON response from server: ${jsonError}`);
				}

				const endTime = performance.now();
				const clientDuration = ((endTime - startTime) / 1000).toFixed(1); // Duration in seconds

				// Extract duration from response header, fallback to client-side timing
				const durationHeader = response.headers.get('x-agentuity-duration');
				const duration = durationHeader || `${clientDuration}s`;

				// Extract token count from response header (keep raw format for consistency with thread state)
				const tokens = response.headers.get('x-agentuity-tokens') || undefined;

				// Handle wrapped response shape: { success, data?, error? }
				const envelope =
					typeof responseBody === 'object' && responseBody !== null
						? (responseBody as {
								success?: boolean;
								data?: unknown;
								error?: {
									message?: string;
									stack?: string;
									code?: string;
									cause?: unknown;
								};
							})
						: null;

				if (envelope && 'success' in envelope && envelope.success === false && envelope.error) {
					// Agent execution error - encode as special JSON format for ErrorBubble
					const errorPayload = JSON.stringify({
						__agentError: true,
						message: envelope.error.message || 'Unknown error',
						stack: envelope.error.stack,
						code: envelope.error.code,
						cause: envelope.error.cause,
					});

					const errorMessage: WorkbenchMessage = {
						id: assistantMessageId,
						role: 'assistant',
						parts: [{ type: 'text', text: errorPayload }],
					};

					setMessages((prev) =>
						prev.map((m) => (m.id === assistantMessageId ? errorMessage : m))
					);
					return;
				}

				// Success - extract data from envelope (or use raw response if not wrapped)
				const result =
					envelope && 'success' in envelope && envelope.success === true
						? envelope.data
						: responseBody;

				// Format result as JSON string for display
				const resultText =
					typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result);

				const sessionId = response.headers.get('x-session-id') || undefined;

				const assistantMessage: WorkbenchMessage = {
					id: assistantMessageId,
					role: 'assistant',
					parts: [{ type: 'text', text: resultText }],
					tokens,
					duration,
					sessionId,
					timestamp: Date.now(),
				};

				setMessages((prev) =>
					prev.map((m) => (m.id === assistantMessageId ? assistantMessage : m))
				);
			} catch (fetchError) {
				logger.error('❌ Failed to submit message:', fetchError);

				throw fetchError;
			}
		} catch (error) {
			logger.error('❌ Failed to submit message:', error);

			const errorText =
				error instanceof Error
					? error.name === 'AbortError'
						? 'Request timed out. Please try again.'
						: error.message
					: 'Sorry, I encountered an error processing your message.';

			const errorPayload = JSON.stringify({
				__agentError: true,
				message: errorText,
				code:
					error instanceof Error && error.name === 'AbortError' ? 'TIMEOUT' : 'REQUEST_ERROR',
			});

			const errorMessage: WorkbenchMessage = {
				id: assistantMessageId,
				role: 'assistant',
				parts: [{ type: 'text', text: errorPayload }],
			};

			setMessages((prev) => prev.map((m) => (m.id === assistantMessageId ? errorMessage : m)));
		} finally {
			setIsLoading(false);
		}
	};

	const generateSample = async (agentId: string): Promise<string> => {
		if (!baseUrl || isBaseUrlNull) {
			throw new Error('Base URL not configured');
		}

		setIsGeneratingSample(true);

		try {
			const url = `${baseUrl}/_agentuity/workbench/sample?agentId=${encodeURIComponent(agentId)}`;

			const headers = await getRequestHeaders('', { 'Content-Type': 'application/json' });
			const response = await fetch(url, {
				method: 'GET',
				headers,
				credentials: 'include',
			});

			persistThreadIdFromResponse(response);

			if (!response.ok) {
				let errorMessage = `Request failed with status ${response.status}`;

				try {
					const errorData = await response.json();

					errorMessage = errorData.error || errorData.message || errorMessage;
				} catch {
					errorMessage = response.statusText || errorMessage;
				}

				throw new Error(errorMessage);
			}

			const sample = await response.json();

			return JSON.stringify(sample, null, 2);
		} catch (error) {
			logger.error('Failed to generate sample JSON:', error);

			throw error;
		} finally {
			setIsGeneratingSample(false);
		}
	};

	const handleAgentSelect = async (agentId: string) => {
		logger.debug('🔄 handleAgentSelect called with:', agentId);

		setSelectedAgent(agentId);
		// Save selection to localStorage for persistence across sessions
		saveSelectedAgent(agentId);

		// Update URL query param without page reload
		if (typeof window !== 'undefined') {
			const url = new URL(window.location.href);
			url.searchParams.set('agent', agentId);
			window.history.replaceState({}, '', url.toString());
		}

		// Fetch state for the selected agent
		await fetchAgentState(agentId);
	};

	const clearAgentState = useCallback(
		async (agentId: string) => {
			if (!baseUrl) {
				return;
			}

			try {
				const url = `${baseUrl}/_agentuity/workbench/state?agentId=${encodeURIComponent(agentId)}`;
				const headers = await getRequestHeaders('');
				const response = await fetch(url, {
					method: 'DELETE',
					headers,
					credentials: 'include',
				});

				persistThreadIdFromResponse(response);

				if (response.ok) {
					setMessages([]);

					logger.debug('✅ Cleared state for agent:', agentId);
				} else {
					logger.debug('⚠️ Failed to clear state');
				}
			} catch (error) {
				logger.debug('⚠️ Error clearing state:', error);
			}
		},
		[baseUrl, logger, getRequestHeaders, persistThreadIdFromResponse]
	);

	const contextValue: WorkbenchContextType = {
		agents: agents || {},
		clearAgentState,
		config,
		connectionStatus,
		env,
		generateSample,
		inputMode,
		isGeneratingSample,
		isLoading: isLoading || !!schemasLoading,
		messages,
		portals,
		refetchSchemas,
		schemas: schemaData,
		schemasError,
		schemasLoading: !!schemasLoading,
		selectedAgent,
		setInputMode,
		setMessages,
		setSelectedAgent: handleAgentSelect,
		submitMessage,
	};

	return <WorkbenchContext.Provider value={contextValue}>{children}</WorkbenchContext.Provider>;
}
