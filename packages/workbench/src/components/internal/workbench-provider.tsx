import type { WorkbenchConfig } from "@agentuity/core/workbench";
import type { UIMessage } from "ai";
import type React from "react";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";
import { useAgentSchemas } from "../../hooks/useAgentSchemas";
import { useLogger } from "../../hooks/useLogger";
import { useWorkbenchWebsocket } from "../../hooks/useWorkbenchWebsocket";
import {
	defaultBaseUrl,
	getTotalTokens,
	parseTokensHeader,
} from "../../lib/utils";
import type {
	ConnectionStatus,
	WorkbenchContextType,
} from "../../types/config";

const WorkbenchContext = createContext<WorkbenchContextType | null>(null);

export function useWorkbench() {
	const context = useContext(WorkbenchContext);

	if (!context) {
		throw new Error("useWorkbench must be used within a WorkbenchProvider");
	}

	return context;
}

interface WorkbenchProviderProps {
	config: Omit<WorkbenchConfig, "route"> & {
		baseUrl?: string | null;
		projectId?: string;
	};
	env: {
		agentuity: boolean;
		authenticated: boolean;
		cloud: boolean;
	};
	children: React.ReactNode;
}

export function WorkbenchProvider({
	config,
	env = {
		agentuity: false,
		authenticated: false,
		cloud: false,
	},
	children,
}: WorkbenchProviderProps) {
	const logger = useLogger("WorkbenchProvider");
	// localStorage utilities scoped by project
	const getStorageKey = useCallback(
		(key: string) =>
			`agentuity-workbench-${config.projectId ? `${config.projectId}-` : ""}${key}`,
		[config.projectId],
	);

	const saveSelectedAgent = useCallback(
		(agentId: string) => {
			try {
				localStorage.setItem(getStorageKey("selected-agent"), agentId);
			} catch (error) {
				console.warn("Failed to save selected agent to localStorage:", error);
			}
		},
		[getStorageKey],
	);

	const loadSelectedAgent = useCallback((): string | null => {
		try {
			return localStorage.getItem(getStorageKey("selected-agent"));
		} catch (error) {
			console.warn("Failed to load selected agent from localStorage:", error);
			return null;
		}
	}, [getStorageKey]);

	const saveThreadId = useCallback(
		(threadId: string) => {
			try {
				localStorage.setItem(getStorageKey("thread-id"), threadId);
			} catch (error) {
				console.warn("Failed to save thread id to localStorage:", error);
			}
		},
		[getStorageKey],
	);

	const loadThreadId = useCallback((): string | null => {
		try {
			return localStorage.getItem(getStorageKey("thread-id"));
		} catch (error) {
			console.warn("Failed to load thread id from localStorage:", error);
			return null;
		}
	}, [getStorageKey]);

	const applyThreadIdHeader = useCallback(
		(headers: Record<string, string>) => {
			const threadId = loadThreadId();
			if (threadId) {
				headers["x-thread-id"] = threadId;
			}
		},
		[loadThreadId],
	);

	const persistThreadIdFromResponse = useCallback(
		(response: Response) => {
			const threadId = response.headers.get("x-thread-id");
			if (threadId) {
				saveThreadId(threadId);
			}
		},
		[saveThreadId],
	);

	const [messages, setMessages] = useState<UIMessage[]>([]);
	const [selectedAgent, setSelectedAgent] = useState<string>("");
	const [inputMode, setInputMode] = useState<"text" | "form">("text");
	const [isLoading, setIsLoading] = useState(false);
	const [isGeneratingSample, setIsGeneratingSample] = useState(false);
	const [connectionStatus, setConnectionStatus] =
		useState<ConnectionStatus>("connected"); // Default to connected when websocket is disabled

	// Config values
	const baseUrl =
		config.baseUrl === undefined ? defaultBaseUrl : config.baseUrl;
	const apiKey = config.apiKey;
	const isBaseUrlNull = config.baseUrl === null;

	// Log baseUrl state
	useEffect(() => {
		if (isBaseUrlNull) {
			logger.debug("🚫 baseUrl is null - disabling API calls and websocket");
		} else {
			logger.debug("✅ baseUrl configured:", baseUrl);
		}
	}, [isBaseUrlNull, baseUrl, logger]);

	// Set disconnected status if baseUrl is null
	useEffect(() => {
		if (isBaseUrlNull) {
			logger.debug(
				"🔌 Setting connection status to disconnected (baseUrl is null)",
			);

			setConnectionStatus("disconnected");
		}
	}, [isBaseUrlNull, logger]);

	useEffect(() => {
		if (isBaseUrlNull) {
			logger.debug("📋 Schema fetching disabled (baseUrl is null)");
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
			logger.debug("🔌 WebSocket connection disabled (baseUrl is null)");
		}
	}, [isBaseUrlNull, logger]);

	const { connected } = useWorkbenchWebsocket({
		enabled: !isBaseUrlNull,
		baseUrl: wsBaseUrl,
		apiKey,
		onConnect: () => {
			setConnectionStatus("connected");
			refetchSchemas();
		},
		onReconnect: () => {
			setConnectionStatus("connected");
			refetchSchemas();
		},
		onAlive: () => {
			setConnectionStatus("connected");
			refetchSchemas();
		},
		onRestarting: () => {
			setConnectionStatus("restarting");
		},
	});

	useEffect(() => {
		if (!isBaseUrlNull && !connected && connectionStatus !== "restarting") {
			setConnectionStatus("disconnected");
		}
	}, [connected, connectionStatus, isBaseUrlNull]);

	// Convert schema data to Agent format, no fallback
	const agents = schemaData?.agents;

	// Log schema fetch errors for debugging
	useEffect(() => {
		if (schemasError) {
			console.warn(
				"Failed to fetch agent schemas from API, using static configuration:",
				schemasError.message,
			);
		}
	}, [schemasError]);

	// Fetch state for an agent
	const fetchAgentState = useCallback(
		async (agentId: string) => {
			if (!baseUrl) {
				logger.debug("⚠️ No baseUrl configured, skipping state fetch");
				return;
			}

			if (!agentId) {
				logger.debug("⚠️ No agentId provided, skipping state fetch");
				return;
			}

			try {
				const headers: Record<string, string> = {};

				if (apiKey) {
					headers.Authorization = `Bearer ${apiKey}`;
				}

				applyThreadIdHeader(headers);

				const url = `${baseUrl}/_agentuity/workbench/state?agentId=${encodeURIComponent(agentId)}`;

				logger.debug("📡 Fetching state for agent:", agentId);

				const response = await fetch(url, {
					method: "GET",
					headers,
					credentials: "include",
				});

				persistThreadIdFromResponse(response);

				if (response.ok) {
					const data = await response.json();
					const stateMessages = (data.messages || []) as Array<{
						type: "input" | "output";
						data: unknown;
					}>;

					// Convert state messages to UIMessage format
					// Use stable IDs based on message index to prevent unnecessary re-renders
					const uiMessages: UIMessage[] = stateMessages.map((msg, index) => {
						const text =
							typeof msg.data === "object"
								? JSON.stringify(msg.data, null, 2)
								: String(msg.data);

						// Use stable ID based on index and a hash of content to maintain identity
						const contentHash = text
							.substring(0, 20)
							.replace(/[^a-zA-Z0-9]/g, "");

						return {
							id: `state_${agentId}_${index}_${contentHash}`,
							role: msg.type === "input" ? "user" : "assistant",
							parts: [{ type: "text", text }],
						};
					});

					setMessages(uiMessages);

					logger.debug("✅ Loaded state messages:", uiMessages.length);
				} else {
					logger.debug("⚠️ Failed to fetch state, starting with empty messages");

					setMessages([]);
				}
			} catch (error) {
				logger.debug("⚠️ Error fetching state:", error);

				setMessages([]);
			}
		},
		[baseUrl, apiKey, logger, applyThreadIdHeader, persistThreadIdFromResponse],
	);

	// Set initial agent selection
	useEffect(() => {
		if (agents && Object.keys(agents).length > 0 && !selectedAgent) {
			logger.debug("🔍 Available agents:", agents);

			// First, check for agent query parameter in URL
			const urlParams = new URLSearchParams(window.location.search);
			const agentFromUrl = urlParams.get("agent");

			logger.debug("🔗 Agent from URL query param:", agentFromUrl);

			// Try to find agent by URL param (matches agentId only)
			let agentToSelect: string | null = null;

			if (agentFromUrl) {
				const matchedAgent = Object.values(agents).find(
					(agent) => agent.metadata.agentId === agentFromUrl,
				);

				if (matchedAgent) {
					logger.debug(
						"✅ Found agent from URL param:",
						matchedAgent.metadata.name,
					);

					agentToSelect = matchedAgent.metadata.agentId;
				}
			}

			// If no URL param match, try localStorage
			if (!agentToSelect) {
				const savedAgentId = loadSelectedAgent();

				logger.debug("💾 Saved agent from localStorage:", savedAgentId);

				const savedAgent = savedAgentId
					? Object.values(agents).find(
							(agent) => agent.metadata.agentId === savedAgentId,
						)
					: null;

				if (savedAgent && savedAgentId) {
					logger.debug("✅ Restoring saved agent:", savedAgent.metadata.name);

					agentToSelect = savedAgentId;
				}
			}

			// Fallback to first agent alphabetically
			if (!agentToSelect) {
				const sortedAgents = Object.values(agents).sort((a, b) =>
					a.metadata.name.localeCompare(b.metadata.name),
				);

				const firstAgent = sortedAgents[0];

				logger.debug(
					"🎯 No saved agent found, using first agent (alphabetically):",
					firstAgent,
				);

				agentToSelect = firstAgent.metadata.agentId;
			}

			logger.debug("🆔 Setting selectedAgent to:", agentToSelect);

			setSelectedAgent(agentToSelect);
			saveSelectedAgent(agentToSelect);
			fetchAgentState(agentToSelect);
		}
	}, [
		agents,
		selectedAgent,
		loadSelectedAgent,
		saveSelectedAgent,
		logger,
		fetchAgentState,
	]);

	const submitMessage = async (
		value: string,
		_mode: "text" | "form" = "text",
	) => {
		if (!selectedAgent) return;

		logger.debug("🚀 Submitting message with selectedAgent:", selectedAgent);

		const selectedAgentData = agents
			? Object.values(agents).find(
					(agent) => agent.metadata.agentId === selectedAgent,
				)
			: undefined;

		logger.debug("📊 Found selectedAgentData:", selectedAgentData);

		const hasInputSchema = selectedAgentData?.schema?.input?.json;

		logger.debug("📝 hasInputSchema:", hasInputSchema, "value:", value);

		// Only require value for agents with input schemas
		if (hasInputSchema && !value.trim()) {
			logger.debug("❌ Returning early - hasInputSchema but no value");

			return;
		}

		logger.debug("✅ Validation passed, continuing with message submission...");

		// Add user message
		// Note: We also add a placeholder assistant message so only the last message
		// shows a loading state while the request is in-flight.
		const now = Date.now();
		const displayText = hasInputSchema
			? value
			: `Running ${selectedAgentData?.metadata.name || "agent"}...`;
		const userMessage: UIMessage = {
			id: now.toString(),
			role: "user",
			parts: [{ type: "text", text: displayText }],
		};
		const assistantMessageId = (now + 1).toString();
		const placeholderAssistantMessage: UIMessage = {
			id: assistantMessageId,
			role: "assistant",
			parts: [{ type: "text", text: "", state: "streaming" }],
		};

		setMessages((prev) => [...prev, userMessage, placeholderAssistantMessage]);
		setIsLoading(true);

		logger.debug("🔗 baseUrl:", baseUrl, "isBaseUrlNull:", isBaseUrlNull);

		if (!baseUrl || isBaseUrlNull) {
			logger.debug(
				"❌ Message submission blocked - baseUrl is null or missing",
			);

			const errorMessage: UIMessage = {
				id: assistantMessageId,
				role: "assistant",
				parts: [
					{
						type: "text",
						text: "Error: No base URL configured. Please configure a port in the workbench config.",
					},
				],
			};

			setMessages((prev) =>
				prev.map((m) => (m.id === assistantMessageId ? errorMessage : m)),
			);

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

			logger.debug("🌐 About to make API call...");

			// Call execution endpoint with timeout
			const headers: Record<string, string> = {
				"Content-Type": "application/json",
			};

			if (apiKey) {
				headers.Authorization = `Bearer ${apiKey}`;
			}

			applyThreadIdHeader(headers);

			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
			const startTime = performance.now();

			try {
				const requestPayload = {
					agentId: selectedAgent,
					input: parsedInput,
				};

				logger.debug("📤 API Request payload:", requestPayload);

				const response = await fetch(
					`${baseUrl}/_agentuity/workbench/execute`,
					{
						method: "POST",
						headers,
						body: JSON.stringify(requestPayload),
						signal: controller.signal,
						credentials: "include",
					},
				);

				persistThreadIdFromResponse(response);
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

				let responseBody: unknown;

				try {
					responseBody = await response.json();
				} catch (jsonError) {
					throw new Error(`Invalid JSON response from server: ${jsonError}`);
				}

				const endTime = performance.now();
				const clientDuration = ((endTime - startTime) / 1000).toFixed(1); // Duration in seconds

				// Extract duration from response header, fallback to client-side timing
				const durationHeader = response.headers.get("x-agentuity-duration");
				const duration = durationHeader || `${clientDuration}s`;

				// Extract token count from response header
				const tokensHeader = response.headers.get("x-agentuity-tokens");
				const tokensRecord = tokensHeader
					? parseTokensHeader(tokensHeader)
					: undefined;
				const totalTokens = tokensRecord
					? getTotalTokens(tokensRecord)
					: undefined;

				// Handle wrapped response shape: { success, data?, error? }
				const envelope =
					typeof responseBody === "object" && responseBody !== null
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

				if (
					envelope &&
					"success" in envelope &&
					envelope.success === false &&
					envelope.error
				) {
					// Agent execution error - encode as special JSON format for ErrorBubble
					const errorPayload = JSON.stringify({
						__agentError: true,
						message: envelope.error.message || "Unknown error",
						stack: envelope.error.stack,
						code: envelope.error.code,
						cause: envelope.error.cause,
					});

					const errorMessage: UIMessage = {
						id: assistantMessageId,
						role: "assistant",
						parts: [{ type: "text", text: errorPayload }],
					};

					setMessages((prev) =>
						prev.map((m) => (m.id === assistantMessageId ? errorMessage : m)),
					);
					return;
				}

				// Success - extract data from envelope (or use raw response if not wrapped)
				const result =
					envelope && "success" in envelope && envelope.success === true
						? envelope.data
						: responseBody;

				// Format result as JSON string for display
				const resultText =
					typeof result === "object"
						? JSON.stringify(result, null, 2)
						: String(result);

				const sessionId = response.headers.get("x-session-id") || undefined;

				const assistantMessage: UIMessage & {
					tokens?: string;
					duration?: string;
					sessionId?: string;
				} = {
					id: assistantMessageId,
					role: "assistant",
					parts: [{ type: "text", text: resultText }],
					tokens: totalTokens?.toString(),
					duration,
					sessionId,
				};

				setMessages((prev) =>
					prev.map((m) => (m.id === assistantMessageId ? assistantMessage : m)),
				);
			} catch (fetchError) {
				clearTimeout(timeoutId);

				throw fetchError;
			}
		} catch (error) {
			console.error("Failed to submit message:", error);

			const errorText =
				error instanceof Error
					? error.name === "AbortError"
						? "Request timed out. Please try again."
						: error.message
					: "Sorry, I encountered an error processing your message.";

			const errorMessage: UIMessage = {
				id: assistantMessageId,
				role: "assistant",
				parts: [
					{
						type: "text",
						text: errorText,
					},
				],
			};

			setMessages((prev) =>
				prev.map((m) => (m.id === assistantMessageId ? errorMessage : m)),
			);
		} finally {
			setIsLoading(false);
		}
	};

	const generateSample = async (agentId: string): Promise<string> => {
		if (!baseUrl || isBaseUrlNull) {
			throw new Error("Base URL not configured");
		}

		setIsGeneratingSample(true);

		try {
			const url = `${baseUrl}/_agentuity/workbench/sample?agentId=${encodeURIComponent(agentId)}`;
			const headers: HeadersInit = {
				"Content-Type": "application/json",
			};

			if (apiKey) {
				headers.Authorization = `Bearer ${apiKey}`;
			}

			// Keep thread id stable across workbench endpoints.
			if (typeof headers === "object" && headers && !Array.isArray(headers)) {
				applyThreadIdHeader(headers as Record<string, string>);
			}

			const response = await fetch(url, {
				method: "GET",
				headers,
				credentials: "include",
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
			logger.error("Failed to generate sample JSON:", error);

			throw error;
		} finally {
			setIsGeneratingSample(false);
		}
	};

	const handleAgentSelect = async (agentId: string) => {
		logger.debug("🔄 handleAgentSelect called with:", agentId);

		setSelectedAgent(agentId);
		// Save selection to localStorage for persistence across sessions
		saveSelectedAgent(agentId);
		// Fetch state for the selected agent
		await fetchAgentState(agentId);
	};

	const clearAgentState = useCallback(
		async (agentId: string) => {
			if (!baseUrl) {
				return;
			}

			try {
				const headers: Record<string, string> = {};

				if (apiKey) {
					headers.Authorization = `Bearer ${apiKey}`;
				}

				applyThreadIdHeader(headers);

				const url = `${baseUrl}/_agentuity/workbench/state?agentId=${encodeURIComponent(agentId)}`;
				const response = await fetch(url, {
					method: "DELETE",
					headers,
					credentials: "include",
				});

				persistThreadIdFromResponse(response);

				if (response.ok) {
					setMessages([]);

					logger.debug("✅ Cleared state for agent:", agentId);
				} else {
					logger.debug("⚠️ Failed to clear state");
				}
			} catch (error) {
				logger.debug("⚠️ Error clearing state:", error);
			}
		},
		[baseUrl, apiKey, logger, applyThreadIdHeader, persistThreadIdFromResponse],
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

	return (
		<WorkbenchContext.Provider value={contextValue}>
			{children}
		</WorkbenchContext.Provider>
	);
}
