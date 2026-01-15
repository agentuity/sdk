import type { PluginContext, CoderConfig } from '../../types';
import { checkAuth } from '../../services/auth';

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

export function createToolHooks(ctx: PluginContext, config: CoderConfig): ToolHooks {
	const blockedCommands = config.blockedCommands ?? [];

	return {
		async before(input: unknown, output: unknown): Promise<void> {
			const toolName = extractToolName(input);
			if (!toolName) return;

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

					// Show toast for cloud service usage
					const service = detectCloudService(command);
					if (service) {
						try {
							ctx.client.tui?.showToast?.({
								body: { message: `${service.emoji} Agentuity ${service.name}` },
							});
						} catch {
							// Toast may not be available
						}
					}
				}
			}
		},

		async after(_input: unknown, _output: unknown): Promise<void> {},
	};
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
