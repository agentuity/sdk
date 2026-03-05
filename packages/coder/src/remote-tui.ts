/**
 * Remote TUI — Native Pi Coding Agent Renderer for Remote Sessions
 *
 * Creates a real AgentSession + InteractiveMode backed by a remote sandbox
 * via Hub WebSocket, with the coder extension loaded for Hub UI (footer,
 * /hub overlay, commands, titlebar).
 *
 * Architecture:
 *   Remote TUI → Hub WebSocket (controller) → Sandbox (Pi RPC mode)
 *   - User input  → agent.prompt() (monkey-patched) → RPC `prompt` → Hub → sandbox
 *   - Sandbox Pi  → AgentEvent stream → Hub broadcast → Agent.emit() → InteractiveMode renders natively
 *   - Hub UI      → coder extension (loaded via DefaultResourceLoader) provides footer, /hub, commands
 *
 * The local Agent never calls an LLM. Its prompt/steer/abort are monkey-patched
 * to send RPC commands. Its internal state is kept in sync with the remote agent
 * by mirroring state updates from each received event.
 *
 * The coder extension sees AGENTUITY_CODER_REMOTE_SESSION (Hub UI mode) +
 * AGENTUITY_CODER_NATIVE_REMOTE (skip legacy event rendering). It provides
 * Hub connection, footer, /hub overlay, commands, titlebar — but does NOT
 * intercept input or render events (this module handles both).
 *
 * IMPORTANT: Initialization order matters!
 *   1. Create RemoteSession (no connection yet)
 *   2. Create AgentSession, patch Agent/Session methods
 *   3. Register ALL event handlers on RemoteSession
 *   4. THEN connect — so hydration + replay events are captured
 */

import type { AgentSession } from '@mariozechner/pi-coding-agent';
import {
	createAgentSession,
	DefaultResourceLoader,
	InteractiveMode,
	SessionManager,
} from '@mariozechner/pi-coding-agent';
import { RemoteSession } from './remote-session.ts';
import type { RpcEvent } from './remote-session.ts';
import { agentuityCoderHub } from './index.ts';

const DEBUG = !!process.env['AGENTUITY_DEBUG'];

function log(msg: string): void {
	if (DEBUG) console.error(`[remote-tui] ${msg}`);
}

/**
 * Run the native Pi TUI connected to a remote sandbox session.
 *
 * This is the entry point for `agentuity coder start --remote <sessionId>`.
 * Creates an AgentSession with the coder extension loaded (Hub UI), then
 * monkey-patches the Agent for remote-backed execution.
 */
