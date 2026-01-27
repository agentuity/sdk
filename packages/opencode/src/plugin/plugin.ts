import type { PluginInput, Hooks } from '@opencode-ai/plugin';
import type { AgentConfig, CommandDefinition } from '../types';
import { agents } from '../agents';
import { loadCoderConfig, getDefaultConfig, mergeConfig } from '../config';
import { createSessionHooks } from './hooks/session';
import { createToolHooks } from './hooks/tools';
import { createKeywordHooks } from './hooks/keyword';
import { createParamsHooks } from './hooks/params';
import { createCadenceHooks } from './hooks/cadence';
import { createSessionMemoryHooks } from './hooks/session-memory';
import { z } from 'zod';
import type { AgentRole } from '../types';

// Agent display names for @mentions
const AGENT_MENTIONS: Record<AgentRole, string> = {
	lead: '@Agentuity Coder Lead',
	scout: '@Agentuity Coder Scout',
	builder: '@Agentuity Coder Builder',
	reviewer: '@Agentuity Coder Reviewer',
	memory: '@Agentuity Coder Memory',
	expert: '@Agentuity Coder Expert',
};

export async function createCoderPlugin(ctx: PluginInput): Promise<Hooks> {
	ctx.client.app.log({
		body: {
			service: 'agentuity-coder',
			level: 'info',
			message: 'Agentuity Coder plugin initializing',
		},
	});

	const userConfig = await loadCoderConfig();
	const coderConfig = mergeConfig(getDefaultConfig(), userConfig);

	const sessionHooks = createSessionHooks(ctx, coderConfig);
	const toolHooks = createToolHooks(ctx, coderConfig);
	const keywordHooks = createKeywordHooks(ctx, coderConfig);
	const paramsHooks = createParamsHooks(ctx, coderConfig);
	const cadenceHooks = createCadenceHooks(ctx, coderConfig);

	// Session memory hooks handle checkpointing and compaction for non-Cadence sessions
	// Orchestration (deciding which module handles which session) happens below in the hooks
	const sessionMemoryHooks = createSessionMemoryHooks(ctx, coderConfig);

	const configHandler = createConfigHandler(coderConfig);

	// Get the tool helper from Open Code context if available
	const toolHelper = (ctx as { tool?: unknown }).tool as
		| ((schema: (s: typeof z) => unknown) => unknown)
		| undefined;

	const tools = toolHelper ? createTools(toolHelper) : undefined;

	// Show startup toast (fire and forget, don't block)
	try {
		ctx.client.tui.showToast({
			body: { message: '🚀 Agentuity Coder ready', variant: 'success' },
		});
	} catch {
		// Toast may not be available
	}

	return {
		...(tools ? { tool: tools } : {}),
		config: configHandler,
		'chat.message': async (input: unknown, output: unknown) => {
			await keywordHooks.onMessage(input, output);
			await sessionHooks.onMessage(input, output);
			await cadenceHooks.onMessage(input, output);
		},
		'chat.params': paramsHooks.onParams,
		'tool.execute.before': toolHooks.before,
		'tool.execute.after': toolHooks.after,
		event: async (input) => {
			// Orchestrate: route to appropriate module based on session type
			const sessionId = extractSessionIdFromEvent(input);
			if (sessionId && cadenceHooks.isActiveCadenceSession(sessionId)) {
				await cadenceHooks.onEvent(input);
			} else if (sessionId) {
				// Non-Cadence sessions - handle session.compacted for checkpointing
				await sessionMemoryHooks.onEvent(
					input as { event: { type: string; properties?: Record<string, unknown> } }
				);
			}
		},
		'experimental.session.compacting': async (input, output) => {
			// Orchestrate: route to appropriate module based on session type
			if (cadenceHooks.isActiveCadenceSession(input.sessionID)) {
				await cadenceHooks.onCompacting(input, output);
			} else {
				await sessionMemoryHooks.onCompacting(input, output);
			}
		},
	};
}

