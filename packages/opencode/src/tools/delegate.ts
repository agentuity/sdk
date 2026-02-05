import { z } from 'zod';
import type { AgentRole } from '../types';

// Schema for the delegate tool - includes all agents Lead can delegate to
// Note: Expert sub-agents (expert-backend, expert-frontend, expert-ops) are hidden
// and should only be invoked by the Expert orchestrator, not directly by Lead
export const DelegateArgsSchema = z.object({
	agent: z
		.enum([
			'scout',
			'builder',
			'architect',
			'reviewer',
			'memory',
			'reasoner',
			'expert',
			'expert-backend',
			'expert-frontend',
			'expert-ops',
			'runner',
			'product',
			'monitor',
		])
		.describe('The agent to delegate to'),
	task: z.string().describe('Clear description of the task to delegate'),
	context: z.string().optional().describe('Additional context from previous tasks'),
	waitForResult: z
		.boolean()
		.default(true)
		.describe('Whether to wait for the result before continuing'),
});

export type DelegateArgs = z.infer<typeof DelegateArgsSchema>;

// Agent display names for @mentions
const AGENT_MENTIONS: Record<Exclude<AgentRole, 'lead'>, string> = {
	scout: '@Agentuity Coder Scout',
	builder: '@Agentuity Coder Builder',
	architect: '@Agentuity Coder Architect',
	reviewer: '@Agentuity Coder Reviewer',
	memory: '@Agentuity Coder Memory',
	expert: '@Agentuity Coder Expert',
	'expert-backend': '@Agentuity Coder Expert Backend',
	'expert-frontend': '@Agentuity Coder Expert Frontend',
	'expert-ops': '@Agentuity Coder Expert Ops',
	runner: '@Agentuity Coder Runner',
	reasoner: '@Agentuity Coder Reasoner',
	product: '@Agentuity Coder Product',
	monitor: '@Agentuity Coder Monitor',
};

export const delegateTool = {
	name: 'agentuity_coder_delegate',
	description: `Delegate a task to a specialized Agentuity Coder agent.

Use this to:
- Scout: Explore codebase, find patterns, research documentation
- Builder: Implement features, write code, run tests (interactive work)
- Architect: Complex autonomous tasks, Cadence mode, deep reasoning (GPT Codex)
- Reviewer: Review changes, catch issues, apply fixes
- Memory: Store context, remember decisions across sessions
- Reasoner: Extract structured conclusions, resolve conflicts, surface corrections
- Expert: Get help with Agentuity CLI and cloud services
- Runner: Run lint/build/test/typecheck/format/clean/install commands, returns structured results
- Product: Drive clarity on requirements, validate features, track progress, Cadence briefings
- Monitor: Watch background tasks and report when they complete

The task will be executed by the specified agent and the result returned.`,

	args: DelegateArgsSchema,

	async execute(args: DelegateArgs, _context: unknown): Promise<{ output: string }> {
		const mention = AGENT_MENTIONS[args.agent as Exclude<AgentRole, 'lead'>];

		// Build the delegation prompt
		let prompt = `${mention}\n\n## Task\n${args.task}`;

		if (args.context) {
			prompt = `${mention}\n\n## Context\n${args.context}\n\n## Task\n${args.task}`;
		}

		// In Open Code, this would trigger the Task tool with the appropriate agent
		// For now, return the formatted prompt that Lead should use
		return {
			output: `To delegate this task, use the Task tool with this prompt:\n\n${prompt}\n\nThe ${args.agent} agent will handle this task.`,
		};
	},
};

export default delegateTool;
