import { z } from 'zod';
import { getCommand } from '../../../command-prefix.ts';
import { spawnInherit } from '../../../node-compat/proc.ts';
import * as tui from '../../../tui.ts';
import { type CommandContext, createSubcommand } from '../../../types.ts';

const RunArgsSchema = z.object({
	task: z.string().describe('The task description to execute'),
});

const RunOptionsSchema = z.object({
	sandbox: z.boolean().optional().describe('Run in a cloud sandbox environment'),
	json: z.boolean().optional().describe('Output raw JSON events'),
});

export const runSubcommand = createSubcommand({
	name: 'run',
	description: 'Run a task with the Agentuity Coder agent team (non-interactive)',
	tags: ['slow'],
	requires: { auth: true },
	schema: {
		args: RunArgsSchema,
		options: RunOptionsSchema,
	},
	examples: [
		{
			command: getCommand('ai opencode run "implement dark mode toggle"'),
			description: 'Run a coding task',
		},
		{
			command: getCommand('ai opencode run --sandbox "run the test suite"'),
			description: 'Run in a cloud sandbox',
		},
		{
			command: getCommand('ai opencode run --json "fix the bug"'),
			description: 'Output raw JSON events',
		},
	],
	async handler(
		ctx: CommandContext<{ auth: true }, undefined, typeof RunArgsSchema, typeof RunOptionsSchema>
	) {
		const { logger, args, opts } = ctx;
		const { task } = args;
		const sandbox = opts?.sandbox;
		const json = opts?.json;

		if (!json) {
			tui.newline();
			tui.output(tui.bold('Agentuity Coder'));
			tui.newline();
			tui.output(`${tui.ICONS.arrow} Running task: ${task}`);
			if (sandbox) {
				tui.info('Sandbox mode enabled');
			}
			tui.newline();
		}

		const openCodeArgs = ['run', '--agent', 'Agentuity Coder Lead'];

		if (json) {
			openCodeArgs.push('--format', 'json');
		}

		// Build the task prompt with any mode prefixes
		let taskPrompt = task;

		// Always add non-interactive tag for headless execution
		taskPrompt = `[NON-INTERACTIVE: Running headlessly without user input. Do NOT use Interview Mode. Make reasonable assumptions and document them. Continue autonomously until complete.] ${taskPrompt}`;

		if (sandbox) {
			taskPrompt = `[SANDBOX MODE: Execute all code in an Agentuity cloud sandbox, not locally] ${taskPrompt}`;
		}
		if (json) {
			taskPrompt = `[JSON OUTPUT: Your final response MUST be a valid JSON object with this structure: {"status": "success" | "failed" | "partial", "summary": "Brief description of what was done", "filesChanged": ["path/to/file.ts"], "errors": ["error message if any"], "payload": <any task-specific return data or null>}. Output ONLY the JSON, no other text.] ${taskPrompt}`;
		}

		openCodeArgs.push(taskPrompt);

		logger.debug(`Spawning: opencode ${openCodeArgs.join(' ')}`);

		const { exitCode } = await spawnInherit({
			cmd: ['opencode', ...openCodeArgs],
			env: {
				AGENTUITY_CODER_MODE: 'non-interactive',
				AGENTUITY_AGENT_MODE: 'opencode',
				// Pass through profile if set
				...(process.env.AGENTUITY_PROFILE
					? { AGENTUITY_PROFILE: process.env.AGENTUITY_PROFILE }
					: {}),
			},
		});

		// In JSON mode, let opencode's output speak for itself - exit code indicates success
		if (json) {
			process.exit(exitCode ?? 1);
		}

		if (exitCode === 0) {
			tui.newline();
			tui.success('Task completed');
		} else {
			tui.newline();
			tui.error(`Task failed with exit code ${exitCode}`);
		}

		return { success: exitCode === 0, task, exitCode: exitCode ?? 1, sandbox: !!sandbox };
	},
});

export default runSubcommand;
