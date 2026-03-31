import type {
	AgentToolResult,
	ExtensionAPI,
	ExtensionContext,
	ExtensionCommandContext,
	ToolDefinition,
} from '@mariozechner/pi-coding-agent';
import { Type, type TSchema } from '@sinclair/typebox';
import { createRequire } from 'node:module';
import { HubClient } from './client.ts';
import type { ConnectionState } from './client.ts';
import { processActions } from './handlers.ts';
import { getToolRenderers } from './renderers.ts';
import { setupCoderFooter, type ObserverState } from './footer.ts';
import { setupTitlebar } from './titlebar.ts';
import { registerAgentCommands } from './commands.ts';
import { AgentManagerOverlay } from './overlay.ts';
import { ChainEditorOverlay, type ChainResult } from './chain-preview.ts';
import { HubOverlay } from './hub-overlay.ts';
import { OutputViewerOverlay, type StoredResult } from './output-viewer.ts';
import { setNativeRemoteExtensionContext } from './native-remote-ui-context.ts';
import { handleRemoteUiRequest } from './remote-ui-handler.ts';
import type {
	HubAction,
	HubResponse,
	InitMessage,
	HubConfig,
	HubToolDefinition,
	AgentDefinition,
	AgentProgressUpdate,
} from './protocol.ts';
import {
	setupRemoteMode,
	type RemoteSession,
	type RemoteSessionInternal,
} from './remote-session.ts';

// ESM doesn't have require() — create one for synchronous child_process access
const _require = createRequire(import.meta.url);

const HUB_URL_ENV = 'AGENTUITY_CODER_HUB_URL';
const AGENT_ENV = 'AGENTUITY_CODER_AGENT';
const REMOTE_SESSION_ENV = 'AGENTUITY_CODER_REMOTE_SESSION';
const NATIVE_REMOTE_ENV = 'AGENTUITY_CODER_NATIVE_REMOTE';
// TODO: Remove/Change when we get Agentuity service level auth enabled, this is just temporary
const API_KEY_ENV = 'AGENTUITY_CODER_API_KEY';
const API_KEY_HEADER = 'x-agentuity-auth-api-key';
const RECONNECT_WAIT_TIMEOUT_MS = 120_000;

type HubUiStatus = 'connected' | 'reconnecting' | 'offline';

// Recent agent results for full-screen viewer (Ctrl+Shift+V / Alt+Shift+V)
const recentResults: StoredResult[] = [];
const MAX_STORED_RESULTS = 20;

function startStreamingResult(
	agentName: string,
	description?: string,
	prompt?: string
): StoredResult {
	const result: StoredResult = {
		agentName,
		text: '',
		thinking: '',
		timestamp: Date.now(),
		isStreaming: true,
		description,
		prompt,
	};
	recentResults.unshift(result);
	if (recentResults.length > MAX_STORED_RESULTS) recentResults.pop();
	return result;
}

// ══════════════════════════════════════════════
// Sub-Agent Output Limits (prevents context bloat in parent)
// Inspired by pi-subagents (200KB/5K lines) and oh-my-pi (500KB/5K lines)
// ══════════════════════════════════════════════
const MAX_OUTPUT_BYTES = 200_000;
const MAX_OUTPUT_LINES = 5_000;

// All Pi events we subscribe to
const PROXY_EVENTS = [
	'session_shutdown',
	'session_before_switch',
	'session_switch',
	'session_before_fork',
	'session_fork',
	'session_before_compact',
	'session_compact',
	'before_agent_start',
	'agent_start',
	'agent_end',
	'turn_start',
	'turn_end',
	'tool_call',
	'tool_result',
	'tool_execution_start',
	'tool_execution_update',
	'tool_execution_end',
	'message_start',
	'message_update',
	'message_end',
	'input',
	'model_select',
	'context',
] as const;

type GenericEventHandler = (
	event: string,
	handler: (event: unknown, ctx: ExtensionContext) => Promise<unknown>
) => void;

const DEBUG = !!process.env['AGENTUITY_DEBUG'];

function log(msg: string): void {
	if (DEBUG) console.error(`[agentuity-coder] ${msg}`);
}

/** Build headers object with API key if available. Merges with any existing headers. */
// TODO: Remove/Change when we get Agentuity service level auth enabled, this is just temporary
function authHeaders(extra?: Record<string, string>): Record<string, string> {
	const apiKey = process.env[API_KEY_ENV];
	const headers: Record<string, string> = { ...extra };
	if (apiKey) headers[API_KEY_HEADER] = apiKey;
	return headers;
}

// ══════════════════════════════════════════════
// Synchronous Bootstrap — fetch InitMessage from Hub REST endpoint
// This runs BEFORE tool registration so we know what tools/agents
// the server actually provides. No hardcoded schemas.
// ══════════════════════════════════════════════

