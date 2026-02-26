import type {
	AgentToolResult,
	ExtensionAPI,
	ExtensionContext,
	ExtensionCommandContext,
} from '@mariozechner/pi-coding-agent';
import type { TSchema } from '@sinclair/typebox';
import { HubClient } from './client.ts';
import { processActions } from './handlers.ts';
import type { HubResponse, InitMessage } from './protocol.ts';

const HUB_URL_ENV = 'AGENTUITY_CODER_HUB_URL';

// All Pi events we subscribe to (order matters — session_start is handled separately)
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

// Generic event handler type for the iteration loop
type GenericEventHandler = (
	event: string,
	handler: (event: unknown, ctx: ExtensionContext) => Promise<unknown>
) => void;

function log(msg: string): void {
	console.error(`[agentuity-pi] ${msg}`);
}

export function agentuityCoderHub(pi: ExtensionAPI) {
	const hubUrl = process.env[HUB_URL_ENV];

	// No-op if not configured
	if (!hubUrl) {
		return;
	}

	log(`Hub URL: ${hubUrl}`);

	const client = new HubClient();

	// Connect to the Hub and register tools/commands
	async function connectAndRegister(): Promise<void> {
		if (client.connected) return;

		log('Connecting to Hub...');
		let initMsg: InitMessage;

		try {
			initMsg = await client.connect(hubUrl!);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			log(`Failed to connect: ${msg}`);
			return;
		}

		log(
			`Connected. Init: ${initMsg.tools?.length ?? 0} tools, ${initMsg.commands?.length ?? 0} commands`
		);

		// Register tools from Hub
		if (initMsg.tools) {
			for (const toolDef of initMsg.tools) {
				log(`Registering tool: ${toolDef.name}`);
				pi.registerTool({
					name: toolDef.name,
					label: toolDef.label,
					description: toolDef.description,
					parameters: toolDef.parameters as unknown as TSchema,
					async execute(
						toolCallId: string,
						params: unknown,
						_signal: AbortSignal | undefined,
						_onUpdate: unknown,
						ctx: ExtensionContext
					) {
						log(`Tool execute: ${toolDef.name}`);
						const id = client.nextId();
						let response: HubResponse;

						try {
							response = await client.send({
								id,
								type: 'tool',
								name: toolDef.name,
								toolCallId,
								params: params as Record<string, unknown>,
							});
						} catch {
							return {
								content: [
									{
										type: 'text' as const,
										text: 'Error: Hub connection lost',
									},
								],
								details: {},
							};
						}

						const result = await processActions(response.actions, ctx);

						if (result.returnValue !== undefined) {
							return result.returnValue as AgentToolResult<unknown>;
						}

						return {
							content: [{ type: 'text' as const, text: 'Done' }],
							details: {},
						};
					},
				});
			}
		}

		// Register commands from Hub
		if (initMsg.commands) {
			for (const cmdDef of initMsg.commands) {
				log(`Registering command: /${cmdDef.name}`);
				pi.registerCommand(cmdDef.name, {
					description: cmdDef.description,
					handler: async (args: string, ctx: ExtensionCommandContext) => {
						log(`Command execute: /${cmdDef.name}`);
						const id = client.nextId();
						let response: HubResponse;

						try {
							response = await client.send({
								id,
								type: 'command',
								name: cmdDef.name,
								args,
							});
						} catch {
							ctx.ui.notify('Hub connection lost', 'error');
							return;
						}

						await processActions(response.actions, ctx);
					},
				});
			}
		}

		log('Registration complete');
	}

	// Helper to send event and process response actions
	async function sendEvent(
		eventName: string,
		data: Record<string, unknown>,
		ctx: ExtensionContext
	): Promise<unknown> {
		if (!client.connected) return undefined;

		const id = client.nextId();
		let response: HubResponse;

		try {
			response = await client.send({
				id,
				type: 'event',
				event: eventName,
				data,
			});
		} catch {
			return undefined;
		}

		const result = await processActions(response.actions, ctx);

		if (result.block) return result.block;
		if (result.returnValue !== undefined) return result.returnValue;
		return undefined;
	}

	// Serialize event data — strip non-serializable fields
	function serializeEvent(event: unknown): Record<string, unknown> {
		const data: Record<string, unknown> = {};
		if (event && typeof event === 'object') {
			for (const [key, value] of Object.entries(event)) {
				if (typeof value !== 'function' && key !== 'signal') {
					try {
						JSON.stringify(value);
						data[key] = value;
					} catch {
						// Skip non-serializable values
					}
				}
			}
		}
		return data;
	}

	// Cast pi.on to generic handler since we iterate over a union of event names
	// TypeScript overloads require exact string literal matching which doesn't work in loops
	const onEvent = pi.on.bind(pi) as GenericEventHandler;

	// ── session_start: connect + register BEFORE Pi builds the tool list ──
	onEvent('session_start', async (event: unknown, ctx: ExtensionContext) => {
		await connectAndRegister();

		if (client.connected) {
			return sendEvent('session_start', serializeEvent(event), ctx);
		}
	});

	for (const eventName of PROXY_EVENTS) {
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

export default agentuityCoderHub;
