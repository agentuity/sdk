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

import {
	createAgentSession,
	DefaultResourceLoader,
	InteractiveMode,
	SessionManager,
} from '@mariozechner/pi-coding-agent';
import {
	getNativeRemoteExtensionContext,
	setNativeRemoteExtensionContext,
	waitForNativeRemoteExtensionContext,
} from './native-remote-ui-context.ts';
import {
	clearRemoteLifecycleWorkingMessage,
	getRemoteLifecycleActivityLabel,
	getRemoteLifecycleLabel,
	syncRemoteLifecycleWorkingMessage,
	type RemoteLifecycleState,
} from './remote-lifecycle.ts';
import { RemoteSession } from './remote-session.ts';
import type { RpcEvent } from './remote-session.ts';
import { agentuityCoderHub } from './index.ts';
import { handleRemoteUiRequest, REMOTE_FIRE_AND_FORGET_UI_METHODS } from './remote-ui-handler.ts';

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
	apiKey?: string;
	orgId?: string;
}): Promise<void> {
	const { hubWsUrl, sessionId, apiKey, orgId } = options;

	log(`Starting remote TUI for session ${sessionId}`);
	log(`Hub URL: ${hubWsUrl}`);

	// Set env vars BEFORE loading the extension so it enters native remote mode
	process.env.AGENTUITY_CODER_HUB_URL = hubWsUrl;
	process.env.AGENTUITY_CODER_REMOTE_SESSION = sessionId;
	process.env.AGENTUITY_CODER_NATIVE_REMOTE = '1';
	setNativeRemoteExtensionContext(null);

	// ── 1. Create RemoteSession (NOT connected yet) ──
	// We register all handlers BEFORE connecting so that the hydration
	// message from the Hub (sent immediately after init) is captured.
	const remote = new RemoteSession(sessionId);
	// Resolve API key: explicit option → env var → null
	remote.apiKey = apiKey || process.env.AGENTUITY_CODER_API_KEY || null;
	remote.orgId = orgId || process.env.AGENTUITY_ORGID || null;
	let hydrationStreamingDetected = false;
	let sessionResumeSeen = false;

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
	let lifecycleState = remote.getLifecycleState();
	let lifecycleOwnsWorkingMessage = false;

	function applyLifecycleUi(state: RemoteLifecycleState): void {
		const ctx = getNativeRemoteExtensionContext();
		if (!ctx?.hasUI) return;

		const shortSession = state.sessionId.slice(0, 16);
		ctx.ui.setStatus(
			'remote_connection',
			`Remote: ${shortSession}${shortSession.length < state.sessionId.length ? '...' : ''} ${getRemoteLifecycleLabel(state)}`
		);

		const activity = getRemoteLifecycleActivityLabel(state);
		if (activity) {
			ctx.ui.setStatus('remote_activity', activity);
		} else {
			ctx.ui.setStatus('remote_activity', state.isStreaming ? 'agent working...' : 'idle');
		}

		lifecycleOwnsWorkingMessage = syncRemoteLifecycleWorkingMessage(
			state,
			ctx.ui,
			lifecycleOwnsWorkingMessage
		);
	}

	remote.onLifecycleChange((state) => {
		lifecycleState = state;
		applyLifecycleUi(state);
	});
	void waitForNativeRemoteExtensionContext(10_000).then((ctx) => {
		if (!ctx) return;
		applyLifecycleUi(lifecycleState);
	});

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
	//
	// Events that arrive before InteractiveMode is initialized are buffered
	// and flushed after init (InteractiveMode registers listeners during init,
	// so agent.emit() before that fires into the void).
	let interactiveModeReady = false;
	let eventBuffer: RpcEvent[] = [];
	let seenMessageStart = false;
	let seenAgentStart = false;

	// Dedup guard: some events may arrive twice via different broadcast paths
	// (rpc_event envelope + direct lifecycle broadcast). Track recent live events
	// by type+timestamp to skip duplicates.
	const recentEventKeys = new Set<string>();
	const DEDUP_WINDOW_MS = 100;

	// InteractiveMode adds a new assistant component on every assistant message_start.
	// Track active/completed remote messages so normal terminal events and late duplicates
	// do not spawn extra components.
	let assistantStreamActive = false;
	const recentCompletedAssistantMessageKeys: string[] = [];
	const completedAssistantMessageKeySet = new Set<string>();

	function rememberCompletedAssistantMessage(key: string): void {
		if (completedAssistantMessageKeySet.has(key)) return;
		recentCompletedAssistantMessageKeys.push(key);
		completedAssistantMessageKeySet.add(key);
		if (recentCompletedAssistantMessageKeys.length > 32) {
			const expired = recentCompletedAssistantMessageKeys.shift();
			if (expired) completedAssistantMessageKeySet.delete(expired);
		}
	}

	function emitRemoteUserPrompt(text: string, timestamp: number): void {
		const userMessage = {
			role: 'user' as const,
			content: [{ type: 'text' as const, text }],
			timestamp,
		};
		const syntheticEvents = [
			{ type: 'message_start', message: userMessage },
			{ type: 'message_end', message: userMessage },
		] as RpcEvent[];

		if (!interactiveModeReady) {
			eventBuffer.push(...syntheticEvents);
			log('Buffered synthetic user_prompt events (InteractiveMode not ready)');
			return;
		}

		for (const event of syntheticEvents) {
			agent.emit(event);
		}
	}

	remote.onEvent((rpcEvent: RpcEvent) => {
		const source = (rpcEvent as any)._source ?? 'unknown';
		const isReplay =
			source === 'replay' ||
			(rpcEvent as any).replay === true ||
			(rpcEvent as any).isReplay === true;
		log(`Event received: ${rpcEvent.type} (source=${source})`);

		if (rpcEvent.type === 'session_resume') {
			sessionResumeSeen = true;
			log(
				`Session resume signaled (${typeof (rpcEvent as any).streamId === 'string' ? (rpcEvent as any).streamId : 'no stream id'})`
			);
			return;
		}

		if (rpcEvent.type === 'session_stream_ready') {
			log(
				`Durable stream ready (${typeof (rpcEvent as any).streamId === 'string' ? (rpcEvent as any).streamId : 'no stream id'})`
			);
			return;
		}

		if (rpcEvent.type === 'rpc_command_error') {
			const error =
				typeof (rpcEvent as any).error === 'string'
					? (rpcEvent as any).error
					: 'Remote command failed';
			const ctx = getNativeRemoteExtensionContext();
			if (ctx?.hasUI) {
				ctx.ui.notify(error, 'warning');
				lifecycleOwnsWorkingMessage = clearRemoteLifecycleWorkingMessage(
					ctx.ui,
					lifecycleOwnsWorkingMessage
				);
			}
			agent._state.error = error;
			seenAgentStart = false;
			seenMessageStart = false;
			resolveRunningPrompt();
			assistantStreamActive = false;
			log(`Remote command error: ${error}`);
			return;
		}

		// session_hydration is handled separately below — skip it here
		if (rpcEvent.type === 'session_hydration') return;

		// Remote prompts from other controllers are broadcast as user_prompt.
		// Convert them to synthetic user message lifecycle events so InteractiveMode
		// renders them like locally-entered prompts. Replays are covered by hydration.
		if (rpcEvent.type === 'user_prompt') {
			if (isReplay) {
				log('Skipping replay user_prompt');
				return;
			}

			const promptText =
				typeof (rpcEvent as any).content === 'string'
					? (rpcEvent as any).content
					: typeof (rpcEvent as any).text === 'string'
						? (rpcEvent as any).text
						: '';
			if (!promptText.trim()) {
				log('Skipping empty user_prompt');
				return;
			}

			const promptTimestamp =
				typeof (rpcEvent as any).timestamp === 'number'
					? (rpcEvent as any).timestamp
					: Date.now();
			log('Rendering live user_prompt as synthetic user message');
			emitRemoteUserPrompt(promptText, promptTimestamp);
			return;
		}

		// Skip user-role message events — the TUI already shows user messages
		// via InteractiveMode input or the synthetic user_prompt path above.
		// Pi emits message_start/end for both user and assistant messages; without
		// this guard the same prompt can appear twice.
		if (rpcEvent.type === 'message_start' || rpcEvent.type === 'message_end') {
			const msg = (rpcEvent as any).message;
			if (msg?.role === 'user') {
				log(`Skipping ${rpcEvent.type} (role=user) — handled locally`);
				return;
			}
		}

		// Dedup: skip if we already processed the same event type + timestamp recently
		// Replays still check the cache, but they never populate it.
		const ts = (rpcEvent as any).timestamp ?? 0;
		const dedupKey = `${rpcEvent.type}:${ts}`;
		if (recentEventKeys.has(dedupKey)) {
			log(`Dedup: skipping duplicate ${rpcEvent.type} (ts=${ts})`);
			return;
		}
		if (!isReplay && ts > 0) {
			recentEventKeys.add(dedupKey);
			setTimeout(() => recentEventKeys.delete(dedupKey), DEDUP_WINDOW_MS);
		}

		// Skip duplicate agent_start if we already emitted a synthetic one
		if (rpcEvent.type === 'agent_start' && syntheticAgentStartEmitted) {
			syntheticAgentStartEmitted = false;
			// Still update state from real event
			updateAgentState(agent, rpcEvent);
			return;
		}

		// Skip replay events — these are historical from Durable Stream
		if (isReplay) {
			log(`Skipping replay event: ${rpcEvent.type}`);
			return;
		}

		const hadSeenAgentStart = seenAgentStart;
		const hadSeenMessageStart = seenMessageStart;
		const assistantMessageKey = getRemoteAssistantMessageKey(rpcEvent);
		if (
			assistantMessageKey &&
			(rpcEvent.type === 'message_start' || rpcEvent.type === 'message_end') &&
			completedAssistantMessageKeySet.has(assistantMessageKey)
		) {
			log(`Dedup: skipping repeated assistant ${rpcEvent.type}`);
			return;
		}

		// State-based dedup for assistant message streaming.
		// Prevents duplicate AssistantMessageComponent from being added to the DOM.
		if (rpcEvent.type === 'message_start') {
			const msg = (rpcEvent as any).message;
			if (msg?.role === 'assistant') {
				if (assistantStreamActive) {
					log(`Dedup: skipping duplicate assistant message_start (stream already active)`);
					return;
				}
				assistantStreamActive = true;
			}
		}
		if (rpcEvent.type === 'message_end') {
			const msg = (rpcEvent as any).message;
			if (msg?.role === 'assistant') {
				assistantStreamActive = false;
				if (assistantMessageKey) {
					rememberCompletedAssistantMessage(assistantMessageKey);
				}
			}
		}
		if (rpcEvent.type === 'agent_end') {
			assistantStreamActive = false;
		}

		// Track streaming lifecycle events so we can inject synthetics when
		// we attach mid-stream (controller connected after agent already started).
		if (rpcEvent.type === 'agent_start') seenAgentStart = true;
		if (rpcEvent.type === 'agent_end') {
			seenAgentStart = false;
			seenMessageStart = false;
		}
		if (rpcEvent.type === 'message_start') seenMessageStart = true;
		if (rpcEvent.type === 'message_end') seenMessageStart = false;

		// Update agent internal state (mirrors Agent._runLoop behavior)
		updateAgentState(agent, rpcEvent);

		// Buffer events until InteractiveMode is ready to receive them
		if (!interactiveModeReady) {
			eventBuffer.push(rpcEvent);
			log(`Buffered event: ${rpcEvent.type} (InteractiveMode not ready)`);
			return;
		}

		// Mid-stream attach guard: if we receive message_update or message_end
		// without having seen message_start, inject synthetic agent_start +
		// message_start so InteractiveMode sets up its streaming component.
		// Without this, the events are silently dropped because
		// InteractiveMode.streamingComponent is null.
		// This happens when the controller connects mid-stream or after the
		// agent finishes — the broadcast of agent_start/message_start occurred
		// before the controller WebSocket was registered.
		let injectedSyntheticMessageStart = false;
		if (
			(rpcEvent.type === 'message_update' || rpcEvent.type === 'message_end') &&
			!hadSeenMessageStart
		) {
			log(`Live ${rpcEvent.type} without prior message_start — injecting synthetics`);
			if (!hadSeenAgentStart) {
				agent.emit({ type: 'agent_start', agentName: 'lead', timestamp: Date.now() } as any);
				seenAgentStart = true;
			}
			agent.emit({
				type: 'message_start',
				message: {
					role: 'assistant',
					content: [],
					api: 'anthropic-messages',
					provider: 'anthropic',
					model: 'remote',
					usage: {
						input: 0,
						output: 0,
						cacheRead: 0,
						cacheWrite: 0,
						totalTokens: 0,
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
					},
					timestamp: Date.now(),
				},
			} as any);
			seenMessageStart = true;
			assistantStreamActive = true;
			injectedSyntheticMessageStart = true;
		}

		// Emit to subscribers — InteractiveMode.handleEvent processes this
		agent.emit(rpcEvent);
		if (injectedSyntheticMessageStart && rpcEvent.type === 'message_end') {
			seenMessageStart = false;
			seenAgentStart = hadSeenAgentStart;
			assistantStreamActive = false;
		}

		// Resolve running prompt when agent finishes
		if (rpcEvent.type === 'agent_end') {
			resolveRunningPrompt();
		}
	});

	// ── 6. Wire up UI handlers for extension dialogs from sandbox ──
	remote.setUiHandler(async (request) => {
		const ctx =
			getNativeRemoteExtensionContext() ?? (await waitForNativeRemoteExtensionContext(10_000));
		if (!ctx) {
			log(
				`UI request: ${request.method} (${request.id}) timed out waiting for extension UI context`
			);
			return REMOTE_FIRE_AND_FORGET_UI_METHODS.has(request.method) ? undefined : null;
		}

		try {
			return await handleRemoteUiRequest(ctx, request);
		} catch (err) {
			log(
				`UI request handler error for ${request.method}: ${err instanceof Error ? err.message : String(err)}`
			);
			return REMOTE_FIRE_AND_FORGET_UI_METHODS.has(request.method) ? undefined : null;
		}
	});

	// ── 7. Handle hydration (initial state from Hub) ──
	// Hydration arrives as the message AFTER 'init' on the WebSocket.
	// remote.connect() resolves on 'init', so hydration arrives in the next
	// event loop tick. We use a promise to wait for it before creating
	// InteractiveMode (which calls renderInitialMessages from SessionManager).
	const sm = session.sessionManager;
	let resolveHydration: () => void;
	let hydrationComplete = false;
	const hydrationReady = new Promise<void>((resolve) => {
		resolveHydration = () => {
			if (hydrationComplete) return;
			hydrationComplete = true;
			resolve();
		};
	});

	let hydrationCount = 0;
	remote.onEvent((event: RpcEvent) => {
		if (event.type !== 'session_hydration') return;
		hydrationCount++;

		const entries = (event as any).entries as
			| Array<{
					type: string;
					content?: string | Array<{ type: string; text?: string }>;
					role?: string;
					timestamp?: number;
			  }>
			| undefined;

		// Extract task text from hydration (Hub includes session.sandbox?.task)
		const hydrationTask = (event as any).task as string | undefined;

		// On reconnect (2nd+ hydration), clear SM to prevent duplicate accumulation.
		// agent.replaceMessages() already replaces state.messages, but SM only appends.
		if (hydrationCount > 1) {
			log(`Re-hydration #${hydrationCount} — clearing SessionManager to prevent duplicates`);
			try {
				if (typeof (sm as any).clear === 'function') {
					(sm as any).clear();
				}
			} catch (err) {
				log(`SM clear error (non-fatal): ${err}`);
			}
		}

		if (!entries?.length) {
			log('Received session_hydration with no entries');
			// Even with no entries, inject task as user message if available
			if (hydrationTask) {
				const taskMsg = {
					role: 'user' as const,
					content: [{ type: 'text' as const, text: hydrationTask }],
					timestamp: Date.now(),
				};
				agent.replaceMessages([taskMsg]);
				try {
					sm.appendMessage(taskMsg as any);
				} catch (err) {
					log(`SM append task error: ${err}`);
				}
				log('Injected task as user message (no entries)');
			}
			resolveHydration!();
			return;
		}

		log(`Hydrating ${entries.length} entries (hydration #${hydrationCount})`);
		const agentMessages: any[] = [];

		// If we have a task and no user_prompt entry, inject the task as the first user message
		const hasUserEntry = entries.some((e) => e.type === 'user_prompt' || e.role === 'user');
		if (hydrationTask && !hasUserEntry) {
			const taskMsg = {
				role: 'user' as const,
				content: [{ type: 'text' as const, text: hydrationTask }],
				timestamp: Date.now(),
			};
			agentMessages.push(taskMsg);
			try {
				sm.appendMessage(taskMsg as any);
			} catch (err) {
				log(`SM append task error: ${err}`);
			}
			log('Injected task as user message');
		}

		for (const entry of entries) {
			const text =
				typeof entry.content === 'string'
					? entry.content
					: Array.isArray(entry.content)
						? entry.content
								.filter(
									(c): c is { type: string; text: string } =>
										c.type === 'text' && typeof c.text === 'string'
								)
								.map((c) => c.text)
								.join('\n')
						: '';

			if (!text) continue;

			// Hub conversation entries use type: 'message' for assistant, 'thinking' for thinking,
			// 'task_result' for delegation results, 'turn' for turn markers, 'user_prompt' for user input.
			// Only 'user_prompt' entries are user messages; everything else is assistant-side.
			const isAssistant =
				entry.role === 'assistant' ||
				entry.type === 'message' ||
				entry.type === 'thinking' ||
				entry.type === 'task_result' ||
				entry.type === 'assistant';
			if (isAssistant) {
				const msg = {
					role: 'assistant' as const,
					content: [{ type: 'text' as const, text }],
					api: 'anthropic-messages',
					provider: 'anthropic',
					model: 'remote',
					usage: {
						input: 0,
						output: 0,
						cacheRead: 0,
						cacheWrite: 0,
						totalTokens: 0,
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
					},
					stopReason: 'stop',
					timestamp: entry.timestamp ?? Date.now(),
				};
				agentMessages.push(msg);
				try {
					sm.appendMessage(msg as any);
				} catch (err) {
					log(`SM append error: ${err}`);
				}
			} else {
				const msg = {
					role: 'user' as const,
					content: [{ type: 'text' as const, text }],
					timestamp: entry.timestamp ?? Date.now(),
				};
				agentMessages.push(msg);
				try {
					sm.appendMessage(msg as any);
				} catch (err) {
					log(`SM append error: ${err}`);
				}
			}
		}

		if (agentMessages.length > 0) {
			agent.replaceMessages(agentMessages);
			log(`Hydrated ${agentMessages.length} agent messages (+ session manager)`);
		} else {
			log('Hydration: 0 messages after filtering (all entries had empty text?)');
		}

		// Restore streaming state from hydration — fixes first-connect miss
		const streamingState = (event as any).streamingState as
			| {
					isStreaming?: boolean;
					activeTasks?: Array<{ taskId: string; agent: string }>;
			  }
			| undefined;

		if (streamingState?.isStreaming) {
			agent._state.isStreaming = true;
			hydrationStreamingDetected = true;
			// Create runningPrompt so InteractiveMode knows we're busy
			if (!agent.runningPrompt) {
				const runPromise = new Promise<void>((resolve) => {
					runningPromptResolve = resolve;
				});
				agent.runningPrompt = runPromise;
			}
			log(
				`Hydration: session is streaming with ${streamingState.activeTasks?.length ?? 0} active tasks`
			);
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
	await Promise.race([
		hydrationReady,
		new Promise<void>((resolve) => {
			const waitStartedAt = Date.now();
			const poll = (): void => {
				if (hydrationComplete) {
					resolve();
					return;
				}
				const timeoutMs = sessionResumeSeen ? 5000 : 2000;
				if (Date.now() - waitStartedAt >= timeoutMs) {
					log('Hydration timeout — no session_hydration received');
					resolve();
					return;
				}
				setTimeout(poll, 50);
			};
			poll();
		}),
	]);
	const smEntries = sm.getEntries?.() ?? [];
	log(`SessionManager has ${smEntries.length} entries after hydration`);
	log(`Post-hydration: SM has ${smEntries.length} entries, leafId=${sm.getLeafId?.() ?? 'N/A'}`);

	// ── 9. Start InteractiveMode — full native Pi TUI ──
	log('Creating InteractiveMode');
	const interactive = new InteractiveMode(session);
	log('InteractiveMode created, calling init...');
	await interactive.init();

	// Flush buffered events now that InteractiveMode is listening.
	// If the session was already streaming when we connected (mid-stream attach),
	// InteractiveMode needs agent_start + message_start to set up its streaming
	// components. Without these, message_update events are silently dropped
	// because InteractiveMode.streamingComponent is null.
	interactiveModeReady = true;

	if (hydrationStreamingDetected) {
		// Immediately emit agent_start + message_start so InteractiveMode shows
		// the streaming indicator right away, before any buffered events flush.
		// This prevents the blank screen gap between connect and first event.
		log('Hydration detected streaming — emitting immediate synthetics');
		agent.emit({ type: 'agent_start', agentName: 'lead', timestamp: Date.now() } as any);
		agent.emit({
			type: 'message_start',
			message: {
				role: 'assistant',
				content: [],
				api: 'anthropic-messages',
				provider: 'anthropic',
				model: 'remote',
				usage: {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 0,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
				timestamp: Date.now(),
			},
		} as any);
		seenAgentStart = true;
		seenMessageStart = true;
		assistantStreamActive = true;

		// Remove any agent_start/message_start from buffer since we already emitted them
		eventBuffer = eventBuffer.filter(
			(e) => e.type !== 'agent_start' && e.type !== 'message_start'
		);
	}

	if (eventBuffer.length > 0) {
		log(`Flushing ${eventBuffer.length} events: ${eventBuffer.map((e) => e.type).join(', ')}`);
		for (const buffered of eventBuffer) {
			agent.emit(buffered);
			if (buffered.type === 'agent_end') {
				resolveRunningPrompt();
			}
		}
	}
	eventBuffer = [];

	log('InteractiveMode initialized, calling run...');

	// Handle clean shutdown
	const cleanup = () => {
		remote.close();
		setNativeRemoteExtensionContext(null);
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
		setNativeRemoteExtensionContext(null);
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
			// NOTE: Do NOT push to state.messages here.
			// AgentSession._handleAgentEvent already persists via sessionManager.appendMessage().
			// Pushing here causes state.messages to accumulate duplicates with SM,
			// leading to visual duplicates if rebuildChatFromMessages() is ever triggered.
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

function getRemoteAssistantMessageKey(event: RpcEvent): string | undefined {
	if (event.type !== 'message_start' && event.type !== 'message_end') return undefined;

	const message = (event as any).message;
	if (!message || typeof message !== 'object' || message.role !== 'assistant') {
		return undefined;
	}

	const messageId = typeof message.id === 'string' ? message.id : '';
	if (messageId) return `id:${messageId}`;

	const timestamp =
		typeof message.timestamp === 'number'
			? String(message.timestamp)
			: typeof message.timestamp === 'string'
				? message.timestamp
				: typeof (event as any).timestamp === 'number'
					? String((event as any).timestamp)
					: typeof (event as any).timestamp === 'string'
						? (event as any).timestamp
						: '';
	if (timestamp) return `ts:${timestamp}`;

	const text = extractMessageText(message);
	if (!text) return undefined;

	const stopReason = typeof message.stopReason === 'string' ? message.stopReason : '';
	return `text:${stopReason}|${text}`;
}