function createConfigHandler(
	coderConfig: ReturnType<typeof getDefaultConfig>
): (config: Record<string, unknown>) => Promise<void> {
	return async (config: Record<string, unknown>) => {
		const agentConfigs = createAgentConfigs(coderConfig);
		const commands = createCommands();

		config.agent = {
			...(config.agent as Record<string, AgentConfig> | undefined),
			...agentConfigs,
		};

		config.command = {
			...(config.command as Record<string, CommandDefinition> | undefined),
			...commands,
		};
	};
}

function createAgentConfigs(
	config: ReturnType<typeof getDefaultConfig>
): Record<string, AgentConfig> {
	const result: Record<string, AgentConfig> = {};

	for (const agent of Object.values(agents)) {
		const modelConfig = config.agents?.[agent.role];

		// Convert tools.exclude to Open Code format (tool: false)
		const tools: Record<string, boolean> = {};
		if (agent.tools?.exclude) {
			for (const tool of agent.tools.exclude) {
				tools[tool] = false;
			}
		}

		result[agent.displayName] = {
			description: agent.description,
			model: modelConfig?.model ?? agent.defaultModel,
			prompt: agent.systemPrompt,
			mode: agent.mode ?? 'subagent',
			...(Object.keys(tools).length > 0 ? { tools } : {}),
			// Pass through thinking/reasoning settings
			...(agent.variant ? { variant: agent.variant } : {}),
			...(agent.temperature !== undefined ? { temperature: agent.temperature } : {}),
			...(agent.maxSteps !== undefined ? { maxSteps: agent.maxSteps } : {}),
		};
	}

	return result;
}

