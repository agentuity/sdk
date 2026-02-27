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
import { processActions } from './handlers.ts';
import { getToolRenderers } from './renderers.ts';
import { setupCoderFooter } from './footer.ts';
import type { HubAction, HubResponse, InitMessage, HubConfig, HubToolDefinition, AgentDefinition } from './protocol.ts';

// ESM doesn't have require() — create one for synchronous child_process access
const _require = createRequire(import.meta.url);

const HUB_URL_ENV = 'AGENTUITY_CODER_HUB_URL';
const AGENT_ENV = 'AGENTUITY_CODER_AGENT';

// ══════════════════════════════════════════════
// Sub-Agent Output Limits (prevents context bloat in parent)
// Inspired by pi-subagents (200KB/5K lines) and oh-my-pi (500KB/5K lines)
// ══════════════════════════════════════════════
const SUB_AGENT_TIMEOUT_MS = 120_000;
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

function log(msg: string): void {
	console.error(`[agentuity-pi] ${msg}`);
}

// ══════════════════════════════════════════════
// Synchronous Bootstrap — fetch InitMessage from Hub REST endpoint
// This runs BEFORE tool registration so we know what tools/agents
// the server actually provides. No hardcoded schemas.
// ══════════════════════════════════════════════

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
	// Convert ws:// to http:// and point to /api/hub/init REST endpoint
	let httpUrl = hubUrl
		.replace(/^ws:\/\//, 'http://')
		.replace(/^wss:\/\//, 'https://');

	// Replace the WebSocket path with the REST init path
	if (httpUrl.includes('/api/ws')) {
		httpUrl = httpUrl.replace('/api/ws', '/api/hub/init');
	} else {
		// If no /api/ws path, append /api/hub/init
		httpUrl = httpUrl.replace(/\/?$/, '/api/hub/init');
	}

	// Add agent role query param for sub-agents
	if (agentRole && agentRole !== 'lead') {
		httpUrl += `?agent=${encodeURIComponent(agentRole)}`;
	}

	try {
		const { execFileSync } = _require('node:child_process') as typeof import('node:child_process');
		const result = execFileSync('curl', [
			'-s',
			'--connect-timeout', '3',
			'--max-time', '5',
			httpUrl,
		], { encoding: 'utf-8' });

		const parsed = JSON.parse(result);
		if (parsed && parsed.type === 'init') {
			return parsed as InitMessage;
		}
		return null;
	} catch {
		return null;
	}
}

export function agentuityCoderHub(pi: ExtensionAPI) {
	const hubUrl = process.env[HUB_URL_ENV];
	if (!hubUrl) return;

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

	log(`Hub connected. Tools: ${serverTools.length}, Agents: ${serverAgents.length}`);

	// ══════════════════════════════════════════════
	// WebSocket client for runtime communication (tool execution + events)
	// ══════════════════════════════════════════════

	const client = new HubClient();
	let cachedInitMessage: InitMessage | null = initMsg;
	let systemPromptApplied = false;
	let connectPromise: Promise<InitMessage | null> | null = null;

	// Lazy WebSocket connect — returns cached InitMessage
	function ensureConnected(): Promise<InitMessage | null> {
		if (client.connected && cachedInitMessage) return Promise.resolve(cachedInitMessage);
		if (connectPromise) return connectPromise;

		connectPromise = (async () => {
			log('Connecting WebSocket to Hub...');
			try {
				const wsInitMsg = await client.connect(hubUrl!);
				log('WebSocket connected');
				if (wsInitMsg.config) hubConfig = wsInitMsg.config;
				cachedInitMessage = wsInitMsg;
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
			async execute(
				toolCallId: string,
				params: unknown,
				_signal: AbortSignal | undefined,
				_onUpdate: unknown,
				ctx: ExtensionContext,
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
			const result = await processActions(response.actions, ctx);

			// If there's a return value from processActions, use it
			if (result.returnValue !== undefined) {
				const text = typeof result.returnValue === 'string'
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
				const text = typeof returnAction.result === 'string'
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
			...(renderers?.renderCall && { renderCall: renderers.renderCall as ToolDefinition['renderCall'] }),
			...(renderers?.renderResult && { renderResult: renderers.renderResult as ToolDefinition['renderResult'] }),
		});
	}

	// ══════════════════════════════════════════════
	// Register task tools (LEAD only) from server's agent list
	// Agent names and configs come from the Hub, not hardcoded.
	// ══════════════════════════════════════════════

	if (!isSubAgent && serverAgents.length > 0) {
		const agentRegistry = new Map(serverAgents.map((a) => [a.name, a]));
		const agentNames = serverAgents.map((a) => a.name);

		log(`Registering task tools. Agents: ${agentNames.join(', ')}`);

		pi.registerTool({
			name: 'task',
			label: 'Delegate Task to Agent',
			description:
				`Delegate a task to a specialized agent on your team. ` +
				`Available agents: ${agentNames.join(', ')}. ` +
				`Each agent runs independently with its own context window.`,
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
			): Promise<AgentToolResult<unknown>> {
				const { description, prompt, subagent_type } = params as {
					description: string;
					prompt: string;
					subagent_type: string;
				};

				const agent = agentRegistry.get(subagent_type);
				if (!agent) {
					return {
						content: [{ type: 'text' as const, text: `Unknown agent: ${subagent_type}. Available: ${agentNames.join(', ')}` }],
						details: undefined as unknown,
					};
				}

				log(`Task: ${description} → ${subagent_type}`);

				try {
					const result = await runSubAgent(agent, prompt, client);
					return {
						content: [{ type: 'text' as const, text: result.output }],
						details: undefined as unknown,
					};
				} catch (err) {
					const errorMsg = err instanceof Error ? err.message : String(err);
					return {
						content: [{ type: 'text' as const, text: `Agent ${subagent_type} failed: ${errorMsg}` }],
						details: undefined as unknown,
					};
				}
			},
		});

		pi.registerTool({
			name: 'parallel_tasks',
			label: 'Delegate Parallel Tasks',
			description:
				`Run multiple agent tasks concurrently (max 4). ` +
				`Available agents: ${agentNames.join(', ')}.`,
			parameters: Type.Object({
				tasks: Type.Array(Type.Object({
					description: Type.String({ description: 'Short task description' }),
					prompt: Type.String({ description: 'Detailed instructions' }),
					subagent_type: Type.String({ description: 'Agent to delegate to' }),
				}), { maxItems: 4 }),
			}),
			async execute(
				toolCallId: string,
				params: unknown,
			): Promise<AgentToolResult<unknown>> {
				const { tasks } = params as {
					tasks: Array<{ description: string; prompt: string; subagent_type: string }>;
				};

				if (tasks.length > 4) {
					return {
						content: [{ type: 'text' as const, text: 'Maximum 4 concurrent tasks allowed.' }],
						details: undefined as unknown,
					};
				}

				log(`Parallel tasks: ${tasks.map((t) => `${t.subagent_type}:${t.description}`).join(', ')}`);

				const promises = tasks.map(async (task) => {
					const agent = agentRegistry.get(task.subagent_type);
					if (!agent) {
						return { agent: task.subagent_type, error: `Unknown agent: ${task.subagent_type}` };
					}
					try {
						const result = await runSubAgent(agent, task.prompt, client);
						return { agent: task.subagent_type, output: result.output, duration: result.duration };
					} catch (err) {
						return { agent: task.subagent_type, error: err instanceof Error ? err.message : String(err) };
					}
				});

				const results = await Promise.all(promises);
				const output = results
					.map((r) => {
						if ('error' in r && r.error) return `### ${r.agent} (FAILED)\n${r.error}`;
						return `### ${r.agent} (${'duration' in r ? r.duration : 0}ms)\n${'output' in r ? r.output : ''}`;
					})
					.join('\n\n---\n\n');

				return {
					content: [{ type: 'text' as const, text: output }],
					details: undefined as unknown,
				};
			},
		});
	}

	log('Tool registration complete');

	// ══════════════════════════════════════════════
	// Event Handlers
	// ══════════════════════════════════════════════

	function serializeEvent(event: unknown): Record<string, unknown> {
		const data: Record<string, unknown> = {};
		if (event && typeof event === 'object') {
			for (const [key, value] of Object.entries(event)) {
				if (typeof value !== 'function' && key !== 'signal') {
					try { JSON.stringify(value); data[key] = value; } catch { /* skip */ }
				}
			}
		}
		return data;
	}

	async function sendEvent(
		eventName: string,
		data: Record<string, unknown>,
		ctx: ExtensionContext,
	): Promise<unknown> {
		if (!client.connected) return undefined;

		const id = client.nextId();
		try {
			const response = await client.send({
				id,
				type: 'event',
				event: eventName,
				data: { ...data, agentRole },
			});
			const result = await processActions(response.actions, ctx);
			if (result.block) return result.block;
			if (result.returnValue !== undefined) return result.returnValue;
		} catch { /* ignore */ }
		return undefined;
	}

	const onEvent = pi.on.bind(pi) as GenericEventHandler;

	// session_start: establish WebSocket connection to Hub + set up footer
	onEvent('session_start', async (event: unknown, ctx: ExtensionContext) => {
		await ensureConnected();

		// Set up the Coder footer (token stats + Hub status)
		setupCoderFooter(ctx, () => client.connected);

		if (client.connected) {
			return sendEvent('session_start', serializeEvent(event), ctx);
		}
	});

	// before_agent_start: inject system prompt from Hub
	onEvent('before_agent_start', async (event: unknown, ctx: ExtensionContext) => {
		if (!client.connected) return undefined;

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

			const result = await processActions(response.actions, ctx);
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
		} catch { /* ignore */ }

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
			if (!client.connected) return undefined;
			return sendEvent(eventName, serializeEvent(event), ctx);
		});
	}

	// Clean up on shutdown
	pi.on('session_shutdown', async () => {
		log('Shutting down');
		client.close();
	});
}

// ══════════════════════════════════════════════
// In-Process Sub-Agent Execution
// Uses Pi's createAgentSession() for fast, context-isolated sub-agents.
// NO subprocess spawning — returns only getLastAssistantText(), not JSONL events.
// Pattern based on oh-my-pi's in-process executor.
// ══════════════════════════════════════════════

function truncateOutput(text: string): string {
	let result = text;
	const lines = result.split('\n');
	if (lines.length > MAX_OUTPUT_LINES) {
		result = lines.slice(0, MAX_OUTPUT_LINES).join('\n') +
			`\n\n[Output truncated — ${lines.length - MAX_OUTPUT_LINES} lines omitted]`;
	}
	if (result.length > MAX_OUTPUT_BYTES) {
		result = result.slice(0, MAX_OUTPUT_BYTES) +
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
	} catch { /* fall through to argv[1] resolution */ }

	// Resolve from Pi CLI binary (process.argv[1] → pi-coding-agent package root)
	const { realpathSync } = _require('node:fs') as typeof import('node:fs');
	const { pathToFileURL } = _require('node:url') as typeof import('node:url');
	const { dirname, join } = _require('node:path') as typeof import('node:path');

	const piRealPath = realpathSync(process.argv[1] || '');
	const piPkgDir = dirname(dirname(piRealPath));
	const piSdkEntry = pathToFileURL(join(piPkgDir, 'dist', 'index.js')).href;
	const piAiEntry = pathToFileURL(join(piPkgDir, 'node_modules', '@mariozechner', 'pi-ai', 'dist', 'index.js')).href;

	const piSdk = await import(piSdkEntry);
	const piAi = await import(piAiEntry);
	_piSdkCache = { piSdk, piAi };
	return _piSdkCache;
}

/**
 * Create a Pi-compatible tool that proxies execution to the Hub via WebSocket.
 * Used to give sub-agents access to Hub tools (memory, context7, etc.).
 */
function createHubToolProxy(toolDef: HubToolDefinition, hubClient: HubClient): Record<string, unknown> {
	return {
		name: toolDef.name,
		label: toolDef.label || toolDef.name,
		description: toolDef.description,
		parameters: toolDef.parameters,
		async execute(
			toolCallId: string,
			params: unknown,
		): Promise<{ content: Array<{ type: string; text: string }>; details: unknown }> {
			if (!hubClient.connected) {
				return {
					content: [{ type: 'text', text: `Hub not connected — cannot execute ${toolDef.name}` }],
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
					const text = typeof returnAction.result === 'string'
						? returnAction.result
						: JSON.stringify(returnAction.result, null, 2);
					return { content: [{ type: 'text', text }], details: undefined };
				}
				return { content: [{ type: 'text', text: 'Done' }], details: undefined };
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return { content: [{ type: 'text', text: `Hub tool error: ${msg}` }], details: undefined };
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
): Promise<{ output: string; duration: number }> {
	const startTime = Date.now();

	const { piSdk, piAi } = await loadPiSdk();
	// Runtime-resolved dynamic imports — exact types unavailable statically
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const { createAgentSession, DefaultResourceLoader, SessionManager, createCodingTools, createReadOnlyTools } = piSdk as any;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const { getModel } = piAi as any;

	// Model — use agent's configured model (sub-agents typically use haiku for speed)
	const modelId = agentConfig.model || 'claude-haiku-4-5';
	const [provider, id] = modelId.includes('/')
		? modelId.split('/', 2) as [string, string]
		: ['anthropic', modelId];
	const subModel = getModel(provider, id);

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
		noSkills: true,
		extensionFactories: hubTools.length > 0
			? [(pi: ExtensionAPI) => {
				for (const toolDef of hubTools) {
					// Proxy object has the correct shape; cast needed because return type is Record<string, unknown>
					pi.registerTool(createHubToolProxy(toolDef, hubClient) as unknown as ToolDefinition);
				}
			}]
			: [],
		systemPromptOverride: () => agentConfig.systemPrompt,
	});
	await subLoader.reload();

	// Select tools based on readOnly flag
	const cwd = process.cwd();
	const tools = agentConfig.readOnly
		? createReadOnlyTools(cwd)
		: createCodingTools(cwd);

	const { session } = await createAgentSession({
		// subModel is already untyped (from dynamic import) — createAgentSession is also dynamically imported
		model: subModel,
		thinkingLevel: (agentConfig.thinkingLevel || 'off') as 'off' | 'low' | 'medium' | 'high',
		tools,
		resourceLoader: subLoader,
		sessionManager: SessionManager.inMemory('/tmp'),
	});
	await session.bindExtensions({});

	log(`Sub-agent started: ${agentConfig.name} (model: ${modelId})`);

	// Timeout
	const timer = setTimeout(() => {
		log(`Sub-agent ${agentConfig.name} timed out after ${SUB_AGENT_TIMEOUT_MS}ms — aborting`);
		try { session.abort?.(); } catch { /* ignore */ }
	}, SUB_AGENT_TIMEOUT_MS);

	try {
		await session.prompt(task);
		clearTimeout(timer);

		// Only return the final assistant text — NOT intermediate JSONL events
		const output = session.getLastAssistantText?.() || '(no output)';
		const duration = Date.now() - startTime;
		log(`Sub-agent ${agentConfig.name} completed in ${duration}ms`);
		return { output: truncateOutput(output.trim()), duration };
	} catch (err) {
		clearTimeout(timer);
		try { session.abort?.(); } catch { /* ignore */ }
		throw err;
	}
}

export default agentuityCoderHub;