export async function runRemoteTui(options: {
	hubWsUrl: string;
	sessionId: string;
}): Promise<void> {
	const { hubWsUrl, sessionId } = options;

	log(`Starting remote TUI for session ${sessionId}`);
	log(`Hub URL: ${hubWsUrl}`);

	// Set env vars BEFORE loading the extension so it enters native remote mode
	process.env.AGENTUITY_CODER_HUB_URL = hubWsUrl;
	process.env.AGENTUITY_CODER_REMOTE_SESSION = sessionId;
	process.env.AGENTUITY_CODER_NATIVE_REMOTE = '1';

	// ── 1. Create RemoteSession (NOT connected yet) ──
	// We register all handlers BEFORE connecting so that the hydration
	// message from the Hub (sent immediately after init) is captured.
	const remote = new RemoteSession(sessionId);

	// ── 2. Create AgentSession with coder extension loaded ──
	// The extension provides Hub UI (footer, /hub overlay, commands, titlebar).
	// AGENTUITY_CODER_NATIVE_REMOTE=1 tells it to skip legacy event rendering.
	const cwd = process.cwd();
	const resourceLoader = new DefaultResourceLoader({
		cwd,
		noExtensions: true, // Skip file-system extension discovery
		extensionFactories: [agentuityCoderHub], // Load coder extension directly
	});
	await resourceLoader.reload();

	const { session } = await createAgentSession({
		sessionManager: SessionManager.inMemory(),
		tools: [], // No local tools — sandbox has all the tools
		resourceLoader,
	});
	log('AgentSession created');

	// NOTE: Do NOT call session.bindExtensions() here.
	// InteractiveMode.initExtensions() calls it with the proper uiContext.
	// Calling it early fires session_start twice, duplicating extension init.

	// Access the Agent instance (typed as `any` for monkey-patching)
	const agent: any = session.agent;

	// ── 3. Patch Agent to be remote-backed ──
	// Track the running prompt promise so InteractiveMode waits correctly
	let runningPromptResolve: (() => void) | null = null;
	let syntheticAgentStartEmitted = false;

	// Override Agent.prompt — send RPC prompt command, block until agent_end
	agent.prompt = async (input: any): Promise<void> => {
		const text = extractPromptText(input);
		log(`agent.prompt called, extracted text: ${text ? text.slice(0, 80) : '(empty)'}`);
		if (!text) return;

		// Set streaming state — InteractiveMode checks this
		agent._state.isStreaming = true;
		agent._state.streamMessage = null;
		agent._state.error = undefined;

		// Create runningPrompt so waitForIdle() works
		const runPromise = new Promise<void>((resolve) => {
			runningPromptResolve = resolve;
		});
		agent.runningPrompt = runPromise;

		// Emit synthetic agent_start so InteractiveMode shows "working" immediately
		syntheticAgentStartEmitted = true;
		agent.emit({ type: 'agent_start', agentName: 'lead', timestamp: Date.now() });

		// Send RPC command to sandbox
		remote.prompt(text);
		log(`Sent prompt: ${text.slice(0, 100)}`);

		// Block until agent_end received from remote
		await runPromise;
	};

	// Override Agent.steer — send RPC steer command
	agent.steer = (m: any) => {
		const text = extractMessageText(m);
		if (text) {
			remote.steer(text);
			log(`Sent steer: ${text.slice(0, 100)}`);
		}
	};

	// Override Agent.abort — send RPC abort command
	agent.abort = () => {
		remote.abort();
		log('Sent abort');
		resolveRunningPrompt();
	};

	// Override Agent.waitForIdle
	agent.waitForIdle = () => {
		return agent.runningPrompt ?? Promise.resolve();
	};

	// ── 4. Patch AgentSession methods ──
	// session.prompt() does model/API key validation before calling agent.prompt().
	// In remote mode, skip validation — the sandbox has the model/key.
	// InteractiveMode calls session.prompt(text, { streamingBehavior: "steer" })
	// when user types during streaming, and session.prompt(text, { streamingBehavior: "followUp" })
	// for Alt+Enter follow-ups. Handle these by routing to steer/followUp commands.
	(session as any).prompt = async (text: string, options?: any) => {
		const behavior = options?.streamingBehavior;
		log(`session.prompt called (behavior=${behavior ?? 'normal'}): ${text.slice(0, 80)}`);

		// Extension commands (start with /) — let AgentSession handle them
		// so extension-registered slash commands still work in remote mode
		if (text.startsWith('/') && (session as any)._tryExecuteExtensionCommand) {
			try {
				const handled = await (session as any)._tryExecuteExtensionCommand(text);
				if (handled) {
					log(`Extension command handled: ${text}`);
					return;
				}
			} catch (err) {
				log(`Extension command error: ${err}`);
			}
		}

		if (behavior === 'steer') {
			remote.steer(text);
			log(`Sent steer: ${text.slice(0, 80)}`);
			return;
		}
		if (behavior === 'followUp') {
			remote.sendCommand({ type: 'follow_up', message: text });
			log(`Sent follow-up: ${text.slice(0, 80)}`);
			return;
		}

		// Normal prompt — send to sandbox
		await agent.prompt(text);
	};

	(session as any).steer = async (text: string) => {
		remote.steer(text);
	};

	(session as any).followUp = async (text: string) => {
		remote.sendCommand({ type: 'follow_up', message: text });
	};

	(session as any).abort = async () => {
		remote.abort();
		resolveRunningPrompt();
	};

	// Disable auto-compaction (sandbox handles it)
	session.setAutoCompactionEnabled(false);
	session.setAutoRetryEnabled(false);

	// ── 5. Wire up remote events → Agent event pipeline ──
	// Only emit LIVE events (from broadcast) to Agent → InteractiveMode.
	// Replay events (from Durable Stream) are historical — skip them.
	// Hydration is handled separately via session_hydration → agent.replaceMessages().
	remote.onEvent((rpcEvent: RpcEvent) => {
		const source = (rpcEvent as any)._source ?? 'unknown';
		log(`Event received: ${rpcEvent.type} (source=${source})`);

		// session_hydration is handled separately below — skip it here
		if (rpcEvent.type === 'session_hydration') return;

		// Skip duplicate agent_start if we already emitted a synthetic one
		if (rpcEvent.type === 'agent_start' && syntheticAgentStartEmitted) {
			syntheticAgentStartEmitted = false;
			// Still update state from real event
			updateAgentState(agent, rpcEvent);
			return;
		}

		// Skip replay events — these are historical from Durable Stream
		if (source === 'replay') {
			log(`Skipping replay event: ${rpcEvent.type}`);
			return;
		}

		// Update agent internal state (mirrors Agent._runLoop behavior)
		updateAgentState(agent, rpcEvent);

		// Emit to subscribers — InteractiveMode.handleEvent processes this
		agent.emit(rpcEvent);

		// Resolve running prompt when agent finishes
		if (rpcEvent.type === 'agent_end') {
			resolveRunningPrompt();
		}
	});

	// ── 6. Wire up UI handlers for extension dialogs from sandbox ──
	remote.setUiHandler(async (request) => {
		// TODO: Bridge to InteractiveMode's extension UI context
		log(`UI request: ${request.method} (no handler yet)`);
		const fireAndForget = ['notify', 'setStatus', 'setWidget', 'setTitle', 'set_editor_text'];
		if (fireAndForget.includes(request.method)) return undefined;
		return null;
	});

	// ── 7. Handle hydration (initial state from Hub) ──
	// Hydration arrives as the message AFTER 'init' on the WebSocket.
	// remote.connect() resolves on 'init', so hydration arrives in the next
	// event loop tick. We use a promise to wait for it before creating
	// InteractiveMode (which calls renderInitialMessages from SessionManager).
	const sm = session.sessionManager;
	let resolveHydration: () => void;
	const hydrationReady = new Promise<void>((resolve) => { resolveHydration = resolve; });

	remote.onEvent((event: RpcEvent) => {
		if (event.type !== 'session_hydration') return;

		const entries = (event as any).entries as Array<{
			type: string;
			content?: string | Array<{ type: string; text?: string }>;
			role?: string;
			timestamp?: number;
		}> | undefined;

		if (!entries?.length) {
			log('Received session_hydration with no entries');
			resolveHydration!();
			return;
		}

		log(`Hydrating ${entries.length} entries`);
		const agentMessages: any[] = [];

		for (const entry of entries) {
			const text = typeof entry.content === 'string'
				? entry.content
				: Array.isArray(entry.content)
					? entry.content
						.filter((c): c is { type: string; text: string } => c.type === 'text' && typeof c.text === 'string')
						.map((c) => c.text)
						.join('\n')
					: '';

			if (!text) continue;

			if (entry.role === 'assistant' || entry.type === 'assistant') {
				const msg = {
					role: 'assistant' as const,
					content: [{ type: 'text' as const, text }],
					api: 'anthropic-messages',
					provider: 'anthropic',
					model: 'remote',
					usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
					stopReason: 'stop',
					timestamp: entry.timestamp ?? Date.now(),
				};
				agentMessages.push(msg);
				try { sm.appendMessage(msg as any); } catch (err) { log(`SM append error: ${err}`); }
			} else {
				const msg = {
					role: 'user' as const,
					content: [{ type: 'text' as const, text }],
					timestamp: entry.timestamp ?? Date.now(),
				};
				agentMessages.push(msg);
				try { sm.appendMessage(msg as any); } catch (err) { log(`SM append error: ${err}`); }
			}
		}

		if (agentMessages.length > 0) {
			agent.replaceMessages(agentMessages);
			log(`Hydrated ${agentMessages.length} agent messages (+ session manager)`);
		}
		resolveHydration!();
	});

	// ── 8. NOW connect to Hub ──
	// All handlers are registered, so hydration + replay events will be captured.
	log('Connecting to Hub (handlers registered)...');
	await remote.connect(hubWsUrl);
	log('Connected to Hub as controller');

	// Wait for hydration message (arrives right after init), with a timeout
	// in case this is the first connection and there's nothing to hydrate.
	const HYDRATION_TIMEOUT_MS = 2000;
	await Promise.race([
		hydrationReady,
		new Promise<void>((resolve) => setTimeout(() => {
			log('Hydration timeout — no session_hydration received');
			resolve();
		}, HYDRATION_TIMEOUT_MS)),
	]);
	log(`SessionManager has ${sm.getEntries?.() ? 'entries' : 'no getEntries method'} after hydration`);

	// ── 9. Start InteractiveMode — full native Pi TUI ──
	log('Creating InteractiveMode');
	const interactive = new InteractiveMode(session);
	log('InteractiveMode created, calling init...');
	await interactive.init();
	log('InteractiveMode initialized, calling run...');

	// Handle clean shutdown
	const cleanup = () => {
		remote.close();
		interactive.stop();
	};
	process.on('SIGINT', cleanup);
	process.on('SIGTERM', cleanup);

	try {
		await interactive.run();
	} catch (err) {
		log(`InteractiveMode.run() threw: ${err instanceof Error ? err.stack : String(err)}`);
		throw err;
	} finally {
		remote.close();
		log('Remote TUI exited');
	}

	// ── Helper: resolve the running prompt promise ──
	function resolveRunningPrompt(): void {
		syntheticAgentStartEmitted = false;
		agent._state.isStreaming = false;
		agent._state.streamMessage = null;
		agent._state.pendingToolCalls = new Set();
		if (runningPromptResolve) {
			runningPromptResolve();
			runningPromptResolve = null;
			agent.runningPrompt = undefined;
		}
	}
}

