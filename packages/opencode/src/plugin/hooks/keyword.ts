import type { PluginInput } from '@opencode-ai/plugin';
import type { CoderConfig } from '../../types';

export interface KeywordHooks {
	onMessage: (input: unknown, output: unknown) => Promise<void>;
}

const CODER_PATTERN = /\b(ag|agentuity coder)\b/i;

const CODER_ACTIVATION_MESSAGE = `<coder-mode>
You are now using the Agentuity Coder agent team from Agentuity.

## Your Team (use @mentions to invoke)
- **@Agentuity Coder Lead**: Orchestrator - breaks down tasks, delegates, never implements directly
- **@Agentuity Coder Scout**: Explorer - finds patterns, researches docs, analyzes codebase (read-only)
- **@Agentuity Coder Builder**: Implementer - writes code, runs tests, makes changes
- **@Agentuity Coder Architect**: Senior implementer - complex autonomous tasks, Cadence mode
- **@Agentuity Coder Reviewer**: Quality checker - reviews changes, applies fixes
- **@Agentuity Coder Memory**: Context keeper - remembers decisions, stores checkpoints
- **@Agentuity Coder Expert**: Agentuity specialist - knows CLI commands and cloud services
- **@Agentuity Coder Planner**: Strategic advisor - complex architecture, deep planning
- **@Agentuity Coder Runner**: Command executor - runs lint/build/test, returns structured results

## Agentuity Cloud Services Available
When genuinely helpful, use these via the CLI:
- \`agentuity cloud kv\` — Key-value storage for memory/checkpoints
- \`agentuity cloud storage\` — S3-compatible storage for large files
- \`agentuity cloud sandbox\` — Isolated execution environments
- \`agentuity cloud vector\` — Semantic search for large codebases
- \`agentuity cloud db\` — PostgreSQL for structured data

Run \`agentuity ai schema show\` to see all available CLI commands.

## Guidelines
1. Break complex tasks into subtasks
2. Use @Agentuity Coder Scout before implementing to understand context
3. Have @Agentuity Coder Reviewer check @Agentuity Coder Builder's work
4. Use cloud services only when they genuinely help
</coder-mode>
`;

export function createKeywordHooks(ctx: PluginInput, _config: CoderConfig): KeywordHooks {
	const activatedSessions = new Set<string>();

	const log = (msg: string) => {
		ctx.client.app.log({
			body: {
				service: 'coder-keyword',
				level: 'debug',
				message: msg,
			},
		});
	};

	return {
		async onMessage(input: unknown, output: unknown): Promise<void> {
			log(
				`onMessage called - input keys: ${input ? Object.keys(input as object).join(', ') : 'null'}`
			);
			log(
				`onMessage called - output keys: ${output ? Object.keys(output as object).join(', ') : 'null'}`
			);

			const sessionId = extractSessionId(input);
			if (!sessionId) {
				log('No sessionId found');
				return;
			}
			log(`sessionId: ${sessionId}`);

			const messageText = extractMessageText(output);
			if (!messageText) {
				log('No messageText found in output');
				return;
			}
			log(`messageText (first 100 chars): ${messageText.substring(0, 100)}`);

			if (CODER_PATTERN.test(messageText)) {
				log('CODER_PATTERN matched!');
				if (!activatedSessions.has(sessionId)) {
					activatedSessions.add(sessionId);
					injectContext(output, CODER_ACTIVATION_MESSAGE);
					log('Context injected');
				} else {
					log('Session already activated');
				}
			}
		},
	};
}

function extractSessionId(input: unknown): string | undefined {
	if (typeof input !== 'object' || input === null) return undefined;

	// Try both sessionID and sessionId (Open Code uses sessionID)
	const inp = input as Record<string, unknown>;
	if (typeof inp.sessionID === 'string') return inp.sessionID;
	if (typeof inp.sessionId === 'string') return inp.sessionId;
	if (typeof inp.session_id === 'string') return inp.session_id;

	return undefined;
}

function extractMessageText(output: unknown): string | undefined {
	if (typeof output !== 'object' || output === null) return undefined;

	const out = output as { parts?: Array<{ type?: string; text?: string }> };
	if (!out.parts || !Array.isArray(out.parts)) return undefined;

	for (const part of out.parts) {
		if (part.type === 'text' && part.text) {
			return part.text;
		}
	}
	return undefined;
}

function injectContext(output: unknown, context: string): void {
	if (typeof output !== 'object' || output === null) return;

	const out = output as { parts?: Array<{ type?: string; text?: string }> };
	if (!out.parts || !Array.isArray(out.parts)) return;

	for (const part of out.parts) {
		if (part.type === 'text' && part.text) {
			part.text = `${context}\n\n---\n\n${part.text}`;
			return;
		}
	}
}
