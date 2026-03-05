/**
 * Remote Session Bridge — TUI ↔ Hub ↔ Sandbox
 *
 * Handles the WebSocket connection and RPC protocol bridge for remote mode.
 * In remote mode, the local Pi TUI connects to an existing sandbox session
 * through the Hub, acting as a thin client:
 *   - User input → rpc_command → Hub → sandbox
 *   - Sandbox events → rpc_event → Hub → TUI rendering
 *   - Extension UI dialogs → rpc_ui_request/response → Hub ↔ TUI
 *
 * This module manages the connection lifecycle and provides an API
 * for the extension to send commands and receive events.
 */

import type { ExtensionAPI, ExtensionContext } from '@mariozechner/pi-coding-agent';

const DEBUG = !!process.env['AGENTUITY_DEBUG'];

function log(msg: string): void {
	if (DEBUG) console.error(`[remote-session] ${msg}`);
}

// ── RPC Message Types (mirrors hub-protocol.ts) ──

export interface RpcCommand {
	type: string;
	[key: string]: unknown;
}

export interface RpcEvent {
	type: string;
	[key: string]: unknown;
}

export interface RpcUiRequest {
	id: string;
	method: string;
	params: Record<string, unknown>;
}

/** RPC response from sandbox (correlated by id) */
export interface RpcResponse {
	type: 'response';
	id: string;
	command: string;
	success: boolean;
	data?: unknown;
	error?: string;
}

export type RemoteEventHandler = (event: RpcEvent) => void;
export type RemoteResponseHandler = (response: RpcResponse) => void;
export type RemoteUiHandler = (request: RpcUiRequest) => Promise<unknown>;
export type RemoteConnectionHandler = (state: 'connected' | 'reconnecting' | 'disconnected') => void;

// ── Remote Session Client ──

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const MAX_RECONNECT_ATTEMPTS = 20;

export class RemoteSession {
	private ws: WebSocket | null = null;
	private connected = false;
	private intentionallyClosed = false;
	private hubWsUrl: string = '';
	private reconnectAttempts = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private eventHandlers: RemoteEventHandler[] = [];
	private uiHandler: RemoteUiHandler | null = null;
	private responseHandlers: RemoteResponseHandler[] = [];
	private connectionHandlers: RemoteConnectionHandler[] = [];

	/** Session ID this client is connected to */
	public sessionId: string;
	/** Session label (populated after connection) */
	public label: string = '';

	constructor(sessionId: string) {
		this.sessionId = sessionId;
	}

	private dispatchEvent(event: RpcEvent): void {
		for (const handler of this.eventHandlers) {
			try { handler(event); } catch (err) {
				log(`Event handler error: ${err instanceof Error ? err.message : String(err)}`);
			}
		}
	}

	private dispatchResponse(response: RpcResponse): void {
		for (const handler of this.responseHandlers) {
			try { handler(response); } catch (err) {
				log(`Response handler error: ${err instanceof Error ? err.message : String(err)}`);
			}
		}
	}

	/** Register a handler for RPC events from the sandbox */
	onEvent(handler: RemoteEventHandler): void {
		this.eventHandlers.push(handler);
	}

	/** Register a handler for RPC responses from the sandbox */
	onResponse(handler: RemoteResponseHandler): void {
		this.responseHandlers.push(handler);
	}

	/** Register the UI dialog handler (select, confirm, input, editor) */
	setUiHandler(handler: RemoteUiHandler): void {
		this.uiHandler = handler;
	}

	/** Register a connection state change handler */
	onConnectionChange(handler: RemoteConnectionHandler): void {
		this.connectionHandlers.push(handler);
	}

	/** Connect to the Hub WebSocket as a controller for the remote session */
	async connect(hubWsUrl: string): Promise<void> {
		this.hubWsUrl = hubWsUrl;
		this.intentionallyClosed = false;
		this.reconnectAttempts = 0;
		return this.doConnect();
	}

