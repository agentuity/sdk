import type { PluginInput } from '@opencode-ai/plugin';
import type { CoderConfig } from '../../types';
import { checkAuth } from '../../services/auth';
import { entityId, getEntityContext } from '../../agents/memory/entities';
import { agents } from '../../agents';
import { z } from 'zod';

const sessionInputSchema = z.object({
	sessionID: z.string().optional(),
});

export interface ToolHooks {
	before: (input: unknown, output: unknown) => Promise<void>;
	after: (input: unknown, output: unknown) => Promise<void>;
}

const CLOUD_TOOL_PREFIXES = [
	'agentuity.kv',
	'agentuity.storage',
	'agentuity.vector',
	'agentuity.sandbox',
];

/**
 * Escape a string for safe use in shell commands.
 * Wraps in single quotes and escapes any internal single quotes.
 */
function shellEscape(str: string): string {
	// Replace single quotes with '\'' (end quote, escaped quote, start quote)
	return `'${str.replace(/'/g, "'\\''")}'`;
}

/**
 * Get the Agentuity profile to use for CLI commands.
 * Defaults to 'production' for safety, but can be overridden via AGENTUITY_CODER_PROFILE.
 */
export function getCoderProfile(): string {
	const profile = process.env.AGENTUITY_CODER_PROFILE?.trim();
	return profile || 'production';
}

/** Cloud service detection for bash commands */
const CLOUD_SERVICES: Record<string, { name: string; emoji: string }> = {
	'agentuity cloud kv': { name: 'KV Storage', emoji: '🗄️' },
	'agentuity cloud storage': { name: 'Object Storage', emoji: '📦' },
	'agentuity cloud vector': { name: 'Vector Search', emoji: '🔍' },
	'agentuity cloud sandbox': { name: 'Sandbox', emoji: '🏖️' },
	'agentuity cloud db': { name: 'Postgres', emoji: '🐘' },
	'agentuity cloud ssh': { name: 'SSH', emoji: '🔐' },
	'agentuity cloud scp': { name: 'File Transfer', emoji: '📤' },
};

export function createToolHooks(ctx: PluginInput, config: CoderConfig): ToolHooks {
	const blockedCommands = config.blockedCommands ?? [];

	return {
		async before(input: unknown, output: unknown): Promise<void> {
			const toolName = extractToolName(input);
			if (!toolName) return;

			const sessionResult = sessionInputSchema.safeParse(input);
			if (sessionResult.success && sessionResult.data.sessionID) {
				process.env.AGENTUITY_OPENCODE_SESSION = sessionResult.data.sessionID;
			}

			// Check MCP cloud tools
			if (isCloudTool(toolName)) {
				const authResult = await checkAuth();
				if (!authResult.ok) {
					const out = output as { error?: string };
					out.error = authResult.error;
				}
			}

			// Detect bash commands using agentuity CLI
			if (toolName === 'bash') {
				const command = extractBashCommand(input);
				if (command?.includes('agentuity')) {
					// Security: Block sensitive commands
					const blockedPattern = isBlockedCommand(command, blockedCommands);
					if (blockedPattern) {
						const out = output as { blocked?: boolean; error?: string };
						out.blocked = true;
						out.error = `🚫 Blocked: "${blockedPattern}" commands are not allowed for security reasons.`;

						ctx.client.app.log({
							body: {
								service: 'agentuity-coder',
								level: 'warn',
								message: `Blocked command pattern: ${blockedPattern}`,
								extra: { command },
							},
						});
						return;
					}

					// Inject AGENTUITY_PROFILE and AGENTUITY_OPENCODE_SESSION environment variables
					const profile = getCoderProfile();
					const bashSessionResult = sessionInputSchema.safeParse(input);
					const sessionId = bashSessionResult.success
						? bashSessionResult.data.sessionID
						: undefined;

					// Escape values for safe shell interpolation
					const escapedProfile = shellEscape(profile);
					const escapedSessionId = sessionId ? shellEscape(sessionId) : undefined;

					let modifiedCommand: string;

					// Check if AGENTUITY_PROFILE already exists (anywhere in the command)
					if (/AGENTUITY_PROFILE=(?:'[^']*'|\S+)/.test(command)) {
						// Replace all existing AGENTUITY_PROFILE occurrences to enforce our profile
						modifiedCommand = command.replace(
							/AGENTUITY_PROFILE=(?:'[^']*'|\S+)/g,
							() => `AGENTUITY_PROFILE=${escapedProfile}`
						);
						// Add session ID and agent mode if not already present
						if (
							escapedSessionId &&
							!modifiedCommand.includes('AGENTUITY_OPENCODE_SESSION=')
						) {
							modifiedCommand = `AGENTUITY_OPENCODE_SESSION=${escapedSessionId} ${modifiedCommand}`;
						}
						if (!modifiedCommand.includes('AGENTUITY_AGENT_MODE=')) {
							modifiedCommand = `AGENTUITY_AGENT_MODE=opencode ${modifiedCommand}`;
						}
					} else {
						// Build environment variable prefix
						let envVars = `AGENTUITY_PROFILE=${escapedProfile} AGENTUITY_AGENT_MODE=opencode`;
						if (escapedSessionId) {
							envVars += ` AGENTUITY_OPENCODE_SESSION=${escapedSessionId}`;
						}
						modifiedCommand = `${envVars} ${command}`;
					}
					setBashCommand(input, modifiedCommand);

					// Show toast for cloud service usage
					const service = detectCloudService(command);
					if (service) {
						try {
							ctx.client.tui.showToast({
								body: {
									message: `${service.emoji} Agentuity ${service.name}`,
									variant: 'info',
								},
							});
						} catch {
							// Toast may not be available
						}
					}
				}
			}

			// Normalize short agent role names to full display names for the Task tool
			// This handles cases where the LLM passes "scout" instead of "Agentuity Coder Scout"
			if (toolName === 'task') {
				const out = output as { args?: Record<string, unknown> };
				const subagentType = out.args?.subagent_type as string | undefined;
				if (subagentType) {
					const normalized = normalizeAgentName(subagentType);
					if (normalized && normalized !== subagentType) {
						out.args!.subagent_type = normalized;
					}
				}
			}
		},

		async after(input: unknown, output: unknown): Promise<void> {
			// Graceful handling for unavailable tools: if a tool execution produced an
			// error indicating the tool doesn't exist or is unavailable, normalize the
			// output to a helpful message so the session continues instead of crashing.
			const toolName = extractToolName(input);
			if (!toolName) return;

			const out = output as {
				output?: string;
				title?: string;
				metadata?: Record<string, unknown>;
			};
			if (typeof out.output !== 'string') return;

			const lower = out.output.toLowerCase();
			const isToolMissing =
				(lower.includes('not found') ||
					lower.includes('not available') ||
					lower.includes('does not exist') ||
					lower.includes('unknown tool') ||
					lower.includes('no such tool')) &&
				(lower.includes('tool') || lower.includes(toolName.toLowerCase()));

			if (isToolMissing) {
				out.output = JSON.stringify({
					error: `Tool '${toolName}' is not available in this session. It may have been removed or is not installed. Please use an alternative approach or ask the user for guidance.`,
					tool: toolName,
					recoverable: true,
				});
				out.title = `Tool unavailable: ${toolName}`;
			}
		},
	};
}