function createCommands(): Record<string, CommandDefinition> {
	return {
		'agentuity-coder': {
			name: 'agentuity-coder',
			description:
				'Run a task with the Agentuity Coder agent team (use @Agentuity Coder Lead, @Agentuity Coder Scout, etc.)',
			template: `<coder-mode>
You are the Agentuity Coder Lead agent orchestrating the Agentuity Coder team.

## Your Team (use @mentions to invoke)
- **@Agentuity Coder Scout**: Explore codebase, find patterns, research docs (read-only)
- **@Agentuity Coder Builder**: Implement features, write code, run tests
- **@Agentuity Coder Reviewer**: Review changes, catch issues, apply fixes
- **@Agentuity Coder Memory**: Store context, remember decisions
- **@Agentuity Coder Expert**: Agentuity CLI and cloud services specialist

## Task
$ARGUMENTS

## Guidelines
1. Use @Agentuity Coder Scout first to understand context
2. Delegate implementation to @Agentuity Coder Builder
3. Have @Agentuity Coder Reviewer check the work
4. Use @Agentuity Coder Expert for Agentuity CLI questions
5. Only use cloud services when genuinely helpful
6. **When done, tell @Agentuity Coder Memory to memorialize the session**
</coder-mode>`,
			agent: 'Agentuity Coder Lead',
			argumentHint: '"task description"',
		},
		'agentuity-memory-save': {
			name: 'agentuity-memory-save',
			description: 'Save the current session to memory for future recall',
			template: `Memorialize this session. Summarize what was accomplished in this conversation:
- Problem/task that was addressed
- Key decisions and their rationale  
- Corrections/mistakes (user corrected agent or agent corrected user)
- Patterns and approaches used
- Solutions implemented
- Files and folders referenced
- Open questions or follow-ups

Save to vector storage using the agentuity-opencode-sessions namespace. Store any corrections prominently in agentuity-opencode-memory KV.

$ARGUMENTS`,
			agent: 'Agentuity Coder Memory',
			argumentHint: '(optional additional context)',
		},

		// ─────────────────────────────────────────────────────────────────────
		// Agentuity Cloud Service Commands
		// ─────────────────────────────────────────────────────────────────────

		'agentuity-cloud': {
			name: 'agentuity-cloud',
			description: '☁️ Agentuity cloud services (KV, Storage, Vector, Sandbox, DB, SSH, etc.)',
			template: `You are the Agentuity Coder Expert helping with Agentuity cloud services.

Use the \`agentuity\` CLI to execute the user's request.

## Available Services
| Service | CLI | Purpose |
|---------|-----|---------|
| KV | \`agentuity cloud kv\` | Key-value storage (namespaces, keys) |
| Storage | \`agentuity cloud storage\` | Object/file storage (buckets) |
| Vector | \`agentuity cloud vector\` | Embeddings & semantic search |
| Sandbox | \`agentuity cloud sandbox\` | Isolated execution environments |
| Database | \`agentuity cloud db\` | Postgres databases |
| SSH | \`agentuity cloud ssh\` | SSH into deployments/sandboxes |
| Deployments | \`agentuity cloud deployment\` | Manage deployments |
| Agents | \`agentuity cloud agent\` | Cloud agent management |
| Sessions | \`agentuity cloud session\` | Agent session data |
| Threads | \`agentuity cloud thread\` | Conversation threads |

## Guidelines
1. First check auth: \`agentuity auth whoami\`
2. Prefer \`--json\` for programmatic output
3. List/inspect before creating new resources
4. Explain what commands you're running

## User Request
$ARGUMENTS`,
			agent: 'Agentuity Coder Expert',
			subtask: true,
			argumentHint: '"list kv namespaces" or "upload file.txt to storage"',
		},

		'agentuity-sandbox': {
			name: 'agentuity-sandbox',
			description: '🏖️ Agentuity sandboxes (isolated execution environments)',
			template: `You are the Agentuity Coder Expert helping with Agentuity sandboxes.

Use the \`agentuity cloud sandbox\` CLI commands to help the user.

## Common Commands
\`\`\`bash
agentuity cloud sandbox runtime list --json                            # List available runtimes (bun:1, python:3.14, etc.)
agentuity cloud sandbox run [--memory 1Gi] [--cpu 1000m] \\
  [--runtime <name>] [--runtimeId <id>] \\
  [--name <name>] [--description <text>] \\
  -- <command>                                                         # One-shot execution
agentuity cloud sandbox create --json [--memory 1Gi] [--cpu 1000m] \\
  [--network] [--runtime <name>] [--runtimeId <id>] \\
  [--name <name>] [--description <text>]                              # Create persistent sandbox
agentuity cloud sandbox list --json                                   # List sandboxes (includes telemetry)
agentuity cloud sandbox exec <id> -- <command>                        # Run in existing sandbox
agentuity cloud sandbox files <id> [path] --json                      # List files
agentuity cloud sandbox cp ./local <id>:/home/agentuity               # Copy files to sandbox
agentuity cloud sandbox delete <id> --json                            # Delete sandbox
agentuity cloud sandbox snapshot create <id> \\
  [--name <name>] [--description <text>] [--tag <tag>]                # Save sandbox state
\`\`\`

## Guidelines
1. First check auth: \`agentuity auth whoami\`
2. Use \`--json\` for programmatic output
3. Explain what commands you're running
4. Default working directory inside sandboxes: \`/home/agentuity\`
5. Use \`runtime list\` to find runtimes, then pass \`--runtime\` or \`--runtimeId\` on \`run\`/\`create\`
6. Use \`--name\` and \`--description\` for better tracking
7. Snapshot \`--tag\` defaults to \`latest\`, max 128 chars, must match \`^[a-zA-Z0-9][a-zA-Z0-9._-]*$\`
8. Telemetry fields from \`list\`/\`get\`: \`cpuTimeMs\`, \`memoryByteSec\`, \`networkEgressBytes\`, \`networkEnabled\`, \`mode\`

## User Request
$ARGUMENTS`,
			agent: 'Agentuity Coder Expert',
			subtask: true,
			argumentHint: '"run bun test" or "create a sandbox with 2Gi memory"',
		},

		// ─────────────────────────────────────────────────────────────────────
		// Agentuity Cadence Commands (Long-Running Tasks)
		// ─────────────────────────────────────────────────────────────────────

		'agentuity-cadence': {
			name: 'agentuity-cadence',
			description: '🔄 Start a long-running Cadence loop (autonomous task completion)',
			template: `[CADENCE MODE]

You are the Agentuity Coder Lead in **Cadence mode** — a long-running autonomous loop.

## Your Team (use @mentions to invoke)
- **@Agentuity Coder Scout**: Explore codebase, find patterns, research docs (read-only)
- **@Agentuity Coder Builder**: Implement features, write code, run tests
- **@Agentuity Coder Reviewer**: Review changes, catch issues, apply fixes
- **@Agentuity Coder Memory**: Store context, remember decisions, checkpoints
- **@Agentuity Coder Expert**: Agentuity CLI and cloud services specialist

## Task
$ARGUMENTS

## Cadence Workflow

1. **Initialize loop state**:
   - Generate loop ID (format: \`lp_short_name_01\`)
   - Store in KV: \`agentuity cloud kv set agentuity-opencode-tasks "loop:{loopId}:state" '{...}'\`

2. **Each iteration**:
   - Ask @Agentuity Coder Memory for relevant context
   - Use @Agentuity Coder Scout to understand what's needed
   - Delegate implementation to @Agentuity Coder Builder
   - Have @Agentuity Coder Reviewer verify the work
   - Tell @Agentuity Coder Memory to store checkpoint

3. **When truly complete**, output:
\`\`\`
<promise>DONE</promise>
\`\`\`

4. **Tell @Agentuity Coder Memory to memorialize** the completed session

## Guidelines
- **Always delegate** — use Scout for research, Builder for code, Reviewer for verification
- Ask Memory for context at each iteration start
- Store checkpoints at each iteration end
- If stuck, ask Scout to re-evaluate before pausing
- Use @Agentuity Coder Expert for sandbox/cloud operations
- Respect max iterations (50 default)`,
			agent: 'Agentuity Coder Lead',
			argumentHint: 'build the new auth feature with tests',
		},
	};
}