	private doConnect(): Promise<void> {
		return new Promise((resolve, reject) => {
			const isReconnect = this.reconnectAttempts > 0;

			// Build URL with controller params
			const url = new URL(this.hubWsUrl);
			url.searchParams.set('sessionId', this.sessionId);
			url.searchParams.set('role', 'controller');

			log(`${isReconnect ? 'Reconnecting' : 'Connecting'} to ${url.toString()}`);
			this.ws = new WebSocket(url.toString());

			const connectTimeout = setTimeout(() => {
				reject(new Error('Remote session connection timed out'));
				this.ws?.close();
			}, 30_000);

			this.ws.onopen = () => {
				log('WebSocket connected');
			};

			this.ws.onmessage = (event: MessageEvent) => {
				let data: Record<string, unknown>;
				try {
					const raw = typeof event.data === 'string'
						? event.data
						: new TextDecoder().decode(event.data as ArrayBuffer);
					data = JSON.parse(raw) as Record<string, unknown>;
				} catch {
					return;
				}

				const type = data.type as string;

				// Init message — connection established
				if (type === 'init') {
					clearTimeout(connectTimeout);
					this.connected = true;
					this.reconnectAttempts = 0;
					if (data.sessionId) this.sessionId = data.sessionId as string;
					log(`Connected to session ${this.sessionId}`);
					this.notifyConnectionChange('connected');
					resolve();
					return;
				}

				// Connection rejected
				if (type === 'connection_rejected') {
					clearTimeout(connectTimeout);
					const msg = (data.message as string) || 'Connection rejected';
					reject(new Error(msg));
					return;
				}

				// Broadcast-wrapped messages from Hub (LIVE events)
				// Format: { type: 'broadcast', event: '<name>', data: { ...payload } }
				if (type === 'broadcast') {
					const broadcastEvent = data.event as string;
					const broadcastData = data.data as Record<string, unknown> ?? {};
					if (broadcastEvent === 'rpc_event') {
						const rpcEvent = broadcastData.event as RpcEvent;
						if (rpcEvent) this.dispatchEvent({ ...rpcEvent, _source: 'live' } as RpcEvent);
					} else if (broadcastEvent === 'rpc_response') {
						const response = broadcastData.response as RpcResponse;
						if (response) this.dispatchResponse(response);
					} else if (broadcastEvent === 'rpc_ui_request') {
						this.handleUiRequest({
							id: broadcastData.id as string,
							method: broadcastData.method as string,
							params: (broadcastData.params as Record<string, unknown>) ?? {},
						});
					} else {
						// Lifecycle event broadcasts (agent_start, message_end, turn_start, etc.)
						// The broadcastData IS the event payload with a `type` field matching broadcastEvent.
						// Dispatch as a regular event so the TUI can render agent activity.
						this.dispatchEvent({ type: broadcastEvent, ...broadcastData, _source: 'live' } as RpcEvent);
					}
					return;
				}

				// Raw RPC messages (from Durable Stream replay — historical, not live)
				if (type === 'rpc_event') {
					const rpcEvent = data.event as RpcEvent;
					if (rpcEvent) this.dispatchEvent({ ...rpcEvent, _source: 'replay' } as RpcEvent);
					return;
				}

				if (type === 'rpc_response') {
					const response = data.response as RpcResponse;
					if (response) this.dispatchResponse(response);
					return;
				}

				if (type === 'rpc_ui_request') {
					this.handleUiRequest({
						id: data.id as string,
						method: data.method as string,
						params: (data.params as Record<string, unknown>) ?? {},
					});
					return;
				}

				// Session hydration (conversation entries + task states from observer hydration)
				if (type === 'session_hydration') {
					// Pass through as an event so the extension can render it
					for (const handler of this.eventHandlers) {
						try { handler({ type: 'session_hydration', ...data }); } catch (err) {
							log(`Hydration handler error: ${err instanceof Error ? err.message : String(err)}`);
						}
					}
					return;
				}

				log(`Unhandled message type: ${type}`);
			};

			this.ws.onerror = (err: Event) => {
				clearTimeout(connectTimeout);
				if (!this.connected) {
					const message = 'message' in err
						? (err as ErrorEvent).message
						: 'WebSocket error';
					reject(new Error(message));
				}
			};

			this.ws.onclose = () => {
				clearTimeout(connectTimeout);
				const wasConnected = this.connected;
				this.connected = false;
				if (!this.intentionallyClosed) {
					if (wasConnected) {
						log('WebSocket closed unexpectedly — scheduling reconnect');
						this.notifyConnectionChange('reconnecting');
						this.scheduleReconnect();
					} else if (!isReconnect) {
						// Failed initial connect and not already in reconnect loop
						log('WebSocket closed during initial connect');
					}
				}
			};
		});
	}

	private scheduleReconnect(): void {
		if (this.intentionallyClosed) return;
		if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
			log(`Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached — giving up`);
			this.notifyConnectionChange('disconnected');
			return;
		}