// ══════════════════════════════════════════════
// Agent state synchronization
// Mirrors Agent._runLoop state updates (agent.js lines 317-352)
// ══════════════════════════════════════════════

function updateAgentState(agent: any, event: RpcEvent): void {
	const state = agent._state;

	switch (event.type) {
		case 'agent_start':
			state.isStreaming = true;
			break;

		case 'agent_end':
			state.isStreaming = false;
			state.streamMessage = null;
			state.pendingToolCalls = new Set();
			break;

		case 'message_start':
			state.streamMessage = (event as any).message;
			state.isStreaming = true;
			break;

		case 'message_update':
			state.streamMessage = (event as any).message;
			break;

		case 'message_end':
			state.streamMessage = null;
			state.messages = [...state.messages, (event as any).message];
			break;

		case 'tool_execution_start': {
			const s = new Set(state.pendingToolCalls);
			s.add((event as any).toolCallId);
			state.pendingToolCalls = s;
			break;
		}

		case 'tool_execution_end': {
			const s = new Set(state.pendingToolCalls);
			s.delete((event as any).toolCallId);
			state.pendingToolCalls = s;
			break;
		}

		case 'thinking_start':
			state.isStreaming = true;
			break;

		case 'thinking_end':
			break;

		case 'tool_call':
			state.isStreaming = true;
			break;

		case 'tool_result':
			break;

		case 'task_start':
			state.isStreaming = true;
			break;

		case 'task_complete':
		case 'task_error':
			break;

		case 'turn_end': {
			const msg = (event as any).message;
			if (msg?.role === 'assistant' && msg?.errorMessage) {
				state.error = msg.errorMessage;
			}
			break;
		}
	}
}

// ══════════════════════════════════════════════
// Text extraction helpers
// ══════════════════════════════════════════════

function extractPromptText(input: any): string {
	if (typeof input === 'string') return input;

	if (Array.isArray(input)) {
		return input.map(extractMessageText).filter(Boolean).join('\n');
	}

	return extractMessageText(input);
}

function extractMessageText(msg: any): string {
	if (typeof msg === 'string') return msg;
	if (!msg || typeof msg !== 'object') return '';

	if (typeof msg.content === 'string') return msg.content;

	if (Array.isArray(msg.content)) {
		return msg.content
			.filter((c: any) => c?.type === 'text' && typeof c.text === 'string')
			.map((c: any) => c.text)
			.join('\n');
	}

	return '';
}