function createTools(tool: (schema: (s: typeof z) => unknown) => unknown): Hooks['tool'] {
	const coderDelegate = tool((s) => ({
		description: `Delegate a task to a specialized Agentuity Coder agent.

Use this to:
- Scout: Explore codebase, find patterns, research documentation
- Builder: Implement features, write code, run tests
- Reviewer: Review changes, catch issues, apply fixes
- Memory: Store context, remember decisions across sessions
- Expert: Get help with Agentuity CLI and cloud services`,
		args: s.object({
			agent: s
				.enum(['scout', 'builder', 'reviewer', 'memory', 'expert'])
				.describe('Which agent to delegate to'),
			task: s.string().describe('Clear description of the task'),
			context: s.string().optional().describe('Additional context from previous tasks'),
		}),
		execute: async (args: { agent: AgentRole; task: string; context?: string }) => {
			const mention = AGENT_MENTIONS[args.agent];
			let prompt = `${mention}\n\n## Task\n${args.task}`;
			if (args.context) {
				prompt = `${mention}\n\n## Context\n${args.context}\n\n## Task\n${args.task}`;
			}
			return {
				output: `To delegate this task, use the Task tool with this prompt:\n\n${prompt}\n\nThe ${args.agent} agent will handle this task.`,
			};
		},
	}));

	// Type assertion needed because the tool() helper returns unknown
	// but the runtime type is correct (it's created by OpenCode's tool helper)
	return {
		coder_delegate: coderDelegate,
	} as Hooks['tool'];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

function extractSessionIdFromEvent(input: unknown): string | undefined {
	if (typeof input !== 'object' || input === null) return undefined;

	const inp = input as { event?: { properties?: Record<string, unknown> } };
	if (!inp.event?.properties) return undefined;

	return (
		(inp.event.properties.sessionId as string | undefined) ??
		(inp.event.properties.sessionID as string | undefined)
	);
}
