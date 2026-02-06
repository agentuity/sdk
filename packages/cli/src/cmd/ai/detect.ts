import { createSubcommand } from '../../types';
import { getExecutingAgent, getAgentDisplayName, KNOWN_AGENTS } from '../../agent-detection';
import { getCommand } from '../../command-prefix';
import * as tui from '../../tui';

export const detectSubcommand = createSubcommand({
	name: 'detect',
	description: 'Detect if the CLI is being run from a known AI coding agent',
	tags: ['read-only', 'fast'],
	idempotent: true,
	examples: [
		{ command: getCommand('ai detect'), description: 'Detect the executing agent' },
		{ command: getCommand('ai detect --json'), description: 'Output detection result as JSON' },
	],
	handler(ctx) {
		const agentId = getExecutingAgent();
		const agentName = agentId ? getAgentDisplayName(agentId) : null;

		if (ctx.options.json) {
			tui.json({
				id: agentId ?? null,
				name: agentName,
			});
			// Exit with code 1 when no agent detected (consistent with non-JSON mode)
			if (!agentId) {
				process.exit(1);
			}
			return;
		}

		if (agentId) {
			tui.success(`Detected agent: ${agentName} (${agentId})`);
		} else {
			tui.newline();
			tui.info('No AI coding agent detected.');
			tui.newline();
			console.log(`  This CLI can detect when it's being run by an AI coding agent.`);
			console.log(`  Currently supported agents:\n`);
			for (const [, id] of KNOWN_AGENTS) {
				console.log(`    - ${getAgentDisplayName(id)} (${id})`);
			}
			tui.newline();
			console.log(`  You can also set the ${tui.colorPrimary('AGENTUITY_AGENT_MODE')} environment variable`);
			console.log(`  to manually specify the agent.\n`);

			// Exit with code 1 when no agent detected (non-JSON mode)
			process.exit(1);
		}
	},
});

export default detectSubcommand;
