import type { PluginInput, Hooks } from '@opencode-ai/plugin';
import { tool } from '@opencode-ai/plugin';
import type { AgentConfig, CommandDefinition } from '../types';
import { loadAllSkills, type LoadedSkill } from '../skills';
import { agents } from '../agents';
import { loadCoderConfig, getDefaultConfig, mergeConfig, validateAndWarnConfigs } from '../config';
import { createSessionHooks } from './hooks/session';
import { createToolHooks, getCoderProfile } from './hooks/tools';
import { createKeywordHooks } from './hooks/keyword';
import { createParamsHooks } from './hooks/params';
import { createCadenceHooks } from './hooks/cadence';
import { createSessionMemoryHooks } from './hooks/session-memory';
import type { AgentRole } from '../types';
import { BackgroundManager } from '../background';
import { TmuxSessionManager } from '../tmux';
import { checkAuth } from '../services/auth';

// Sandbox environment detection
const SANDBOX_ID = process.env.AGENTUITY_SANDBOX_ID;
const IN_SANDBOX = !!SANDBOX_ID;

// Sandbox context injected into Lead, Builder, and Architect prompts
const SANDBOX_CONTEXT = IN_SANDBOX
	? `
## Sandbox Environment

You are running inside an Agentuity Sandbox (ID: ${SANDBOX_ID}).

**Permissions:** All file operations are allowed without prompts.

**File Locations:**
- Working directory: \`/home/agentuity\`
- Temp files: \`/home/agentuity/tmp/\` (preferred over \`/tmp/\`)
- Artifacts: \`/home/agentuity/.agentuity/\`

**Tips:**
- No permission prompts - you can read/write freely
- Sandbox is isolated - safe to experiment
- Use \`/home/agentuity/\` paths for all file operations
`
	: '';

// Agents that should receive sandbox context in their prompts
const SANDBOX_AWARE_AGENTS: AgentRole[] = ['lead', 'builder', 'architect'];

// Agent display names for @mentions
const AGENT_MENTIONS: Record<AgentRole, string> = {
	lead: '@Agentuity Coder Lead',
	scout: '@Agentuity Coder Scout',
	builder: '@Agentuity Coder Builder',
	architect: '@Agentuity Coder Architect',
	reviewer: '@Agentuity Coder Reviewer',
	memory: '@Agentuity Coder Memory',
	expert: '@Agentuity Coder Expert',
	planner: '@Agentuity Coder Planner',
	runner: '@Agentuity Coder Runner',
	reasoner: '@Agentuity Coder Reasoner',
	product: '@Agentuity Coder Product',
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
	const tmuxManager = coderConfig.tmux?.enabled
		? new TmuxSessionManager(ctx, coderConfig.tmux, {
				onLog: (message) =>
					ctx.client.app.log({
						body: {
							service: 'agentuity-coder',
							level: 'info',
							message,
						},
					}),
			})
		: undefined;
	const backgroundManager = new BackgroundManager(ctx, coderConfig.background, {
		onSubagentSessionCreated: tmuxManager
			? (event) => {
					void tmuxManager.onSessionCreated(event);
				}
			: undefined,
		onSubagentSessionDeleted: tmuxManager
			? (event) => {
					void tmuxManager.onSessionDeleted(event);
				}
			: undefined,
		onShutdown: tmuxManager
			? () => {
					void tmuxManager.cleanup();
				}
			: undefined,
	});

	// Session memory hooks handle checkpointing and compaction for non-Cadence sessions
	// Orchestration (deciding which module handles which session) happens below in the hooks
	const sessionMemoryHooks = createSessionMemoryHooks(ctx, coderConfig);

	const configHandler = createConfigHandler(coderConfig);

	// Create plugin tools using the @opencode-ai/plugin tool helper
	const tools = createTools(backgroundManager);

	// Create a logger for shutdown handler
	const shutdownLogger = (message: string) =>
		ctx.client.app.log({
			body: {
				service: 'agentuity-coder',
				level: 'info',
				message: `[shutdown] ${message}`,
			},
		});

	registerShutdownHandler(backgroundManager, tmuxManager, shutdownLogger);

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
			const event = extractEventFromInput(input);
			if (event) {
				backgroundManager.handleEvent(event);
			}
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
		const loadedSkills = await loadAllSkills(coderConfig.skills);
		const skillCommands = createSkillCommands(loadedSkills);

		// Merge agent configs: our defaults first, then user's opencode.json overrides on top
		// This allows users to customize any agent via their opencode.json
		const userAgentConfigs = config.agent as Record<string, AgentConfig> | undefined;
		const mergedAgents: Record<string, AgentConfig> = { ...agentConfigs };

		// Shallow merge user overrides on top of our defaults (nested objects like tools are replaced, not merged)
		if (userAgentConfigs) {
			for (const [name, userConfig] of Object.entries(userAgentConfigs)) {
				if (mergedAgents[name]) {
					// Merge user config on top of our default
					mergedAgents[name] = {
						...mergedAgents[name],
						...userConfig,
					};
				} else {
					// User defined a new agent not in our defaults
					mergedAgents[name] = userConfig;
				}
			}
		}

		config.agent = mergedAgents;

		// Validate merged configs and warn about mismatches
		validateAndWarnConfigs(mergedAgents);

		// In sandbox, allow all permissions without prompts
		if (IN_SANDBOX) {
			config.permission = {
				'*': 'allow',
				external_directory: {
					'/home/agentuity/**': 'allow',
					'*': 'allow',
				},
			};
		}

		config.command = {
			...(config.command as Record<string, CommandDefinition> | undefined),
			...commands,
			...skillCommands,
		};
	};
}