		const delay = Math.min(
			RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempts),
			RECONNECT_MAX_MS,
		);
		this.reconnectAttempts++;
		log(`Reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);

		this.reconnectTimer = setTimeout(async () => {
			this.reconnectTimer = null;
			try {
				await this.doConnect();
				// On successful reconnect, request fresh state
				this.getState();
			} catch (err) {
				log(`Reconnect failed: ${err instanceof Error ? err.message : String(err)}`);
				this.scheduleReconnect();
			}
		}, delay);
	}

	private notifyConnectionChange(state: 'connected' | 'reconnecting' | 'disconnected'): void {
		for (const handler of this.connectionHandlers) {
			try { handler(state); } catch { /* ignore */ }
		}
	}

	/** Send an RPC command to the sandbox (prompt, steer, abort, etc.) */
	sendCommand(command: RpcCommand): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			log('Cannot send command — not connected');
			return;
		}
		this.ws.send(JSON.stringify({
			type: 'rpc_command',
			command,
		}));
	}

	/** Send a user prompt to the remote sandbox */
	prompt(message: string, images?: string[]): void {
		this.sendCommand({
			type: 'prompt',
			message,
			...(images?.length ? { images } : {}),
		});
	}

	/** Steer the agent mid-turn */
	steer(message: string): void {
		this.sendCommand({ type: 'steer', message });
	}

	/** Abort current operation */
	abort(): void {
		this.sendCommand({ type: 'abort' });
	}

	/** Get current session state */
	getState(): void {
		this.sendCommand({ type: 'get_state', id: crypto.randomUUID() });
	}

	/** Get all messages in current session */
	getMessages(): void {
		this.sendCommand({ type: 'get_messages', id: crypto.randomUUID() });
	}

	/** Compact the session context */
	compact(): void {
		this.sendCommand({ type: 'compact' });
	}

	/** Close the connection */
	close(): void {
		this.intentionallyClosed = true;
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		this.ws?.close();
		this.ws = null;
	}

	get isConnected(): boolean {
		return this.connected;
	}

	/** Handle UI request from sandbox — delegate to registered handler */
	private async handleUiRequest(request: RpcUiRequest): Promise<void> {
		if (!this.uiHandler) {
			log(`No UI handler for ${request.method} — sending null response`);
			this.sendUiResponse(request.id, null);
			return;
		}

		try {
			const result = await this.uiHandler(request);
			this.sendUiResponse(request.id, result);
		} catch (err) {
			log(`UI handler error for ${request.method}: ${err instanceof Error ? err.message : String(err)}`);
			this.sendUiResponse(request.id, null);
		}
	}

	/** Send UI response back to sandbox */
	private sendUiResponse(id: string, result: unknown): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
		this.ws.send(JSON.stringify({
			type: 'rpc_ui_response',
			id,
			result,
		}));
	}
}

/**
 * Set up remote mode for the Pi extension.
 *
 * Connects to an existing sandbox session through the Hub and bridges
 * user input → RPC commands and sandbox events → TUI rendering.
 *
 * Uses Pi's extension APIs for rich rendering:
 * - pi.sendMessage() for completed assistant messages
 * - ctx.ui.setWidget() for streaming output
 * - ctx.ui.setWorkingMessage() for tool execution status
 * - ctx.ui.setStatus() for connection and agent state
 */
export async function setupRemoteMode(
	pi: ExtensionAPI,
	hubWsUrl: string,
	sessionId: string,
): Promise<RemoteSession> {
	const remote = new RemoteSession(sessionId);

	// Connect to Hub
	await remote.connect(hubWsUrl);
	log(`Remote mode active — session ${sessionId}`);

	// ── Track streaming state for widget rendering ──
	let messageBuffer = '';
	let thinkingBuffer = '';
	let isStreaming = false;
	let currentTool: string | null = null;
	let extensionCtxRef: ExtensionContext | null = null;

	// Called by the extension setup to provide the rendering context
	(remote as RemoteSessionInternal)._setExtensionCtx = (ctx: ExtensionContext) => {
		extensionCtxRef = ctx;
	};

	// ── Render streaming output as a widget ──
	function updateStreamWidget(): void {
		if (!extensionCtxRef?.hasUI) return;
		if (!isStreaming && !messageBuffer) return;

		// Show the most recent streaming text in a widget
		const display = messageBuffer.length > 2000
			? `...${messageBuffer.slice(-2000)}`
			: messageBuffer;

		if (display) {
			extensionCtxRef.ui.setWidget('remote_stream', display.split('\n'));
		}
	}

	function clearStreamWidget(): void {
		if (!extensionCtxRef?.hasUI) return;
		extensionCtxRef.ui.setWidget('remote_stream', undefined);
	}

	// ── Set up UI handler (wired to Pi's UI later in setupRemoteModeExtension) ──
	// Default handler — overridden by setupRemoteModeExtension once ctx is available
	remote.setUiHandler(async (request) => {
		log(`UI request: ${request.method} (${request.id}) — no ctx yet`);
		const fireAndForget = ['notify', 'setStatus', 'setWidget', 'setTitle', 'set_editor_text'];
		if (fireAndForget.includes(request.method)) return undefined;
		return null;
	});

	// ── Handle RPC responses (get_state, get_messages results) ──
	remote.onResponse((response) => {
		if (!response.success) {
			log(`RPC response error for ${response.command}: ${response.error ?? 'unknown'}`);
			return;
		}

		switch (response.command) {
			case 'get_state': {
				const state = response.data as {
					isStreaming?: boolean;
					isWaitingForInput?: boolean;
					sessionName?: string;
				} | undefined;
				if (state) {
					isStreaming = !!state.isStreaming;
					if (extensionCtxRef?.hasUI) {
						if (state.isStreaming) {
							extensionCtxRef.ui.setStatus('remote_activity', 'agent working...');
						} else if (state.isWaitingForInput) {
							extensionCtxRef.ui.setStatus('remote_activity', 'waiting for input');
						} else {
							extensionCtxRef.ui.setStatus('remote_activity', 'idle');
						}
					}
					log(`State hydrated: streaming=${state.isStreaming}, waiting=${state.isWaitingForInput}`);
				}
				break;
			}

			case 'get_messages': {
				const messages = response.data as Array<{
					role: string;
					content?: string | Array<{ type: string; text?: string }>;
					timestamp?: number;
				}> | undefined;
				if (messages?.length) {
					hydrateMessages(messages);
				}
				break;
			}
		}
	});

	// ── Hydrate message history into the TUI ──
	function hydrateMessages(messages: Array<{
		role: string;
		content?: string | Array<{ type: string; text?: string }>;
		timestamp?: number;
	}>): void {
		// Show the last few messages as custom messages in the TUI
		const recent = messages.slice(-20);
		let hydrated = 0;

		for (const msg of recent) {
			const text = typeof msg.content === 'string'
				? msg.content
				: Array.isArray(msg.content)
					? msg.content
						.filter((c): c is { type: string; text: string } => c.type === 'text' && typeof c.text === 'string')
						.map((c) => c.text)
						.join('\n')
					: '';

			if (!text) continue;

			const role = msg.role === 'assistant' ? 'assistant' : 'user';
			pi.sendMessage({
				customType: 'remote_history',
				content: text,
				display: true,
				details: { role, timestamp: msg.timestamp, hydrated: true },
			});
			hydrated++;
		}

		log(`Hydrated ${hydrated} messages from history`);
	}

	// ── Handle RPC events for rendering ──
	remote.onEvent((event) => {
		const eventType = event.type as string;

		switch (eventType) {
			case 'message_start':
				messageBuffer = '';
				thinkingBuffer = '';
				isStreaming = true;
				if (extensionCtxRef?.hasUI) {
					extensionCtxRef.ui.setWorkingMessage('Responding...');
				}
				break;

			case 'message_update': {
				const delta = (event as { text?: string }).text ?? '';
				messageBuffer += delta;
				updateStreamWidget();
				break;
			}

			case 'message_end': {
				isStreaming = false;
				clearStreamWidget();
				if (extensionCtxRef?.hasUI) {
					extensionCtxRef.ui.setWorkingMessage();
				}

				// Extract content — prefer streamed buffer, fall back to message_end payload
				let finalContent = messageBuffer.trim();
				if (!finalContent) {
					// Lifecycle broadcasts include full message in the event payload
					const msg = (event as Record<string, unknown>).message as Record<string, unknown> | undefined;
					if (msg) {
						const content = msg.content;
						if (typeof content === 'string') {
							finalContent = content.trim();
						} else if (Array.isArray(content)) {
							finalContent = content
								.filter((c: unknown): c is { type: string; text: string } =>
									!!c && typeof c === 'object' && (c as Record<string, unknown>).type === 'text' && typeof (c as Record<string, unknown>).text === 'string')
								.map((c) => c.text)
								.join('\n')
								.trim();
						}
					}
				}

				// Only display assistant messages (skip user message echoes)
				const msgRole = ((event as Record<string, unknown>).message as Record<string, unknown> | undefined)?.role as string | undefined;
				if (finalContent && msgRole !== 'user') {
					pi.sendMessage({
						customType: 'remote_message',
						content: finalContent,
						display: true,
						details: { role: 'assistant' },
					});
				}
				messageBuffer = '';
				log(`Message complete`);
				break;
			}

			case 'thinking_start':
				thinkingBuffer = '';
				break;

			case 'thinking_update': {
				const delta = (event as { text?: string }).text ?? '';
				thinkingBuffer += delta;
				break;
			}

			case 'thinking_end':
				// Thinking is internal — just log it
				if (thinkingBuffer) {
					log(`Thinking complete (${thinkingBuffer.length} chars)`);
				}
				thinkingBuffer = '';
				break;

			case 'agent_start': {
				const agent = (event as { agentName?: string }).agentName ?? 'agent';
				if (extensionCtxRef?.hasUI) {
					extensionCtxRef.ui.setStatus('remote_activity', `${agent} working...`);
				}
				log(`Agent started: ${agent}`);
				break;
			}

			case 'agent_end':
				if (extensionCtxRef?.hasUI) {
					extensionCtxRef.ui.setStatus('remote_activity', 'idle');
				}
				clearStreamWidget();
				log(`Agent ended`);
				break;

			case 'tool_execution_start': {
				const tool = (event as { toolName?: string }).toolName ?? 'tool';
				currentTool = tool;
				if (extensionCtxRef?.hasUI) {
					extensionCtxRef.ui.setWorkingMessage(`Running ${tool}...`);
					extensionCtxRef.ui.setStatus('remote_activity', `Running ${tool}...`);
				}
				log(`Tool: ${tool}`);
				break;
			}

			case 'tool_execution_end': {
				const tool = (event as { toolName?: string }).toolName ?? currentTool ?? 'tool';
				currentTool = null;
				if (extensionCtxRef?.hasUI) {
					extensionCtxRef.ui.setWorkingMessage();
					extensionCtxRef.ui.setStatus('remote_activity', 'agent working...');
				}
				log(`Tool done: ${tool}`);
				break;
			}

			case 'turn_start':
				if (extensionCtxRef?.hasUI) {
					extensionCtxRef.ui.setStatus('remote_activity', 'agent working...');
				}
				log('Turn started');
				break;

			case 'turn_end':
				if (extensionCtxRef?.hasUI) {
					extensionCtxRef.ui.setStatus('remote_activity', 'idle');
					extensionCtxRef.ui.setWorkingMessage();
				}
				clearStreamWidget();
				log('Turn ended');
				break;

			case 'session_hydration': {
				// Hydrate conversation history from Hub
				const entries = (event as Record<string, unknown>).entries as Array<{
					type: string;
					content?: string;
					agent?: string;
					timestamp?: number;
				}> | undefined;
				if (entries?.length) {
					let hydrated = 0;
					for (const entry of entries.slice(-30)) {
						if (!entry.content) continue;
						const role = entry.type === 'message' ? 'assistant' : 'user';
						pi.sendMessage({
							customType: 'remote_history',
							content: entry.content,
							display: true,
							details: { role, timestamp: entry.timestamp, hydrated: true },
						});
						hydrated++;
					}
					log(`Hydrated ${hydrated} entries from session_hydration`);
				} else {
					log('Received session_hydration with no entries');
				}
				break;
			}

			case 'auto_compaction_start':
				if (extensionCtxRef?.hasUI) {
					extensionCtxRef.ui.setWorkingMessage('Compacting context...');
				}
				break;

			case 'auto_compaction_end':
				if (extensionCtxRef?.hasUI) {
					extensionCtxRef.ui.setWorkingMessage();
				}
				break;
		}
	});

	// ── Connection state handling ──
	remote.onConnectionChange((state) => {
		if (!extensionCtxRef?.hasUI) return;
		switch (state) {
			case 'connected':
				extensionCtxRef.ui.setStatus('remote_connection', `Remote: ${sessionId.slice(0, 16)}...`);
				break;
			case 'reconnecting':
				extensionCtxRef.ui.setStatus('remote_connection', 'Reconnecting...');
				extensionCtxRef.ui.setWorkingMessage('Connection lost — reconnecting...');
				break;
			case 'disconnected':
				extensionCtxRef.ui.setStatus('remote_connection', 'Disconnected');
				extensionCtxRef.ui.setWorkingMessage('Connection lost');
				break;
		}
	});

	// Request initial state from the sandbox
	remote.getState();
	remote.getMessages();

	return remote;
}

/** Internal interface for passing extension context to RemoteSession */
export interface RemoteSessionInternal extends RemoteSession {
	_setExtensionCtx?: (ctx: ExtensionContext) => void;
}
