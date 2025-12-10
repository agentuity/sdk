/**
 * CLI Deployment Agent
 *
 * Executes Agentuity CLI commands via subprocess for deployment operations.
 * Tests the full deployment workflow: deploy, list, show, rollback, undeploy.
 */

import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
import { runCLI, runCLIJSON } from '@test/helpers/cli';

const cliDeploymentAgent = createAgent('cli', {
	description: 'Execute CLI commands for deployment, API keys, and other operations',
	schema: {
		input: s.object({
			command: s.string(), // 'deploy', 'undeploy', 'list', 'show', 'rollback', etc.
			args: s.array(s.string()).optional(), // Additional arguments
			expectJSON: s.boolean().optional(), // Whether to parse JSON output
		}),
		output: s.object({
			command: s.string(),
			success: s.boolean(),
			exitCode: s.number(),
			stdout: s.string().optional(),
			stderr: s.string().optional(),
			json: s.any().optional(), // Parsed JSON if available
		}),
	},
	handler: async (ctx, input) => {
		const { command, args = [], expectJSON = false } = input;

		// Build full CLI arguments
		const cliArgs = command.split(' ').concat(args);

		// Execute CLI
		const result = expectJSON ? await runCLIJSON(cliArgs) : await runCLI(cliArgs);

		return {
			command,
			success: result.exitCode === 0,
			exitCode: result.exitCode,
			stdout: result.stdout,
			stderr: result.stderr,
			json: result.json,
		};
	},
});

export default cliDeploymentAgent;