function createAgentConfigs(
	_config: ReturnType<typeof getDefaultConfig>
): Record<string, AgentConfig> {
	const result: Record<string, AgentConfig> = {};

	for (const agent of Object.values(agents)) {
		// Convert tools.exclude to Open Code format (tool: false)
		const tools: Record<string, boolean> = {};
		if (agent.tools?.exclude) {
			for (const tool of agent.tools.exclude) {
				tools[tool] = false;
			}
		}

		// Inject sandbox context into specific agents when running in sandbox
		const shouldInjectSandbox =
			IN_SANDBOX && SANDBOX_AWARE_AGENTS.includes(agent.role as AgentRole);
		const prompt = shouldInjectSandbox
			? `${agent.systemPrompt}\n${SANDBOX_CONTEXT}`
			: agent.systemPrompt;

		// Use agent defaults directly - user overrides happen in createConfigHandler
		result[agent.displayName] = {
			description: agent.description,
			model: agent.defaultModel,
			prompt,
			mode: agent.mode ?? 'subagent',
			...(Object.keys(tools).length > 0 ? { tools } : {}),
			...(agent.variant ? { variant: agent.variant } : {}),
			...(agent.temperature !== undefined ? { temperature: agent.temperature } : {}),
			...(agent.maxSteps !== undefined ? { maxSteps: agent.maxSteps } : {}),
			...(agent.reasoningEffort ? { reasoningEffort: agent.reasoningEffort } : {}),
			...(agent.thinking ? { thinking: agent.thinking } : {}),
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
- **@Agentuity Coder Architect**: Complex autonomous tasks, Cadence mode (GPT Codex)
- **@Agentuity Coder Reviewer**: Review changes, catch issues, apply fixes
- **@Agentuity Coder Memory**: Store context, remember decisions
- **@Agentuity Coder Reasoner**: Extract structured conclusions, resolve conflicts, surface corrections
- **@Agentuity Coder Expert**: Agentuity CLI and cloud services specialist
- **@Agentuity Coder Planner**: Deep planning for complex architecture decisions
- **@Agentuity Coder Runner**: Run lint/build/test commands, returns structured results
- **@Agentuity Coder Product**: Clarify requirements, validate features, track progress

## Task
$ARGUMENTS

## Guidelines
1. Use @Agentuity Coder Scout first to understand context
2. Use @Agentuity Coder Product to clarify requirements if unclear
3. Delegate implementation to @Agentuity Coder Builder (or Architect for complex work)
4. Delegate lint/build/test commands to @Agentuity Coder Runner for structured results
5. Have @Agentuity Coder Reviewer check the work
6. Use @Agentuity Coder Expert for Agentuity CLI questions
7. Only use cloud services when genuinely helpful
8. **When done, tell @Agentuity Coder Memory to memorialize the session**
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

		'agentuity-memory-share': {
			name: 'agentuity-memory-share',
			description: '🔗 Share memory content publicly with a shareable URL',
			template: `Create a public shareable link for memory content.

The user wants to share: $ARGUMENTS

## Your Task

1. **Understand what to share** — Based on the user's request, determine what content to share:
   - A summary of the current session
   - The latest compaction
   - Specific decisions or corrections
   - A custom selection of context
   - If the request implies context not in the current chat, pull from memory stores (KV/Vector)

2. **Prepare the content** — Format the content appropriately:
   - Use clear markdown formatting
   - Include relevant context (what this is, when it was created)
   - Be conservative with sensitive information (no secrets, credentials, etc.)
   - Keep it focused and useful for the recipient

3. **Share it** — Call the \`agentuity_memory_share\` tool with:
   - \`content\`: The formatted content to share
   - \`ttl_seconds\`: Only if the user specified a duration (otherwise use default 30-day expiration)
   - \`metadata\`: Optional tags like \`type=summary\` or \`source=session\`
   - \`content_type\`: Usually \`text/markdown\` (default)

4. **Return the URL** — Give the user the public URL they can share anywhere.

## Guidelines
- The URL works without authentication — anyone with the link can view it
- Content is stored in Agentuity Cloud Streams with automatic expiration
- Don't include secrets, API keys, or sensitive credentials in shared content
- If unsure what to share, ask the user for clarification`,
			agent: 'Agentuity Coder Memory',
			argumentHint:
				'"share a summary of this session" or "share the auth decisions with 1 hour TTL"',
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
- **@Agentuity Coder Architect**: Complex autonomous implementation (GPT Codex with high reasoning) — **USE THIS FOR CADENCE**
- **@Agentuity Coder Builder**: Quick fixes, simple changes (for minor iterations only)
- **@Agentuity Coder Reviewer**: Review changes, catch issues, apply fixes
- **@Agentuity Coder Memory**: Store context, remember decisions, checkpoints
- **@Agentuity Coder Reasoner**: Extract structured conclusions, resolve conflicts, surface corrections
- **@Agentuity Coder Expert**: Agentuity CLI and cloud services specialist
- **@Agentuity Coder Planner**: Deep planning for complex architecture decisions
- **@Agentuity Coder Runner**: Run lint/build/test commands, returns structured results
- **@Agentuity Coder Product**: Clarify requirements, validate features, track progress, Cadence briefings

## Task
$ARGUMENTS

## Cadence Workflow

1. **Initialize loop state**:
   - Generate loop ID (format: \`lp_short_name_01\`)
   - Store in KV: \`agentuity cloud kv set agentuity-opencode-tasks "loop:{loopId}:state" '{...}'\`

2. **Each iteration**:
   - Ask @Agentuity Coder Memory for relevant context
   - Use @Agentuity Coder Scout to understand what's needed
   - For complex planning, consult @Agentuity Coder Planner
   - Delegate implementation to **@Agentuity Coder Architect** (preferred for Cadence)
   - Have @Agentuity Coder Reviewer verify the work
   - Tell @Agentuity Coder Memory to store checkpoint

3. **When truly complete**, output:
\`\`\`
<promise>DONE</promise>
\`\`\`

4. **Tell @Agentuity Coder Memory to memorialize** the completed session

## Guidelines
- **Use Architect for implementation** — Architect has GPT Codex with maximum reasoning, ideal for autonomous work
- Use regular Builder only for trivial fixes within an iteration
- Ask Memory for context at each iteration start
- Store checkpoints at each iteration end
- If stuck on architecture, consult Planner before trying more approaches
- Use @Agentuity Coder Expert for sandbox/cloud operations
- Respect max iterations (50 default)`,
			agent: 'Agentuity Coder Lead',
			argumentHint: 'build the new auth feature with tests',
		},
	};
}

function createSkillCommands(skills: LoadedSkill[]): Record<string, CommandDefinition> {
	const commands: Record<string, CommandDefinition> = {};

	for (const skill of skills) {
		const baseDir = normalizeBaseDir(skill.resolvedPath);
		commands[skill.name] = {
			name: skill.name,
			description: skill.metadata.description,
			template: `<skill-instruction>
Base directory for this skill: ${baseDir}/
File references (@path) in this skill are relative to this directory.

${skill.content}
</skill-instruction>

<user-request>
$ARGUMENTS
</user-request>`,
			...(skill.metadata.agent ? { agent: skill.metadata.agent } : {}),
			...(skill.metadata.model ? { model: skill.metadata.model } : {}),
			...(skill.metadata['argument-hint']
				? { argumentHint: skill.metadata['argument-hint'] }
				: {}),
			...(skill.metadata.subtask ? { subtask: true } : {}),
		};
	}

	return commands;
}

function normalizeBaseDir(path: string): string {
	return path.replace(/[\\/]+$/, '');
}

function createTools(backgroundManager: BackgroundManager): Hooks['tool'] {
	// Use the schema from @opencode-ai/plugin's tool helper to avoid Zod version mismatches
	const s = tool.schema;

	const coderDelegate = tool({
		description: `Delegate a task to a specialized Agentuity Coder agent.

Use this to:
- Scout: Explore codebase, find patterns, research documentation
- Builder: Implement features, write code, run tests (interactive work)
- Architect: Complex autonomous tasks, Cadence mode, deep reasoning (GPT Codex)
- Reviewer: Review changes, catch issues, apply fixes
- Memory: Store context, remember decisions across sessions
- Reasoner: Extract structured conclusions, resolve conflicts, surface corrections
- Expert: Get help with Agentuity CLI and cloud services
- Planner: Strategic advisor for complex architecture and deep planning (read-only)
- Runner: Execute lint/build/test/typecheck/format commands, returns structured results`,
		args: {
			agent: s
				.enum([
					'scout',
					'builder',
					'architect',
					'reviewer',
					'memory',
					'reasoner',
					'expert',
					'planner',
					'runner',
				])
				.describe('Which agent to delegate to'),
			task: s.string().describe('Clear description of the task'),
			context: s.string().optional().describe('Additional context from previous tasks'),
		},
		async execute(args) {
			const mention = AGENT_MENTIONS[args.agent as AgentRole];
			let prompt = `${mention}\n\n## Task\n${args.task}`;
			if (args.context) {
				prompt = `${mention}\n\n## Context\n${args.context}\n\n## Task\n${args.task}`;
			}
			return `To delegate this task, use the Task tool with this prompt:\n\n${prompt}\n\nThe ${args.agent} agent will handle this task.`;
		},
	});

	const backgroundTask = tool({
		description: `Launch a task to run in the background. Use this for parallel execution of multiple independent tasks.

IMPORTANT: Use this tool instead of the 'task' tool when:
- You need to run multiple agents in parallel
- Tasks are independent and don't need sequential execution
- The user asks for "parallel", "background", or "concurrent" work`,
		args: {
			agent: s
				.enum([
					'lead',
					'scout',
					'builder',
					'architect',
					'reviewer',
					'memory',
					'reasoner',
					'expert',
					'planner',
					'runner',
					'product',
				])
				.describe('Agent role to run the task'),
			task: s.string().describe('Task prompt to run in the background'),
			description: s.string().optional().describe('Short description of the task'),
		},
		async execute(args, context) {
			const parentSessionId = context.sessionID;
			if (!parentSessionId) {
				return JSON.stringify({
					taskId: 'unknown',
					status: 'error',
					message: 'Missing session context for background task.',
				});
			}

			const agentName = resolveAgentName(args.agent as AgentRole);
			const bgTask = await backgroundManager.launch({
				description: args.description ?? args.task,
				prompt: args.task,
				agent: agentName,
				parentSessionId,
				parentMessageId: context.messageID,
			});
			return JSON.stringify({
				taskId: bgTask.id,
				status: bgTask.status,
				message:
					bgTask.status === 'error'
						? (bgTask.error ?? 'Failed to launch background task.')
						: 'Background task launched.',
			});
		},
	});

	const backgroundOutput = tool({
		description: 'Retrieve output for a background task.',
		args: {
			task_id: s.string().describe('Background task ID'),
		},
		async execute(args) {
			const bgTask = backgroundManager.getTask(args.task_id);
			if (!bgTask) {
				return JSON.stringify({
					taskId: args.task_id,
					status: 'error',
					error: 'Task not found.',
				});
			}
			return JSON.stringify({
				taskId: bgTask.id,
				status: bgTask.status,
				result: bgTask.result,
				error: bgTask.error,
			});
		},
	});

	const backgroundCancel = tool({
		description: 'Cancel a running background task.',
		args: {
			task_id: s.string().describe('Background task ID'),
		},
		async execute(args) {
			const success = backgroundManager.cancel(args.task_id);
			return JSON.stringify({
				taskId: args.task_id,
				success,
				message: success ? 'Background task cancelled.' : 'Unable to cancel task.',
			});
		},
	});

	const memoryShare = tool({
		description: `Share memory content publicly via Agentuity Cloud Streams.

Creates a public URL that can be shared with anyone - no authentication required to access.
The content is stored in Agentuity's durable stream storage with optional TTL.

Use this when:
- User wants to share context with another agent/session
- User wants to export a summary, compaction, or session for external use
- User explicitly asks to "share" or "make public" some memory content

Returns the public URL that can be copied and used anywhere.`,
		args: {
			content: s.string().describe('The content to share publicly'),
			namespace: s
				.string()
				.optional()
				.describe('Stream namespace (default: agentuity-opencode-shares)'),
			ttl_seconds: s
				.number()
				.optional()
				.describe('TTL in seconds (60-7776000, or omit for 30-day default)'),
			content_type: s.string().optional().describe('Content type (default: text/markdown)'),
			metadata: s
				.record(s.string(), s.string())
				.optional()
				.describe('Optional metadata key-value pairs'),
			compress: s.boolean().optional().describe('Enable gzip compression'),
			region: s.string().optional().describe('Cloud region (use, usc, usw). Default: usc'),
		},
		async execute(args) {
			// Check auth first
			const authResult = await checkAuth();
			if (!authResult.ok) {
				return JSON.stringify({
					success: false,
					error: authResult.error,
				});
			}

			// Build CLI command
			const namespace = args.namespace ?? 'agentuity-opencode-shares';
			const contentType = args.content_type ?? 'text/markdown';

			const cliArgs = ['agentuity', '--json', 'cloud', 'stream', 'create', namespace, '-'];
			cliArgs.push('--content-type', contentType);
			cliArgs.push('--region', args.region ?? 'usc');

			if (args.ttl_seconds !== undefined) {
				cliArgs.push('--ttl', String(args.ttl_seconds));
			}

			if (args.compress) {
				cliArgs.push('--compress');
			}

			if (args.metadata && Object.keys(args.metadata).length > 0) {
				const metadataStr = Object.entries(args.metadata)
					.map(([k, v]) => `${k}=${v}`)
					.join(',');
				cliArgs.push('--metadata', metadataStr);
			}

			// Get the profile to use
			const profile = getCoderProfile();

			try {
				const proc = Bun.spawn(cliArgs, {
					stdin: 'pipe',
					stdout: 'pipe',
					stderr: 'pipe',
					env: {
						...process.env,
						AGENTUITY_PROFILE: profile,
					},
				});

				// Write content to stdin (Bun's FileSink API)
				proc.stdin.write(new TextEncoder().encode(args.content));
				proc.stdin.end();

				const [stdout, stderr, exitCode] = await Promise.all([
					new Response(proc.stdout).text(),
					new Response(proc.stderr).text(),
					proc.exited,
				]);

				if (exitCode !== 0) {
					return JSON.stringify({
						success: false,
						error: stderr || `CLI exited with code ${exitCode}`,
					});
				}

				// Parse JSON response from CLI
				const result = JSON.parse(stdout);

				return JSON.stringify({
					success: true,
					url: result.url,
					id: result.id,
					namespace: result.namespace,
					sizeBytes: result.sizeBytes,
					expiresAt: result.expiresAt,
				});
			} catch (error) {
				return JSON.stringify({
					success: false,
					error: error instanceof Error ? error.message : 'Failed to create stream',
				});
			}
		},
	});

	return {
		agentuity_coder_delegate: coderDelegate,
		agentuity_background_task: backgroundTask,
		agentuity_background_output: backgroundOutput,
		agentuity_background_cancel: backgroundCancel,
		agentuity_memory_share: memoryShare,
	};
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

function resolveAgentName(role: AgentRole): string {
	const agent = agents[role];
	return agent?.displayName ?? role;
}

function extractEventFromInput(
	input: unknown
): { type: string; properties?: Record<string, unknown> } | undefined {
	if (typeof input !== 'object' || input === null) return undefined;
	const inp = input as { event?: { type?: string; properties?: Record<string, unknown> } };
	if (!inp.event || typeof inp.event.type !== 'string') return undefined;
	return { type: inp.event.type, properties: inp.event.properties };
}

function registerShutdownHandler(
	manager: BackgroundManager,
	tmuxManager?: TmuxSessionManager,
	logger?: (msg: string) => void
): void {
	if (typeof process === 'undefined') {
		logger?.('[shutdown] process is undefined, cannot register handlers');
		return;
	}

	const log = logger ?? (() => {});
	let shutdownCalled = false;

	log(
		`Registering shutdown handlers (PID: ${process.pid}, tmuxManager: ${tmuxManager ? 'yes' : 'no'})`
	);
	log(`Current tracked sessions in tmuxManager: ${tmuxManager ? 'checking...' : 'N/A'}`);

	const shutdown = (signal?: string) => {
		// Prevent multiple shutdown calls
		if (shutdownCalled) {
			log(`Shutdown already in progress, ignoring ${signal ?? 'unknown'} signal`);
			return;
		}
		shutdownCalled = true;

		log(`Shutdown triggered by ${signal ?? 'unknown'} signal`);

		try {
			log('Shutting down background manager...');
			manager.shutdown();
			log('Background manager shutdown complete');
		} catch (error) {
			log(`Background manager shutdown error: ${error}`);
		}

		if (tmuxManager) {
			try {
				log('Cleaning up tmux sessions...');
				// Use sync version to ensure cleanup completes before process exits
				tmuxManager.cleanupSync();
				log('Tmux cleanup complete');
			} catch (error) {
				log(`Tmux cleanup error: ${error}`);
			}
		}

		log('Shutdown complete');
	};

	process.once('beforeExit', () => shutdown('beforeExit'));
	process.once('SIGINT', () => shutdown('SIGINT'));
	process.once('SIGTERM', () => shutdown('SIGTERM'));
	process.once('SIGHUP', () => shutdown('SIGHUP')); // Handle tmux pane close
	process.once('exit', () => shutdown('exit')); // Also handle exit event for extra safety

	log('Shutdown handlers registered for: beforeExit, SIGINT, SIGTERM, SIGHUP, exit');
}
