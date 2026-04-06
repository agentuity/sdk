/**
 * Slash commands for routing to specific Coder agents.
 *
 * Registers /lead, /memory, /product, etc. that prefix the user's
 * message with routing instructions so the lead agent delegates
 * to the specified agent.
 *
 * When the user types `/memory what happened last session`, the command
 * handler sends a user message with a routing prefix that the lead agent
 * recognizes and delegates accordingly.
 */
import type { ExtensionAPI, ExtensionCommandContext } from '@mariozechner/pi-coding-agent';
import type { AgentDefinition } from './protocol.ts';
import { handleReview } from './review.ts';

type HubStatus = 'connected' | 'reconnecting' | 'offline';

const DEBUG = !!process.env.AGENTUITY_DEBUG;

function log(msg: string): void {
	if (DEBUG) console.error(`[agentuity-coder] ${msg}`);
}

/**
 * Register slash commands for each Hub agent.
 * When invoked, the command sends a user message prefixed with a routing directive
 * so the lead agent knows to delegate to the specified agent.
 */
export function registerAgentCommands(
	pi: ExtensionAPI,
	agents: AgentDefinition[],
	getHubStatus: () => HubStatus,
	openAgentManager?: (ctx: ExtensionCommandContext) => Promise<void>,
	openChainEditor?: (ctx: ExtensionCommandContext, initialAgents: string[]) => Promise<void>
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
				pi.sendUserMessage(`@${name} ${trimmed}`, { deliverAs: 'followUp' });
			},
		});
	}

	// Register the /agents command that lists all available agents
	pi.registerCommand('agents', {
		description: 'List all available Coder agents',
		handler: async (_args, ctx) => {
			if (ctx.hasUI && openAgentManager) {
				await openAgentManager(ctx);
				return;
			}

			const lines = agents.map((a) => {
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

	pi.registerCommand('chain', {
		description: 'Open chain editor to compose multi-agent execution',
		handler: async (args, ctx) => {
			if (!ctx.hasUI || !openChainEditor) {
				if (ctx.hasUI) {
					ctx.ui.notify('Chain editor requires an interactive UI session.', 'warning');
				}
				return;
			}

			const initialAgents = args
				.split(/\s+/)
				.map((part) => part.trim())
				.filter((part) => part.length > 0);

			await openChainEditor(ctx, initialAgents);
		},
	});

	// Register the /status command that shows current session status
	pi.registerCommand('status', {
		description: 'Show current session status',
		handler: async (_args, ctx) => {
			const hubStatus = getHubStatus();
			const lines: string[] = [];
			lines.push('Coder Status');
			lines.push(`  Status: ${hubStatus}`);
			lines.push(`  Agents: ${agents.length} available`);
			lines.push(
				`  ${agents
					.map((a) => {
						const model = a.model || 'default';
						return `${a.name} [${model}]`;
					})
					.join(', ')}`
			);
			const message = lines.join('\n');
			if (ctx.hasUI) {
				ctx.ui.notify(message, 'info');
			}
		},
	});

	// Register /review command for interactive code reviews
	pi.registerCommand('review', {
		description: 'Launch interactive code review',
		handler: async (args, ctx) => {
			await handleReview(args, ctx, pi);
		},
	});

	log(`Registered ${agents.length} agent commands + /agents + /chain + /status + /review`);
}