export async function getEntityContextForSession(): Promise<{
	userId?: string;
	orgId?: string;
	projectId?: string;
	repoId?: string;
}> {
	try {
		const ctx = await getEntityContext();
		return {
			userId: ctx.user?.id ? entityId('user', ctx.user.id) : undefined,
			orgId: ctx.org?.id ? entityId('org', ctx.org.id) : undefined,
			projectId: ctx.project?.id ? entityId('project', ctx.project.id) : undefined,
			repoId:
				ctx.repo?.url || ctx.repo?.path
					? entityId('repo', ctx.repo.url || ctx.repo.path)
					: undefined,
		};
	} catch {
		return {};
	}
}

function extractToolName(input: unknown): string | undefined {
	if (typeof input === 'object' && input !== null && 'tool' in input) {
		return (input as { tool: string }).tool;
	}
	return undefined;
}

function extractBashCommand(input: unknown): string | undefined {
	if (typeof input !== 'object' || input === null) return undefined;
	const inp = input as Record<string, unknown>;

	// Try different possible arg structures
	if (typeof inp.command === 'string') return inp.command;
	if (typeof inp.args === 'object' && inp.args !== null) {
		const args = inp.args as Record<string, unknown>;
		if (typeof args.command === 'string') return args.command;
	}

	return undefined;
}

/**
 * Set the bash command in the input object.
 * Handles both direct command property and args.command structures.
 */
function setBashCommand(input: unknown, command: string): void {
	if (typeof input !== 'object' || input === null) return;
	const inp = input as Record<string, unknown>;

	// Update the command in the same location it was found
	if (typeof inp.command === 'string') {
		inp.command = command;
	} else if (typeof inp.args === 'object' && inp.args !== null) {
		const args = inp.args as Record<string, unknown>;
		if (typeof args.command === 'string') {
			args.command = command;
		}
	}
}

function detectCloudService(command: string): { name: string; emoji: string } | null {
	for (const [pattern, service] of Object.entries(CLOUD_SERVICES)) {
		if (command.includes(pattern)) {
			return service;
		}
	}
	return null;
}

function isCloudTool(toolName: string): boolean {
	return CLOUD_TOOL_PREFIXES.some((prefix) => toolName.startsWith(prefix));
}

/** Check if a command matches any blocked pattern, returns the matched pattern or null */
function isBlockedCommand(command: string, blockedPatterns: string[]): string | null {
	for (const pattern of blockedPatterns) {
		if (command.includes(pattern)) {
			return pattern;
		}
	}
	return null;
}

/**
 * Normalize a short agent role name to its full display name.
 * Handles cases where the LLM passes "scout" instead of "Agentuity Coder Scout".
 * Returns the normalized name, or undefined if no match found.
 */
function normalizeAgentName(name: string): string | undefined {
	// First check if it already matches a display name (no normalization needed)
	const allAgents = Object.values(agents);
	if (allAgents.some((a) => a.displayName === name)) {
		return name;
	}
	// Try matching by role (e.g., "scout" → "Agentuity Coder Scout")
	const byRole = allAgents.find((a) => a.role === name);
	if (byRole) return byRole.displayName;
	// Try matching by id (e.g., "ag-scout" → "Agentuity Coder Scout")
	const byId = allAgents.find((a) => a.id === name);
	if (byId) return byId.displayName;
	return undefined;
}
