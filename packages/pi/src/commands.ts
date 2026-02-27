/**
 * Slash commands for routing to specific Coder Hub agents.
 *
 * Registers /lead, /memory, /product, etc. that prefix the user's
 * message with routing instructions so the lead agent delegates
 * to the specified agent.
 *
 * When the user types `/memory what happened last session`, the command
 * handler sends a user message with a routing prefix that the lead agent
 * recognizes and delegates accordingly.
 */
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import type { AgentDefinition } from './protocol.ts';

const DEBUG = !!process.env['AGENTUITY_DEBUG'];

function log(msg: string): void {
	if (DEBUG) console.error(`[agentuity-pi] ${msg}`);
}

/**
 * Register slash commands for each Hub agent.
 * When invoked, the command sends a user message prefixed with a routing directive
 * so the lead agent knows to delegate to the specified agent.
 */
export function registerAgentCommands(
	pi: ExtensionAPI,
	agents: AgentDefinition[],
	isHubConnected: () => boolean,
): void {
	for (const agent of agents) {
		const name = agent.name;
		log(`Registering command: /${name}`);

		pi.registerCommand(name, {
			description: `Route to ${name} agent: ${agent.description}`,
			handler: async (args, ctx) => {
				const trimmed = args.trim();
				if (!trimmed) {
					if (ctx.hasUI) {
						ctx.ui.notify(`Usage: /${name} <message>`, 'info');
					}
					return;
				}
				// Send a user message with routing prefix.
				// The lead agent's system prompt recognizes [ROUTE TO: <agent>]
				// and delegates to that agent.
				pi.sendUserMessage(`@${name} ${trimmed}`);
			},
		});
	}

	// Register the /agents command that lists all available agents
	pi.registerCommand('agents', {
		description: 'List all available Coder Hub agents',
		handler: async (_args, ctx) => {
			const lines = agents.map(a => {
				const model = a.model ? ` [${a.model}]` : '';
				const caps = a.capabilities?.length ? ` (${a.capabilities.join(', ')})` : '';
				const readOnly = a.readOnly ? ' [read-only]' : '';
				return `  ${a.name}${model}${readOnly}\n    ${a.description}${caps}`;
			});
			const message = `Available agents:\n${lines.join('\n')}`;
			if (ctx.hasUI) {
				ctx.ui.notify(message, 'info');
			}
		},
	});

	// Register the /status command that shows current session status
	pi.registerCommand('status', {
		description: 'Show current session status',
		handler: async (_args, ctx) => {
			const lines: string[] = [];
			lines.push('Coder Hub Status');
			lines.push(`  Hub: ${isHubConnected() ? 'connected' : 'disconnected'}`);
			lines.push(`  Agents: ${agents.length} available`);
			lines.push(`  ${agents.map(a => {
				const model = a.model || 'default';
				return `${a.name} [${model}]`;
			}).join(', ')}`);
			const message = lines.join('\n');
			if (ctx.hasUI) {
				ctx.ui.notify(message, 'info');
			}
		},
	});

	log(`Registered ${agents.length} agent commands + /agents + /status`);
}