function buildInitUrl(hubUrl: string, agentRole?: string): string {
	let httpUrl = hubUrl.replace(/^ws:\/\//, 'http://').replace(/^wss:\/\//, 'https://');

	if (httpUrl.includes('/api/ws')) {
		httpUrl = httpUrl.replace('/api/ws', '/api/hub/init');
	} else if (/\/ws\b/.test(httpUrl)) {
		httpUrl = httpUrl.replace(/\/ws\b/, '/api/hub/init');
	} else {
		httpUrl = httpUrl.replace(/\/?$/, '/api/hub/init');
	}

	if (agentRole && agentRole !== 'lead') {
		httpUrl += `?agent=${encodeURIComponent(agentRole)}`;
	}

	return httpUrl;
}

function getHubHttpBaseUrl(hubUrl: string): string {
	let httpUrl = hubUrl.replace(/^ws:\/\//, 'http://').replace(/^wss:\/\//, 'https://');
	httpUrl = httpUrl.replace(/\/api\/ws\b.*$/, '');
	httpUrl = httpUrl.replace(/\/ws\b.*$/, '');
	return httpUrl.replace(/\/+$/, '');
}

/**
 * Synchronously fetch the InitMessage from Hub's REST endpoint.
 *
 * Uses `curl` via `execFileSync` because Pi's extension registration is synchronous —
 * we need tools/agents BEFORE the extension returns. Node's `fetch()` is async-only,
 * and `Bun.spawnSync` isn't available in Pi's Node.js runtime.
 *
 * Requires `curl` binary (available on macOS, Linux, Windows 10+).
 */
function fetchInitMessageSync(hubUrl: string, agentRole?: string): InitMessage | null {
	const httpUrl = buildInitUrl(hubUrl, agentRole);

	try {
		const { execFileSync } = _require(
			'node:child_process'
		) as typeof import('node:child_process');
		const apiKey = process.env[API_KEY_ENV];
		const curlArgs = ['-s', '--connect-timeout', '3', '--max-time', '5'];
		// TODO: Remove/Change when we get Agentuity service level auth enabled, this is just temporary
		if (apiKey) curlArgs.push('-H', `${API_KEY_HEADER}: ${apiKey}`);
		curlArgs.push(httpUrl);
		const result = execFileSync('curl', curlArgs, { encoding: 'utf-8' });

		const parsed = JSON.parse(result);
		if (parsed && parsed.type === 'init') {
			return parsed as InitMessage;
		}
		return null;
	} catch {
		return null;
	}
}

/**
 * Fetch session snapshot from Hub REST endpoint.
 * Extracts observer count and session label for the footer display.
 * Best-effort, non-blocking — failures are silently ignored.
 */
async function fetchSessionSnapshot(
	hubUrl: string,
	sessionId?: string | null,
	observerState?: ObserverState
): Promise<void> {
	const baseUrl = getHubHttpBaseUrl(hubUrl);
	const httpUrl = sessionId
		? `${baseUrl}/api/hub/session/${encodeURIComponent(sessionId)}`
		: `${baseUrl}/api/hub/sessions`;

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 5_000);

	try {
		const response = await fetch(httpUrl, {
			signal: controller.signal,
			headers: authHeaders({ accept: 'application/json' }),
		});
		if (!response.ok) return;

		if (sessionId) {
			const snapshot = (await response.json()) as {
				label?: string;
				participants?: Array<{ role?: string }>;
			};
			if (observerState) {
				if (snapshot.label) observerState.label = snapshot.label;
				if (Array.isArray(snapshot.participants)) {
					observerState.count = snapshot.participants.filter(
						(p) => p.role === 'observer'
					).length;
				}
			}
			return;
		}

		const data = (await response.json()) as {
			sessions?: {
				websocket?: Array<{
					label?: string;
					observerCount?: number;
				}>;
			};
		};
		const first = data.sessions?.websocket?.[0];
		if (first && observerState) {
			if (first.label) observerState.label = first.label;
			if (typeof first.observerCount === 'number') observerState.count = first.observerCount;
		}
	} catch {
		// Ignore — best effort
	} finally {
		clearTimeout(timeout);
	}
}

async function fetchInitMessage(hubUrl: string, agentRole?: string): Promise<InitMessage | null> {
	const httpUrl = buildInitUrl(hubUrl, agentRole);
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 5_000);

	try {
		const response = await fetch(httpUrl, {
			signal: controller.signal,
			headers: authHeaders({ accept: 'application/json' }),
		});

		if (!response.ok) return null;

		const parsed = (await response.json()) as Record<string, unknown>;
		if (parsed.type === 'init') {
			return parsed as unknown as InitMessage;
		}
		return null;
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

export function agentuityCoderHub(pi: ExtensionAPI) {
	const hubUrl = process.env[HUB_URL_ENV];
	if (!hubUrl) return;

	// ── Remote mode detection ──
	// If AGENTUITY_CODER_REMOTE_SESSION is set, the TUI connects as a controller
	// to an existing sandbox session. The full UI is set up (tools, commands, /hub)
	// but user input is relayed to the remote sandbox instead of the local Pi agent.
	const remoteSessionId = process.env[REMOTE_SESSION_ENV] || null;
	const isNativeRemote = !!process.env[NATIVE_REMOTE_ENV];
	if (remoteSessionId) {
		log(`Remote mode: will connect as controller to session ${remoteSessionId}`);
	}

	const isSubAgent = !!process.env[AGENT_ENV];
	const agentRole = process.env[AGENT_ENV] || 'lead';

	log(`Hub URL: ${hubUrl} (role: ${agentRole})`);

	// ══════════════════════════════════════════════
	// Fetch InitMessage from Hub REST endpoint (synchronous)
	// This is how we discover what tools/agents the server provides.
	// ══════════════════════════════════════════════

	const initMsg = fetchInitMessageSync(hubUrl, agentRole);

	if (!initMsg) {
		log('Hub not reachable — no tools or agents registered');
		log('Make sure the Hub server is running');
		return;
	}

	const serverTools = initMsg.tools || [];
	const serverAgents = initMsg.agents || [];
	let hubConfig: HubConfig | undefined = initMsg.config;
	const openChainEditor = async (
		ctx: ExtensionContext | ExtensionCommandContext,
		initialAgents: string[] = []
	): Promise<void> => {
		if (!ctx.hasUI) return;

		const result = await ctx.ui.custom<ChainResult | undefined>(
			(_tui, theme, _keybindings, done) =>
				new ChainEditorOverlay(theme, serverAgents, done, initialAgents),
			{
				overlay: true,
				overlayOptions: { width: '95%', maxHeight: '95%', anchor: 'center', margin: 1 },
			}
		);

		if (!result || result.steps.length === 0) return;

		const instructions = result.steps
			.map((step, index) => `${index + 1}) @${step.agent}: ${step.task || '(no task provided)'}`)
			.join(', ');

		const message =
			result.mode === 'parallel'
				? `@lead Execute these tasks in parallel: ${instructions}`
				: `@lead Execute this plan in order: ${instructions}`;

		pi.sendUserMessage(message, { deliverAs: 'followUp' });
	};

	type AgentManagerOverlayResult =
		| { action: 'run'; agent: string }
		| { action: 'chain'; agents: string[] };

	const openAgentManager = async (
		ctx: ExtensionContext | ExtensionCommandContext
	): Promise<void> => {
		if (!ctx.hasUI) return;

		const result = await ctx.ui.custom<AgentManagerOverlayResult | undefined>(
			(_tui, theme, _keybindings, done) => new AgentManagerOverlay(theme, serverAgents, done),
			{
				overlay: true,
				overlayOptions: { width: '95%', maxHeight: '95%', anchor: 'center', margin: 1 },
			}
		);

		// TODO: chain action from Agent Manager overlay (multi-select + Ctrl+R) not yet implemented
		if (result?.action === 'chain' && Array.isArray(result.agents)) {
			await openChainEditor(ctx, result.agents);
			return;
		}

		if (result?.action === 'run' && result.agent) {
			const task = await ctx.ui.input(`Task for ${result.agent}`, 'What should this agent do?');
			const trimmed = task?.trim();
			if (trimmed) {
				pi.sendUserMessage(`@${result.agent} ${trimmed}`, { deliverAs: 'followUp' });
			}
		}
	};

	const openHubOverlay = async (
		ctx: ExtensionContext | ExtensionCommandContext,
		activeSessionId: string | null,
		detailSessionId?: string | null
	): Promise<void> => {
		if (!ctx.hasUI) return;
		if (hubOverlayOpen) return;
		hubOverlayOpen = true;

		try {
			await ctx.ui.custom<undefined>(
				(tui, theme, _keybindings, done) =>
					new HubOverlay(tui, theme, {
						baseUrl: getHubHttpBaseUrl(hubUrl!),
						currentSessionId: activeSessionId ?? undefined,
						initialSessionId: detailSessionId ?? undefined,
						startInDetail: !!detailSessionId,
						done,
					}),
				{
					overlay: true,
					overlayOptions: { width: '95%', maxHeight: '95%', anchor: 'center', margin: 1 },
				}
			);
		} finally {
			hubOverlayOpen = false;
		}
	};

	const buildActionContext = (ctx: ExtensionContext | ExtensionCommandContext) => ({
		ui: ctx.hasUI ? ctx.ui : undefined,
		sendUserMessage: (message: string, options?: { deliverAs?: 'followUp' }) => {
			pi.sendUserMessage(message, { deliverAs: options?.deliverAs ?? 'followUp' });
		},
	});

	log(`Hub connected. Tools: ${serverTools.length}, Agents: ${serverAgents.length}`);

	// Titlebar: branding + spinner (registers its own event handlers)
	setupTitlebar(pi);

	// ══════════════════════════════════════════════
	// WebSocket client for runtime communication (tool execution + events)
	// ══════════════════════════════════════════════

	const client = new HubClient();
	// TODO: Remove/Change when we get Agentuity service level auth enabled, this is just temporary
	client.apiKey = process.env[API_KEY_ENV] || null;
	let cachedInitMessage: InitMessage | null = initMsg;
	let currentSessionId: string | null = initMsg.sessionId ?? null;
	let systemPromptApplied = false;
	let connectPromise: Promise<InitMessage | null> | null = null;
	// In native remote mode, remote-tui.ts owns the Hub connection — show as connected
	let hubUiStatus: HubUiStatus = process.env[NATIVE_REMOTE_ENV] ? 'connected' : 'offline';
	let footerCtx: ExtensionContext | null = null;
	let hubOverlayOpen = false;

	// Observer awareness state — tracks who's watching this session.
	// Updated via broadcast events from the Hub (session_join, session_leave).
	const observerState: ObserverState = { count: 0, label: '' };
	const observerParticipantIds = new Set<string>();

	function getHubUiStatus(): HubUiStatus {
		return hubUiStatus;
	}

	function getObserverState(): ObserverState {
		return observerState;
	}

	function mapConnectionStateToUiStatus(state: ConnectionState): HubUiStatus {
		if (state === 'connected') return 'connected';
		if (state === 'reconnecting') return 'reconnecting';
		return 'offline';
	}

	function updateHubUiStatus(state: ConnectionState): void {
		hubUiStatus = mapConnectionStateToUiStatus(state);
		if (footerCtx?.hasUI) {
			footerCtx.ui.setStatus('hub_connection', hubUiStatus);
		}
	}

	function applyInitMessage(nextInit: InitMessage): void {
		cachedInitMessage = nextInit;
		if (nextInit.sessionId) currentSessionId = nextInit.sessionId;
		if (nextInit.config) hubConfig = nextInit.config;
	}

	client.onInitMessage = (nextInit) => {
		applyInitMessage(nextInit);
	};

	client.onConnectionStateChange = (state) => {
		updateHubUiStatus(state);
		log(`Hub connection state: ${state}`);
	};

	client.onBeforeReconnect = async () => {
		const refreshedInit = await fetchInitMessage(hubUrl!, agentRole);
		if (refreshedInit) {
			applyInitMessage(refreshedInit);
			log('Refreshed Hub init payload before reconnect');
		}
	};

	function buildInboundRpcPromptText(command: Record<string, unknown>): string | null {
		const rawText =
			typeof command.message === 'string'
				? command.message
				: typeof command.text === 'string'
					? command.text
					: '';
		const promptText = rawText.trim();
		if (!promptText) return null;

		const targetAgent =
			typeof command.agent === 'string'
				? command.agent.trim()
				: typeof command.targetAgent === 'string'
					? command.targetAgent.trim()
					: '';
		if (targetAgent && targetAgent !== 'lead') {
			return `@${targetAgent} ${promptText}`;
		}
		return promptText;
	}

	function getInboundRpcDeliverAs(commandType: string): 'steer' | 'followUp' | undefined {
		const isIdle = footerCtx?.isIdle() ?? true;
		if (commandType === 'steer') {
			return isIdle ? undefined : 'steer';
		}
		if (commandType === 'prompt' || commandType === 'follow_up') {
			return isIdle ? undefined : 'followUp';
		}
		return undefined;
	}

	function handleInboundRpcCommand(message: Record<string, unknown>): void {
		const command = message.command as Record<string, unknown> | undefined;
		if (!command) {
			log('Ignoring inbound rpc_command without command payload');
			return;
		}

		const commandType = typeof command.type === 'string' ? command.type : '';
		if (commandType === 'abort') {
			if (!footerCtx) {
				log('Ignoring inbound abort before session context is ready');
				return;
			}
			footerCtx.abort();
			log('Handled inbound rpc abort');
			return;
		}

		if (commandType !== 'prompt' && commandType !== 'follow_up' && commandType !== 'steer') {
			log(`Ignoring unsupported inbound rpc command: ${commandType || 'unknown'}`);
			return;
		}

		const promptText = buildInboundRpcPromptText(command);
		if (!promptText) {
			log(`Ignoring empty inbound rpc ${commandType}`);
			return;
		}

		if (Array.isArray(command.attachments) && command.attachments.length > 0) {
			log(`Inbound rpc ${commandType} included attachments; native TUI forwarding text only`);
		}

		const deliverAs = getInboundRpcDeliverAs(commandType);
		try {
			if (deliverAs) {
				pi.sendUserMessage(promptText, { deliverAs });
			} else {
				pi.sendUserMessage(promptText);
			}
			log(`Handled inbound rpc ${commandType}`);
			return;
		} catch (err) {
			if (!deliverAs && commandType === 'prompt') {
				try {
					pi.sendUserMessage(promptText, { deliverAs: 'followUp' });
					log('Handled inbound rpc prompt as follow-up after busy-state fallback');
					return;
				} catch (fallbackErr) {
					log(
						`Inbound rpc prompt fallback failed: ${
							fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
						}`
					);
				}
			}
			log(
				`Inbound rpc ${commandType} failed: ${err instanceof Error ? err.message : String(err)}`
			);
		}
	}

	// Handle unsolicited server messages (broadcast, presence)
	// Updates observer state for footer display
	client.onServerMessage = (message) => {
		const msgType = message.type as string;
		if (msgType === 'rpc_command') {
			if (!remoteSessionId && !isSubAgent) {
				handleInboundRpcCommand(message);
			}
			return;
		}

		if (msgType === 'rpc_command_error') {
			log(
				`Hub reported rpc_command_error: ${
					typeof message.error === 'string' ? message.error : 'unknown error'
				}`
			);
			return;
		}

		if (msgType === 'broadcast') {
			const event = message.event as string;
			if (event === 'session_join') {
				const participant = (message.data as Record<string, unknown>)?.participant as
					| Record<string, unknown>
					| undefined;
				if (participant?.role === 'observer' && typeof participant.id === 'string') {
					observerParticipantIds.add(participant.id);
					observerState.count = observerParticipantIds.size;
					log(`Observer joined: ${observerState.count} observers`);
				}
			} else if (event === 'session_label_updated') {
				const label = (message.data as Record<string, unknown>)?.label as string | undefined;
				if (label) {
					observerState.label = label;
					log(`Session label updated: ${label}`);
				}
			} else if (event === 'session_leave') {
				const participant = (message.data as Record<string, unknown>)?.participant as
					| Record<string, unknown>
					| undefined;
				if (participant?.role === 'observer' && typeof participant.id === 'string') {
					observerParticipantIds.delete(participant.id);
					observerState.count = observerParticipantIds.size;
					log(`Observer left: ${observerState.count} observers`);
				}
			}
		} else if (msgType === 'presence') {
			// Full presence update — may include participant list
			const participants = message.participants as Array<Record<string, unknown>> | undefined;
			if (participants) {
				observerParticipantIds.clear();
				for (const participant of participants) {
					if (participant.role === 'observer' && typeof participant.id === 'string') {
						observerParticipantIds.add(participant.id);
					}
				}
				observerState.count = observerParticipantIds.size;
				log(`Presence update: ${observerState.count} observers`);
			}
		}
	};

	// Lazy WebSocket connect — returns cached InitMessage
	// In native remote mode, remote-tui.ts owns the controller WebSocket via RemoteSession.
	// Skip the extension's own HubClient connection to avoid duplicate controllers.
	function ensureConnected(): Promise<InitMessage | null> {
		if (isNativeRemote) {
			log('Native remote mode — skipping HubClient WebSocket (remote-tui owns controller)');
			return Promise.resolve(cachedInitMessage);
		}
		if (client.connected && cachedInitMessage) return Promise.resolve(cachedInitMessage);
		if (client.connectionState === 'reconnecting' || client.connectionState === 'disconnected') {
			return client
				.waitUntilConnected(RECONNECT_WAIT_TIMEOUT_MS)
				.then(() => cachedInitMessage)
				.catch(() => null);
		}
		if (connectPromise) return connectPromise;

		connectPromise = (async () => {
			log('Connecting WebSocket to Hub...');
			try {
				// In remote mode, connect as a controller to the existing session
				const connectOpts = remoteSessionId
					? { sessionId: remoteSessionId, role: 'controller' as const }
					: { origin: 'tui' as const };
				const wsInitMsg = await client.connect(hubUrl!, connectOpts);
				log('WebSocket connected');
				applyInitMessage(wsInitMsg);
				connectPromise = null; // Clear so future disconnects can reconnect
				return wsInitMsg;
			} catch (err) {
				log(`WebSocket failed: ${err instanceof Error ? err.message : String(err)}`);
				connectPromise = null;
				return null;
			}
		})();

		return connectPromise;
	}

	// ══════════════════════════════════════════════
	// Register Hub tools from server's InitMessage
	// Tools come from the server — NOT hardcoded in the extension.
	// ══════════════════════════════════════════════

	for (const toolDef of serverTools) {
		log(`Registering tool: ${toolDef.name}`);
		const renderers = getToolRenderers(toolDef.name);
		pi.registerTool({
			name: toolDef.name,
			label: toolDef.label || toolDef.name,
			description: toolDef.description,
			// Server sends JSON Schema; TypeBox schemas are JSON Schema at runtime
			parameters: toolDef.parameters as TSchema,
			...(toolDef.promptSnippet ? { promptSnippet: toolDef.promptSnippet } : {}),
			...(toolDef.promptGuidelines
				? {
						promptGuidelines: Array.isArray(toolDef.promptGuidelines)
							? toolDef.promptGuidelines
							: [toolDef.promptGuidelines],
					}
				: {}),
			async execute(
				toolCallId: string,
				params: unknown,
				_signal: AbortSignal | undefined,
				_onUpdate: unknown,
				ctx: ExtensionContext
			): Promise<AgentToolResult<unknown>> {
				// Ensure WebSocket is connected before executing
				await ensureConnected();

				if (!client.connected) {
					return {
						content: [{ type: 'text' as const, text: 'Error: Hub WebSocket not connected' }],
						details: undefined as unknown,
					};
				}

				const id = client.nextId();
				let response: HubResponse;

				try {
					response = await client.send({
						id,
						type: 'tool',
						name: toolDef.name,
						toolCallId,
						params: (params ?? {}) as Record<string, unknown>,
					});
				} catch {
					return {
						content: [{ type: 'text' as const, text: 'Error: Hub connection lost' }],
						details: undefined as unknown,
					};
				}

				// Process ALL Hub actions (NOTIFY, STATUS, RETURN, etc.)
				const result = await processActions(response.actions, buildActionContext(ctx));

				// If there's a return value from processActions, use it
				if (result.returnValue !== undefined) {
					const text =
						typeof result.returnValue === 'string'
							? result.returnValue
							: JSON.stringify(result.returnValue, null, 2);
					return {
						content: [{ type: 'text' as const, text }],
						details: undefined as unknown,
					};
				}

				// Fallback — check for RETURN action directly (backward compat)
				const returnAction = response.actions.find((a: HubAction) => a.action === 'RETURN');
				if (returnAction && 'result' in returnAction) {
					const text =
						typeof returnAction.result === 'string'
							? returnAction.result
							: JSON.stringify(returnAction.result, null, 2);
					return {
						content: [{ type: 'text' as const, text }],
						details: undefined as unknown,
					};
				}

				return {
					content: [{ type: 'text' as const, text: 'Done' }],
					details: undefined as unknown,
				};
			},
			// TUI renderers — optional, only for known Hub tools.
			// Cast needed: SimpleText satisfies Component, but TS can't verify cross-package structural match.
			...(renderers?.renderCall && {
				renderCall: renderers.renderCall as ToolDefinition['renderCall'],
			}),
			...(renderers?.renderResult && {
				renderResult: renderers.renderResult as ToolDefinition['renderResult'],
			}),
		});
	}

	// ══════════════════════════════════════════════
	// Register task tools (LEAD only) from server's agent list
	// Agent names and configs come from the Hub, not hardcoded.
	// ══════════════════════════════════════════════

	if (!isSubAgent && serverAgents.length > 0) {
		pi.registerShortcut('ctrl+shift+a', {
			description: 'Open Agent Manager',
			handler: async (ctx) => {
				await openAgentManager(ctx);
			},
		});

		const openOutputViewer = async (ctx: ExtensionContext): Promise<void> => {
			if (!ctx.hasUI || recentResults.length === 0) return;
			await ctx.ui.custom<undefined>(
				(tui, theme, _keybindings, done) =>
					new OutputViewerOverlay(tui, theme, recentResults, done),
				{
					overlay: true,
					overlayOptions: { width: '95%', maxHeight: '95%', anchor: 'center', margin: 1 },
				}
			);
		};

		pi.registerShortcut('ctrl+shift+v', {
			description: 'View full agent output',
			handler: openOutputViewer,
		});

		// Tmux/terminal environments often cannot emit Ctrl+Shift+V consistently.
		pi.registerShortcut('alt+shift+v', {
			description: 'View full agent output',
			handler: openOutputViewer,
		});

		pi.registerShortcut('ctrl+shift+c', {
			description: 'Open Chain Editor',
			handler: async (ctx) => {
				await openChainEditor(ctx);
			},
		});

		pi.registerShortcut('ctrl+h', {
			description: 'Open Hub overlay',
			handler: async (ctx) => {
				if (!ctx.hasUI) return;
				await openHubOverlay(ctx, currentSessionId);
			},
		});

		const agentRegistry = new Map(serverAgents.map((a) => [a.name, a]));
		const agentNames = serverAgents.map((a) => a.name);

		log(`Registering task tools. Agents: ${agentNames.join(', ')}`);

		const taskRenderers = getToolRenderers('task');
		pi.registerTool({
			name: 'task',
			label: 'Delegate Task to Agent',
			description:
				`Delegate a task to a specialized agent on your team. ` +
				`Available agents: ${agentNames.join(', ')}. ` +
				`Each agent runs independently with its own context window.`,
			promptSnippet:
				'Use task({ description, prompt, subagent_type }) to delegate one focused sub-task to a specialist agent.',
			parameters: Type.Object({
				description: Type.String({ description: 'Short 3-5 word task description' }),
				prompt: Type.String({ description: 'Detailed task instructions for the agent' }),
				subagent_type: Type.String({
					description: `Agent: ${agentNames.join(', ')}`,
				}),
			}),
			async execute(
				toolCallId: string,
				params: unknown,
				signal: AbortSignal | undefined,
				_onUpdate: unknown,
				ctx: ExtensionContext
			): Promise<AgentToolResult<unknown>> {
				const { description, prompt, subagent_type } = params as {
					description: string;
					prompt: string;
					subagent_type: string;
				};

				if (signal?.aborted) {
					return {
						content: [{ type: 'text' as const, text: 'Cancelled' }],
						details: undefined as unknown,
					};
				}

				const agent = agentRegistry.get(subagent_type);
				if (!agent) {
					return {
						content: [
							{
								type: 'text' as const,
								text: `Unknown agent: ${subagent_type}. Available: ${agentNames.join(', ')}`,
							},
						],
						details: undefined as unknown,
					};
				}

				log(`Task: ${description} → ${subagent_type}`);

				const startTime = Date.now();
				const formatElapsed = (): string => {
					const s = Math.floor((Date.now() - startTime) / 1000);
					if (s < 60) return `${s}s`;
					return `${Math.floor(s / 60)}m ${s % 60}s`;
				};
				let elapsedTimer: ReturnType<typeof setInterval> | null = null;

				// ── Single-agent status via working message ──
				let lastWidgetTool: string | undefined;
				let lastWidgetToolArgs: string | undefined;

				function updateWidget(status: string, tool?: string, toolArgs?: string): void {
					if (!ctx.hasUI) return;
					let msg = '';
					if (status === 'running') {
						msg = '\u25CF ' + subagent_type; // ● name
						if (tool) {
							const toolInfo = toolArgs ? `${tool} ${toolArgs}` : tool;
							msg += '  ' + toolInfo.slice(0, 40);
						}
						msg += '  ' + formatElapsed();
					} else if (status === 'completed') {
						msg = '\u2713 ' + subagent_type + '  ' + formatElapsed(); // ✓ name Xs
					} else if (status === 'failed') {
						msg = '\u2717 ' + subagent_type + '  failed'; // ✗ name failed
					}
					ctx.ui.setWorkingMessage(msg);
				}

				if (ctx.hasUI) {
					ctx.ui.setStatus('active_agent', subagent_type);
					updateWidget('running');
					elapsedTimer = setInterval(() => {
						updateWidget('running', lastWidgetTool, lastWidgetToolArgs);
					}, 1000);
				}

				// Create live streaming result before starting sub-agent
				const liveResult = startStreamingResult(subagent_type, description, prompt);
				sendEventNoWait('task_start', {
					taskId: toolCallId,
					agent: subagent_type,
					prompt,
					description,
				});

				try {
					const result = await runSubAgent(
						agent,
						prompt,
						client,
						ctx.hasUI
							? (progress) => {
									// Update TUI working message with live tool activity
									try {
										if (progress.status === 'thinking_delta' && progress.delta) {
											liveResult.thinking += progress.delta;
											updateWidget('running', 'thinking...');
										} else if (progress.status === 'text_delta' && progress.delta) {
											liveResult.text += progress.delta;
											updateWidget('running', 'writing...');
										} else if (progress.status === 'tool_start' && progress.currentTool) {
											lastWidgetTool = progress.currentTool;
											lastWidgetToolArgs = progress.currentToolArgs;
											updateWidget(
												'running',
												progress.currentTool,
												progress.currentToolArgs
											);
										}
									} catch {
										// Best-effort live widget updates.
									}

									// Forward progress to Hub (fire-and-forget, queued while disconnected)
									sendEventNoWait('agent_progress', {
										agentName: progress.agentName,
										status: progress.status,
										taskId: toolCallId,
										delta: progress.delta,
										currentTool: progress.currentTool,
										currentToolArgs: progress.currentToolArgs,
										elapsed: progress.elapsed,
									});
								}
							: undefined,
						signal
					);

					// Flash completed state briefly before clearing
					updateWidget('completed');

					// Finalize the live result instead of creating a new one
					liveResult.isStreaming = false;
					liveResult.text = result.output || liveResult.text || '(no output)';
					await sendEvent(
						'task_complete',
						{
							taskId: toolCallId,
							agent: subagent_type,
							duration: result.duration,
							result: result.output.slice(0, 10000),
						},
						ctx
					);

					let output = result.output;
					let tokenInfoStr: string | undefined;
					if (result.tokens && (result.tokens.input > 0 || result.tokens.output > 0)) {
						tokenInfoStr = `${subagent_type}: ${result.duration}ms | ${result.tokens.input} in ${result.tokens.output} out | $${result.tokens.cost.toFixed(4)}`;
						output += `\n\n---\n_${subagent_type}: ${result.duration}ms | ${result.tokens.input} in ${result.tokens.output} out tokens | $${result.tokens.cost.toFixed(4)}_`;
					}
					if (tokenInfoStr) liveResult.tokenInfo = tokenInfoStr;
					return {
						content: [{ type: 'text' as const, text: output }],
						details: undefined as unknown,
					};
				} catch (err) {
					const errorMsg = err instanceof Error ? err.message : String(err);
					liveResult.isStreaming = false;
					liveResult.text = liveResult.text || `Agent ${subagent_type} failed: ${errorMsg}`;
					await sendEvent(
						'task_error',
						{
							taskId: toolCallId,
							agent: subagent_type,
							error: errorMsg,
						},
						ctx
					);
					updateWidget('failed');
					return {
						content: [
							{ type: 'text' as const, text: `Agent ${subagent_type} failed: ${errorMsg}` },
						],
						details: undefined as unknown,
					};
				} finally {
					if (elapsedTimer) clearInterval(elapsedTimer);
					if (ctx.hasUI) {
						ctx.ui.setStatus('active_agent', undefined);
						ctx.ui.setWorkingMessage(); // Restore Pi's default working message
					}
				}
			},
			...(taskRenderers?.renderCall && {
				renderCall: taskRenderers.renderCall as ToolDefinition['renderCall'],
			}),
			...(taskRenderers?.renderResult && {
				renderResult: taskRenderers.renderResult as ToolDefinition['renderResult'],
			}),
		});

		const parallelRenderers = getToolRenderers('parallel_tasks');
		pi.registerTool({
			name: 'parallel_tasks',
			label: 'Delegate Parallel Tasks',
			description:
				`Run multiple agent tasks concurrently (max 4). ` +
				`Available agents: ${agentNames.join(', ')}.`,
			promptSnippet:
				'Use parallel_tasks({ tasks: [...] }) when multiple independent specialist tasks can run at the same time.',
			parameters: Type.Object({
				tasks: Type.Array(
					Type.Object({
						description: Type.String({ description: 'Short task description' }),
						prompt: Type.String({ description: 'Detailed instructions' }),
						subagent_type: Type.String({ description: 'Agent to delegate to' }),
					}),
					{ maxItems: 4 }
				),
			}),
			async execute(
				toolCallId: string,
				params: unknown,
				signal: AbortSignal | undefined,
				_onUpdate: unknown,
				ctx: ExtensionContext
			): Promise<AgentToolResult<unknown>> {
				const { tasks } = params as {
					tasks: Array<{ description: string; prompt: string; subagent_type: string }>;
				};

				if (signal?.aborted) {
					return {
						content: [{ type: 'text' as const, text: 'Cancelled' }],
						details: undefined as unknown,
					};
				}

				if (tasks.length > 4) {
					return {
						content: [{ type: 'text' as const, text: 'Maximum 4 concurrent tasks allowed.' }],
						details: undefined as unknown,
					};
				}

				log(
					`Parallel tasks: ${tasks.map((t) => `${t.subagent_type}:${t.description}`).join(', ')}`
				);

				let elapsedTimer: ReturnType<typeof setInterval> | null = null;

				// ── Per-agent status tracking for live widget ──
				interface ParallelAgentStatus {
					name: string;
					status: 'pending' | 'running' | 'completed' | 'failed';
					currentTool?: string;
					currentToolArgs?: string;
					startTime?: number;
					duration?: number;
				}

				const agentStatuses: ParallelAgentStatus[] = tasks.map((t) => ({
					name: t.subagent_type,
					status: 'pending',
				}));

				function updateWidget(): void {
					if (!ctx.hasUI) return;
					const parts = agentStatuses
						.filter((s) => s.status !== 'pending')
						.map((s) => {
							const elapsed = s.startTime
								? Math.floor((Date.now() - s.startTime) / 1000)
								: 0;
							const timeStr =
								elapsed < 60
									? `${elapsed}s`
									: `${Math.floor(elapsed / 60)}m${elapsed % 60}s`;
							if (s.status === 'running') {
								let info = `\u25CF ${s.name}`;
								if (s.currentTool) info += ` ${s.currentTool.slice(0, 15)}`;
								return info + ` ${timeStr}`;
							}
							if (s.status === 'completed') {
								return `\u2713 ${s.name} ${timeStr}`;
							}
							if (s.status === 'failed') {
								return `\u2717 ${s.name}`;
							}
							return `\u25CB ${s.name}`;
						});
					ctx.ui.setWorkingMessage(parts.join('  '));
				}

				if (ctx.hasUI) {
					ctx.ui.setStatus('active_agent', 'agents');
					updateWidget();
					elapsedTimer = setInterval(() => {
						updateWidget(); // Refresh elapsed times in widget
					}, 1000);
				}

				// Create live streaming results for each parallel task
				const liveResults = tasks.map((task) =>
					startStreamingResult(task.subagent_type, task.description, task.prompt)
				);

				const promises = tasks.map(async (task, index) => {
					const taskId = `${toolCallId}-${index}-${task.subagent_type}`;
					const agent = agentRegistry.get(task.subagent_type);
					if (!agent) {
						agentStatuses[index]!.status = 'failed';
						liveResults[index]!.isStreaming = false;
						liveResults[index]!.text = `Unknown agent: ${task.subagent_type}`;
						await sendEvent(
							'task_error',
							{
								taskId,
								agent: task.subagent_type,
								error: `Unknown agent: ${task.subagent_type}`,
							},
							ctx
						);
						updateWidget();
						return {
							agent: task.subagent_type,
							error: `Unknown agent: ${task.subagent_type}`,
						};
					}

					agentStatuses[index]!.status = 'running';
					agentStatuses[index]!.startTime = Date.now();
					sendEventNoWait('task_start', {
						taskId,
						agent: task.subagent_type,
						prompt: task.prompt,
						description: task.description,
					});
					updateWidget();

					try {
						const result = await runSubAgent(
							agent,
							task.prompt,
							client,
							ctx.hasUI
								? (progress) => {
										// Handle streaming deltas
										if (progress.status === 'thinking_delta' && progress.delta) {
											liveResults[index]!.thinking += progress.delta;
										} else if (progress.status === 'text_delta' && progress.delta) {
											liveResults[index]!.text += progress.delta;
										}

										// Update per-agent widget with tool activity
										agentStatuses[index]!.currentTool = progress.currentTool;
										agentStatuses[index]!.currentToolArgs = progress.currentToolArgs;
										updateWidget();

										// Forward progress to Hub (fire-and-forget, queued while disconnected)
										sendEventNoWait('agent_progress', {
											agentName: progress.agentName,
											status: progress.status,
											taskId,
											delta: progress.delta,
											currentTool: progress.currentTool,
											currentToolArgs: progress.currentToolArgs,
											elapsed: progress.elapsed,
										});
									}
								: undefined,
							signal
						);

						agentStatuses[index]!.status = 'completed';
						agentStatuses[index]!.duration = result.duration;
						agentStatuses[index]!.currentTool = undefined;
						agentStatuses[index]!.currentToolArgs = undefined;

						// Finalize the live result
						liveResults[index]!.isStreaming = false;
						liveResults[index]!.text =
							result.output || liveResults[index]!.text || '(no output)';
						await sendEvent(
							'task_complete',
							{
								taskId,
								agent: task.subagent_type,
								duration: result.duration,
								result: result.output.slice(0, 10000),
							},
							ctx
						);
						updateWidget();

						return {
							agent: task.subagent_type,
							output: result.output,
							duration: result.duration,
							tokens: result.tokens,
						};
					} catch (err) {
						const errorMsg = err instanceof Error ? err.message : String(err);
						agentStatuses[index]!.status = 'failed';
						agentStatuses[index]!.currentTool = undefined;
						agentStatuses[index]!.currentToolArgs = undefined;
						liveResults[index]!.isStreaming = false;
						liveResults[index]!.text = liveResults[index]!.text || `Failed: ${errorMsg}`;
						await sendEvent(
							'task_error',
							{
								taskId,
								agent: task.subagent_type,
								error: errorMsg,
							},
							ctx
						);
						updateWidget();
						return { agent: task.subagent_type, error: errorMsg };
					}
				});

				try {
					const results = await Promise.all(promises);

					// Finalize live results with token info
					results.forEach((r, idx) => {
						if ('output' in r && r.output && !('error' in r && r.error)) {
							if ('tokens' in r && r.tokens && (r.tokens.input > 0 || r.tokens.output > 0)) {
								liveResults[idx]!.tokenInfo =
									`${r.agent}: ${'duration' in r ? r.duration : 0}ms | ${r.tokens.input} in ${r.tokens.output} out | $${r.tokens.cost.toFixed(4)}`;
							}
						}
					});

					const output = results
						.map((r) => {
							if ('error' in r && r.error) return `### ${r.agent} (FAILED)\n${r.error}`;
							let text = `### ${r.agent} (${'duration' in r ? r.duration : 0}ms)\n${'output' in r ? r.output : ''}`;
							if ('tokens' in r && r.tokens && (r.tokens.input > 0 || r.tokens.output > 0)) {
								text += `\n\n---\n_${r.agent}: ${'duration' in r ? r.duration : 0}ms | ${r.tokens.input} in ${r.tokens.output} out tokens | $${r.tokens.cost.toFixed(4)}_`;
							}
							return text;
						})
						.join('\n\n---\n\n');

					return {
						content: [{ type: 'text' as const, text: output }],
						details: undefined as unknown,
					};
				} finally {
					if (elapsedTimer) clearInterval(elapsedTimer);
					if (ctx.hasUI) {
						ctx.ui.setStatus('active_agent', undefined);
						ctx.ui.setWorkingMessage(); // Restore Pi's default working message
					}
				}
			},
			...(parallelRenderers?.renderCall && {
				renderCall: parallelRenderers.renderCall as ToolDefinition['renderCall'],
			}),
			...(parallelRenderers?.renderResult && {
				renderResult: parallelRenderers.renderResult as ToolDefinition['renderResult'],
			}),
		});
	}

	log('Tool registration complete');

	// ══════════════════════════════════════════════
	// Register slash commands for agent routing (LEAD only)
	// When user types /memory, /scout, etc., the message is routed
	// to that specific agent via a routing prefix.
	// ══════════════════════════════════════════════

	if (!isSubAgent && serverAgents.length > 0) {
		registerAgentCommands(pi, serverAgents, getHubUiStatus, openAgentManager, openChainEditor);
	}

	// ══════════════════════════════════════════════
	// /hub command — Hub session overview (LEAD only)
	// ══════════════════════════════════════════════

	if (!isSubAgent) {
		pi.registerCommand('hub', {
			description: 'Open Coder Hub overlay (sessions, detail, feed)',
			handler: async (_args, ctx) => {
				if (!ctx.hasUI) return;
				await openHubOverlay(ctx, currentSessionId);
			},
		});

		pi.registerCommand('todos', {
			description: 'Open session todo board for current Hub session',
			handler: async (args, ctx) => {
				if (!ctx.hasUI) return;
				const targetSessionId = args.trim().length > 0 ? args.trim() : currentSessionId;
				if (!targetSessionId) {
					ctx.ui.notify('No active Hub session id available yet.', 'warning');
					return;
				}
				await openHubOverlay(ctx, currentSessionId, targetSessionId);
			},
		});

		pi.registerCommand('rename-session', {
			description: 'Rename the current Hub session (max 30 chars)',
			handler: async (args, ctx) => {
				const label = args.trim().slice(0, 30);
				if (!label) {
					if (ctx.hasUI) ctx.ui.notify('Usage: /rename-session <label>', 'warning');
					return;
				}
				if (!client.connected) {
					if (ctx.hasUI) ctx.ui.notify('Not connected to Hub', 'warning');
					return;
				}
				try {
					client.send({ type: 'rename_session', label } as any);
					observerState.label = label;
					if (ctx.hasUI) ctx.ui.notify(`Session renamed to "${label}"`, 'info');
					log(`Session renamed to "${label}"`);
				} catch (err: any) {
					if (ctx.hasUI) ctx.ui.notify(`Failed to rename: ${err?.message || err}`, 'error');
				}
			},
		});

		pi.registerCommand('sync-hub-skills', {
			description: 'Sync skills from Coder Hub to local .agents/skills/ directory',
			handler: async (_args, ctx) => {
				const baseUrl = getHubHttpBaseUrl(hubUrl);
				const url = `${baseUrl}/api/hub/skills`;
				try {
					const resp = await fetch(url, { headers: authHeaders() });
					if (!resp.ok) {
						const msg = `Hub skills fetch failed: ${resp.status} ${resp.statusText}`;
						if (ctx.hasUI) ctx.ui.notify(msg, 'error');
						return;
					}
					const data = (await resp.json()) as {
						ok: boolean;
						count: number;
						skills: Array<{ path: string; content: string }>;
					};
					if (!data.ok || !data.skills?.length) {
						if (ctx.hasUI) ctx.ui.notify('No skills available from Hub.', 'info');
						return;
					}
					const { mkdirSync, writeFileSync } = _require('node:fs') as typeof import('node:fs');
					const { dirname, resolve, relative } = _require(
						'node:path'
					) as typeof import('node:path');
					const cwd = process.cwd();
					const synced: string[] = [];
					for (const skill of data.skills) {
						if (skill.path.includes('\0')) {
							log(`Skipping skill with null byte in path: ${skill.path}`);
							continue;
						}
						const fullPath = resolve(cwd, skill.path);
						const rel = relative(cwd, fullPath);
						if (rel.startsWith('..') || resolve(cwd, rel) !== fullPath) {
							log(`Skipping skill with path traversal: ${skill.path}`);
							continue;
						}
						mkdirSync(dirname(fullPath), { recursive: true });
						writeFileSync(fullPath, skill.content, 'utf-8');
						synced.push(skill.path);
					}
					const msg = `Synced ${synced.length} skill files:\n${synced.map((p) => `  ${p}`).join('\n')}`;
					if (ctx.hasUI) ctx.ui.notify(msg, 'info');
					log(msg);
				} catch (err: any) {
					const msg = `Failed to sync skills: ${err?.message || err}`;
					if (ctx.hasUI) ctx.ui.notify(msg, 'error');
				}
			},
		});
	}

	// ══════════════════════════════════════════════
	// Event Handlers
	// ══════════════════════════════════════════════

	function serializeEvent(event: unknown): Record<string, unknown> {
		const data: Record<string, unknown> = {};
		if (event && typeof event === 'object') {
			for (const [key, value] of Object.entries(event)) {
				if (typeof value !== 'function' && key !== 'signal') {
					try {
						JSON.stringify(value);
						data[key] = value;
					} catch {
						/* skip */
					}
				}
			}
		}
		return data;
	}

	async function sendEvent(
		eventName: string,
		data: Record<string, unknown>,
		ctx: ExtensionContext
	): Promise<unknown> {
		const id = client.nextId();
		try {
			const response = await client.send({
				id,
				type: 'event',
				event: eventName,
				data: { ...data, agentRole },
			});
			const result = await processActions(response.actions, buildActionContext(ctx));
			if (result.block) return result.block;
			if (result.returnValue !== undefined) return result.returnValue;
		} catch {
			/* ignore */
		}
		return undefined;
	}

	function sendEventNoWait(eventName: string, data: Record<string, unknown>): void {
		client.sendNoWait({
			id: client.nextId(),
			type: 'event',
			event: eventName,
			data: { ...data, agentRole },
		});
	}

	const onEvent = pi.on.bind(pi) as GenericEventHandler;

	// session_start: establish WebSocket connection to Hub + set up footer
	onEvent('session_start', async (event: unknown, ctx: ExtensionContext) => {
		footerCtx = ctx;
		if (isNativeRemote && remoteSessionId) {
			setNativeRemoteExtensionContext(ctx);
		}
		await ensureConnected();
		if (ctx.hasUI) {
			ctx.ui.setStatus('hub_connection', getHubUiStatus());
		}

		// Set up Coder footer (powerline: model or active agent > branch > status + observer count)
		setupCoderFooter(ctx, getHubUiStatus, getObserverState);

		// Fire-and-forget: fetch session snapshot for label + initial observer count.
		// Uses the Hub REST endpoint — non-blocking, best-effort.
		if (!isSubAgent) {
			fetchSessionSnapshot(hubUrl!, currentSessionId, observerState).catch(() => {});
		}

		return sendEvent('session_start', serializeEvent(event), ctx);
	});

	// before_agent_start: inject system prompt from Hub
	onEvent('before_agent_start', async (event: unknown, ctx: ExtensionContext) => {
		const eventData = event as { systemPrompt?: string };
		let systemPrompt = eventData.systemPrompt || '';

		const id = client.nextId();
		try {
			const response = await client.send({
				id,
				type: 'event',
				event: 'before_agent_start',
				data: { ...serializeEvent(event), agentRole },
			});

			const result = await processActions(response.actions, buildActionContext(ctx));
			if (result.block) return result.block;

			if (result.systemPrompt) {
				const mode = result.systemPromptMode || 'suffix';
				if (mode === 'prefix') {
					systemPrompt = result.systemPrompt + '\n\n' + systemPrompt;
				} else if (mode === 'suffix') {
					systemPrompt = systemPrompt + '\n\n' + result.systemPrompt;
				} else {
					systemPrompt = result.systemPrompt;
				}
			}
		} catch {
			/* ignore */
		}

		// Apply config prefix/suffix — LEAD ONLY
		if (!isSubAgent) {
			if (hubConfig?.systemPromptPrefix && !systemPromptApplied) {
				systemPrompt = hubConfig.systemPromptPrefix + '\n\n' + systemPrompt;
				systemPromptApplied = true;
			}
			if (hubConfig?.systemPromptSuffix) {
				systemPrompt = systemPrompt + '\n\n' + hubConfig.systemPromptSuffix;
			}
		}

		return { systemPrompt };
	});

	// Proxy all other events
	for (const eventName of PROXY_EVENTS) {
		if (eventName === 'before_agent_start') continue;
		onEvent(eventName, async (event: unknown, ctx: ExtensionContext) => {
			return sendEvent(eventName, serializeEvent(event), ctx);
		});
	}

	// ── Remote mode: input interception + remote event rendering ──
	// Two sub-modes:
	//   1. Native remote (AGENTUITY_CODER_NATIVE_REMOTE=1): remote-tui.ts drives rendering
	//      via Agent.emit(). Extension only provides Hub UI (footer, /hub, commands).
	//      No pi.sendMessage() rendering, no setupRemoteMode() event handlers.
	//   2. Legacy remote: Extension handles all rendering via pi.sendMessage({ customType }).
	if (remoteSessionId) {
		let remoteSession: RemoteSession | null = null;

		// Register custom message renderers (used only in legacy mode, harmless in native)
		try {
			pi.registerMessageRenderer('remote_message', () => undefined);
			pi.registerMessageRenderer('remote_history', () => undefined);
		} catch {
			/* not available in this Pi version */
		}

		if (!isNativeRemote) {
			// Legacy remote: intercept input and render events via pi.sendMessage()
			(pi.on as GenericEventHandler)('input', async (event: unknown, ctx: ExtensionContext) => {
				const inputEvent = event as { text?: string; message?: string; images?: string[] };
				const userMessage = inputEvent.text || inputEvent.message;
				if (!userMessage) return;

				if (!remoteSession?.isConnected) {
					if (ctx.hasUI) ctx.ui.notify('Not connected to remote session yet');
					return { action: 'handled' };
				}

				pi.sendMessage({
					customType: 'remote_message',
					content: `**You:** ${userMessage}`,
					display: true,
				});

				remoteSession.prompt(userMessage, inputEvent.images);
				log(`Sent prompt to remote: ${userMessage.slice(0, 100)}`);

				if (ctx.hasUI) {
					ctx.ui.setWorkingMessage('Sending to remote agent…');
				}
				return { action: 'handled' };
			});

			// Connect the remote session with legacy event rendering
			(async () => {
				try {
					remoteSession = await setupRemoteMode(pi, hubUrl, remoteSessionId);
					log(`Remote session connected: ${remoteSessionId}`);

					if (footerCtx) {
						(remoteSession as RemoteSessionInternal)._setExtensionCtx?.(footerCtx);
					}

					pi.sendMessage({
						customType: 'remote_message',
						content: `Connected to remote session **${remoteSessionId}**`,
						display: true,
					});

					remoteSession.setUiHandler(async (request) => {
						if (!footerCtx) return null;
						return await handleRemoteUiRequest(footerCtx, request);
					});
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					log(`Remote connection failed: ${msg}`);
					pi.sendMessage({
						customType: 'remote_message',
						content: `Failed to connect to remote session: ${msg}`,
						display: true,
					});
				}
			})();
		}
		// In native remote mode: no input interception, no event rendering.
		// remote-tui.ts handles Agent.emit() for native rendering and
		// monkey-patches Agent.prompt/steer/abort for input relay.
	}

	// Clean up on shutdown
	(pi.on as GenericEventHandler)(
		'session_shutdown',
		async (_event: unknown, _ctx: ExtensionContext) => {
			log('Shutting down — closing Hub connection');
			if (isNativeRemote && remoteSessionId) {
				setNativeRemoteExtensionContext(null);
			}
			try {
				client.close();
			} catch {
				/* pending promises rejected on close — safe to ignore */
			}
		}
	);
}

// ══════════════════════════════════════════════
// In-Process Sub-Agent Execution
// Uses Pi's createAgentSession() for fast, context-isolated sub-agents.
// NO subprocess spawning — returns only getLastAssistantText(), not JSONL events.
// Pattern based on oh-my-pi's in-process executor.
// ══════════════════════════════════════════════

/** Token usage extracted from sub-agent sessions (best-effort) */
interface SubAgentTokens {
	input: number;
	output: number;
	cost: number;
}

/** Callback fired during sub-agent execution with live progress updates */
type ProgressCallback = (progress: AgentProgressUpdate) => void;

function truncateOutput(text: string): string {
	let result = text;
	const lines = result.split('\n');
	if (lines.length > MAX_OUTPUT_LINES) {
		result =
			lines.slice(0, MAX_OUTPUT_LINES).join('\n') +
			`\n\n[Output truncated — ${lines.length - MAX_OUTPUT_LINES} lines omitted]`;
	}
	if (result.length > MAX_OUTPUT_BYTES) {
		result =
			result.slice(0, MAX_OUTPUT_BYTES) +
			`\n\n[Output truncated — exceeded ${MAX_OUTPUT_BYTES} bytes]`;
	}
	return result;
}

/** Cache resolved Pi SDK modules to avoid repeated dynamic import resolution */
let _piSdkCache: { piSdk: unknown; piAi: unknown } | null = null;

/**
 * Load Pi SDK packages at runtime.
 * The extension runs inside Pi's process, but @mariozechner/pi-ai isn't in
 * our node_modules — resolve it from Pi's install directory via process.argv[1].
 */
async function loadPiSdk(): Promise<{ piSdk: unknown; piAi: unknown }> {
	if (_piSdkCache) return _piSdkCache;

	// Try direct import first (works if packages are in module resolution path)
	try {
		const piSdk = await import('@mariozechner/pi-coding-agent');
		// @ts-expect-error pi-ai is a runtime dependency available inside Pi's process
		const piAi = await import('@mariozechner/pi-ai');
		_piSdkCache = { piSdk, piAi };
		return _piSdkCache;
	} catch {
		/* fall through to argv[1] resolution */
	}

	// Resolve from Pi CLI binary (process.argv[1] → pi-coding-agent package root)
	const { realpathSync } = _require('node:fs') as typeof import('node:fs');
	const { pathToFileURL } = _require('node:url') as typeof import('node:url');
	const { dirname, join } = _require('node:path') as typeof import('node:path');

	const piRealPath = realpathSync(process.argv[1] || '');
	const piPkgDir = dirname(dirname(piRealPath));
	const piSdkEntry = pathToFileURL(join(piPkgDir, 'dist', 'index.js')).href;
	const piAiEntry = pathToFileURL(
		join(piPkgDir, 'node_modules', '@mariozechner', 'pi-ai', 'dist', 'index.js')
	).href;

	const piSdk = await import(piSdkEntry);
	const piAi = await import(piAiEntry);
	_piSdkCache = { piSdk, piAi };
	return _piSdkCache;
}

/**
 * Create a Pi-compatible tool that proxies execution to the Hub via WebSocket.
 * Used to give sub-agents access to Hub tools (memory, context7, etc.).
 */
function createHubToolProxy(
	toolDef: HubToolDefinition,
	hubClient: HubClient
): Record<string, unknown> {
	return {
		name: toolDef.name,
		label: toolDef.label || toolDef.name,
		description: toolDef.description,
		parameters: toolDef.parameters,
		async execute(
			toolCallId: string,
			params: unknown
		): Promise<{ content: Array<{ type: string; text: string }>; details: unknown }> {
			if (!hubClient.connected) {
				return {
					content: [
						{ type: 'text', text: `Hub not connected — cannot execute ${toolDef.name}` },
					],
					details: undefined,
				};
			}
			const id = hubClient.nextId();
			try {
				const response = await hubClient.send({
					id,
					type: 'tool',
					name: toolDef.name,
					toolCallId,
					params: (params ?? {}) as Record<string, unknown>,
				});
				// Extract RETURN action result
				const returnAction = response.actions.find((a: HubAction) => a.action === 'RETURN');
				if (returnAction && 'result' in returnAction) {
					const text =
						typeof returnAction.result === 'string'
							? returnAction.result
							: JSON.stringify(returnAction.result, null, 2);
					return { content: [{ type: 'text', text }], details: undefined };
				}
				return { content: [{ type: 'text', text: 'Done' }], details: undefined };
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return {
					content: [{ type: 'text', text: `Hub tool error: ${msg}` }],
					details: undefined,
				};
			}
		},
	};
}

/**
 * Run a sub-agent in-process using Pi's createAgentSession().
 * Sub-agents are created with noExtensions=true so they can't recursively
 * spawn further sub-agents (no task tool registered).
 * Sub-agents DO get Hub tools (memory, context7, etc.) via extensionFactories.
 * Only returns the final assistant text, not intermediate events.
 */
async function runSubAgent(
	agentConfig: AgentDefinition,
	task: string,
	hubClient: HubClient,
	onProgress?: ProgressCallback,
	signal?: AbortSignal
): Promise<{ output: string; duration: number; tokens: SubAgentTokens }> {
	const startTime = Date.now();

	const { piSdk, piAi } = await loadPiSdk();
	// Runtime-resolved dynamic imports — exact types unavailable statically
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const {
		createAgentSession,
		DefaultResourceLoader,
		SessionManager,
		createCodingTools,
		createReadOnlyTools,
	} = piSdk as any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const { getModel } = piAi as any;

	// Model — use agent's configured model (sub-agents typically use haiku for speed)
	const modelId = agentConfig.model || 'claude-haiku-4-5';
	const [provider, id] = modelId.includes('/')
		? (modelId.split('/', 2) as [string, string])
		: ['anthropic', modelId];
	const subModel = getModel(provider, id);
	if (!subModel) {
		throw new Error(
			`Model "${modelId}" not available. ` +
				`Check that the ${provider} API key is configured ` +
				`(e.g. ${provider.toUpperCase().replace(/[^A-Z]/g, '_')}_API_KEY).`
		);
	}

	// Hub tools for this sub-agent (shared WebSocket connection)
	// Sub-agents get Hub tools (memory, context7, etc.) via extensionFactories
	// so they work in both driver and TUI mode.
	const hubTools = agentConfig.hubTools ?? [];

	// Resource loader — no extensions (prevents recursive task tool registration),
	// no skills, agent's system prompt injected directly.
	// Hub tools are injected via extensionFactories so sub-agents can use
	// memory_recall, context7_search, etc.
	const subLoader = new DefaultResourceLoader({
		cwd: process.cwd(),
		noExtensions: true,
		extensionFactories:
			hubTools.length > 0
				? [
						(pi: ExtensionAPI) => {
							for (const toolDef of hubTools) {
								// Proxy object has the correct shape; cast needed because return type is Record<string, unknown>
								pi.registerTool(
									createHubToolProxy(toolDef, hubClient) as unknown as ToolDefinition
								);
							}
						},
					]
				: [],
		systemPromptOverride: () => agentConfig.systemPrompt,
	});
	await subLoader.reload();

	// Select tools based on readOnly flag
	const cwd = process.cwd();
	const tools = agentConfig.readOnly ? createReadOnlyTools(cwd) : createCodingTools(cwd);

	const { session } = await createAgentSession({
		// subModel is already untyped (from dynamic import) — createAgentSession is also dynamically imported
		model: subModel,
		thinkingLevel: (agentConfig.thinkingLevel || 'xhigh') as
			| 'off'
			| 'minimal'
			| 'low'
			| 'medium'
			| 'high'
			| 'xhigh',
		tools,
		resourceLoader: subLoader,
		sessionManager: SessionManager.inMemory('/tmp'),
	});
	await session.bindExtensions({});

	// Subscribe to sub-agent events for live progress tracking
	if (onProgress) {
		try {
			session.subscribe?.((event: unknown) => {
				try {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const evt = event as any;
					const elapsed = Date.now() - startTime;

					// Handle streaming message updates (thinking + text tokens)
					if (evt.type === 'message_update' && evt.assistantMessageEvent) {
						const ame = evt.assistantMessageEvent as { type?: string; delta?: string };
						if (ame.type === 'thinking_delta' && ame.delta) {
							onProgress({
								agentName: agentConfig.name,
								status: 'thinking_delta',
								delta: ame.delta,
								elapsed,
							});
						} else if (ame.type === 'text_delta' && ame.delta) {
							onProgress({
								agentName: agentConfig.name,
								status: 'text_delta',
								delta: ame.delta,
								elapsed,
							});
						}
						return;
					}

					if (evt.type === 'tool_execution_start') {
						const toolName = evt.toolName || evt.name || evt.tool || 'unknown';
						let toolArgs = '';
						if (evt.args && typeof evt.args === 'object') {
							const args = evt.args as Record<string, unknown>;
							if (args.command) toolArgs = String(args.command).slice(0, 60);
							else if (args.filePath || args.path)
								toolArgs = String(args.filePath || args.path);
							else if (args.pattern) toolArgs = String(args.pattern).slice(0, 40);
							else {
								const first = Object.values(args)[0];
								if (first) toolArgs = String(first).slice(0, 40);
							}
						}

						onProgress({
							agentName: agentConfig.name,
							status: 'tool_start',
							toolCallId: typeof evt.toolCallId === 'string' ? evt.toolCallId : undefined,
							currentTool: toolName,
							currentToolArgs: toolArgs,
							elapsed,
						});
					} else if (evt.type === 'tool_execution_end') {
						onProgress({
							agentName: agentConfig.name,
							status: 'tool_end',
							toolCallId: typeof evt.toolCallId === 'string' ? evt.toolCallId : undefined,
							elapsed,
						});
					}
				} catch {
					/* ignore — progress tracking is best-effort */
				}
			});
		} catch {
			/* ignore — subscribe may not be available */
		}
	}

	// Abort signal support — cancel sub-agent when user presses Esc
	if (signal) {
		if (signal.aborted) {
			throw new Error('Aborted');
		}
		const onAbort = () => {
			log(`Sub-agent ${agentConfig.name} aborted by signal`);
			try {
				session.abort?.();
			} catch {
				/* ignore */
			}
		};
		signal.addEventListener('abort', onAbort, { once: true });
	}

	log(`Sub-agent started: ${agentConfig.name} (model: ${modelId})`);

	try {
		await session.prompt(task);

		// Only return the final assistant text — NOT intermediate JSONL events
		const output = session.getLastAssistantText?.() || '(no output)';
		const duration = Date.now() - startTime;
		log(`Sub-agent ${agentConfig.name} completed in ${duration}ms`);

		// Best-effort token extraction from sub-agent session messages
		const subTokens: SubAgentTokens = { input: 0, output: 0, cost: 0 };
		try {
			const branch = session.sessionManager?.getBranch?.() || [];
			for (const entry of branch) {
				if (entry.type === 'message') {
					const msg = entry.message as {
						role?: string;
						usage?: { input: number; output: number; cost: { total: number } };
					};
					if (msg.role === 'assistant' && msg.usage) {
						subTokens.input += msg.usage.input;
						subTokens.output += msg.usage.output;
						subTokens.cost += msg.usage.cost.total;
					}
				}
			}
		} catch {
			/* ignore — token extraction is best-effort */
		}

		return { output: truncateOutput(output.trim()), duration, tokens: subTokens };
	} catch (err) {
		try {
			session.abort?.();
		} catch {
			/* ignore */
		}
		throw err;
	}
}

export default agentuityCoderHub;
