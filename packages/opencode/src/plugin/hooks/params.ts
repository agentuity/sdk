import type { PluginInput } from '@opencode-ai/plugin';
import type { AgentConfig, CoderConfig } from '../../types';

export interface ParamsHooks {
	onParams: (input: unknown, output: unknown) => Promise<void>;
}

/**
 * Dynamic mode triggers based on user message content.
 *
 * Trigger phrases are intentionally specific to avoid false positives.
 * Single common words are avoided; multi-word phrases are preferred.
 */
const DYNAMIC_MODES = {
	/**
	 * Creative mode: Higher temperature for brainstorming and idea generation
	 * Advertised keyword: "brainstorm"
	 */
	creative: {
		triggers: [
			'brainstorm',
			'be creative',
			'get creative',
			'give me ideas',
			'explore options',
			'explore alternatives',
			'think outside the box',
		],
		settings: {
			temperature: 0.8,
		},
	},

	/**
	 * Deep thinking mode: Maximum reasoning for complex analysis
	 * Advertised keyword: "think hard"
	 */
	deepThink: {
		triggers: [
			'think hard',
			'think deeply',
			'reason through this',
			'analyze carefully',
			'think this through',
			'give this extra thought',
		],
		settings: {
			// For Anthropic models, this enables max thinking budget
			// These get passed through as provider options
			thinking: {
				type: 'enabled',
				budgetTokens: 32000,
			},
		},
	},

	/**
	 * Thorough mode: More iterations for comprehensive work
	 * Advertised keyword: "dig deep" or "go deep"
	 */
	thorough: {
		triggers: [
			'dig deep',
			'go deep',
			'deep dive',
			'take your time',
			'be thorough',
			'be meticulous',
		],
		settings: {
			maxSteps: 50,
		},
	},
} as const;

/**
 * Check if message content triggers any dynamic mode
 */
function detectMode(
	messageContent: string
): { mode: string; settings: Record<string, unknown> } | null {
	const lower = messageContent.toLowerCase();

	for (const [modeName, config] of Object.entries(DYNAMIC_MODES)) {
		for (const trigger of config.triggers) {
			if (lower.includes(trigger)) {
				return {
					mode: modeName,
					settings: config.settings as Record<string, unknown>,
				};
			}
		}
	}

	return null;
}

export function createParamsHooks(
	ctx: PluginInput,
	_config: CoderConfig,
	lastUserMessages?: Map<string, string>
): ParamsHooks {
	return {
		async onParams(input: unknown, output: unknown): Promise<void> {
			// Input contains: sessionID, agent, model, provider, message
			const inputObj = input as {
				sessionID?: string;
				agent?: string;
				message?: { content?: string };
			};

			// Output contains: temperature, topP, topK, options
			const outputObj = output as {
				temperature?: number;
				topP?: number;
				topK?: number;
				options?: Record<string, unknown>;
			};

			// Get message content for mode detection
			const messageContent = inputObj.message?.content || '';
			if (!messageContent) return;

			// Store user message text for downstream hooks (e.g. cadence trigger detection)
			if (lastUserMessages && inputObj.sessionID) {
				lastUserMessages.set(inputObj.sessionID, messageContent);
			}

			// Check for dynamic mode triggers
			const detected = detectMode(messageContent);
			if (!detected) return;

			// Apply detected mode settings
			ctx.client.app.log({
				body: {
					service: 'agentuity-coder',
					level: 'info',
					message: `Dynamic mode activated: ${detected.mode}`,
					extra: { mode: detected.mode, settings: detected.settings },
				},
			});

			// Show toast to user
			const modeMessages: Record<string, string> = {
				creative: '🎨 Creative Mode activated - higher creativity enabled',
				deepThink: '🧠 Deep Think Mode activated - extended reasoning enabled',
				thorough: '🔍 Thorough Mode activated - more iterations enabled',
			};

			try {
				ctx.client.tui.showToast({
					body: {
						message: modeMessages[detected.mode] || `${detected.mode} mode activated`,
						variant: 'info',
					},
				});
			} catch {
				// Toast may not be available in all contexts (e.g., headless)
			}

			// Apply temperature if specified
			if (
				'temperature' in detected.settings &&
				typeof detected.settings.temperature === 'number'
			) {
				outputObj.temperature = detected.settings.temperature;
			}

			// Apply maxSteps if specified
			if ('maxSteps' in detected.settings && typeof detected.settings.maxSteps === 'number') {
				outputObj.options = {
					...outputObj.options,
					maxSteps: detected.settings.maxSteps,
				};
			}

			// Apply provider-specific options (like thinking budget)
			if ('thinking' in detected.settings) {
				outputObj.options = {
					...outputObj.options,
					thinking: detected.settings.thinking,
				};
			}
		},
	};
}

/**
 * Advertised magic words for users:
 *
 * - "brainstorm" - Activates creative mode (temperature → 0.8)
 * - "think hard" - Activates deep thinking mode (max reasoning budget)
 * - "dig deep" / "go deep" - Activates thorough mode (maxSteps → 50)
 *
 * These can also be triggered by specific phrases like:
 * - "be creative", "give me ideas", "explore options", "explore alternatives"
 * - "think deeply", "analyze carefully", "reason through this"
 * - "deep dive", "take your time", "be thorough", "be meticulous"
 *
 * Note: Triggers use multi-word phrases to avoid false positives from common words.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Model Fallback Chain
// ─────────────────────────────────────────────────────────────────────────────

/** Retryable HTTP status codes that should trigger model fallback */
export const RETRYABLE_STATUS_CODES = [429, 500, 502, 503] as const;

/**
 * Tracks API errors per agent to enable model fallback on subsequent calls.
 *
 * When an agent's primary model fails with a retryable error (429, 500, 502, 503),
 * the next `chat.params` call can select a fallback model from the agent's
 * `fallbackModels` list.
 *
 * Current limitation: The `chat.params` hook can modify temperature/topP/topK/options
 * but CANNOT change the model itself (model is in the input, not output). Full model
 * fallback requires one of:
 *   1. A `chat.error` hook that allows retrying with a different model
 *   2. A `chat.model` hook that allows overriding the model selection
 *   3. Adding `model` to the `chat.params` output type
 *
 * TODO: When OpenCode adds a suitable hook, implement the retry logic here:
 *   - On API error (429/5xx), record the failure in `agentErrorState`
 *   - On next `chat.params` call for the same agent, select next fallback model
 *   - Log: `[ModelFallback] Switching from ${currentModel} to ${fallbackModel} due to ${error}`
 *   - Reset fallback state after successful completion or after TTL expires
 */
export class ModelFallbackTracker {
	/**
	 * Map of agent name → { failedModel, failedAt, errorCode, fallbackIndex }
	 * Used to track which agents have experienced API errors.
	 */
	private agentErrorState = new Map<
		string,
		{
			failedModel: string;
			failedAt: number;
			errorCode: number;
			fallbackIndex: number;
		}
	>();

	/** TTL for error state — reset after 5 minutes */
	private readonly ERROR_STATE_TTL_MS = 5 * 60 * 1000;

	/**
	 * Record an API error for an agent. Call this from an event handler
	 * when a retryable API error is detected.
	 */
	recordError(agentName: string, model: string, errorCode: number): void {
		const existing = this.agentErrorState.get(agentName);
		const fallbackIndex = existing ? existing.fallbackIndex + 1 : 0;
		this.agentErrorState.set(agentName, {
			failedModel: model,
			failedAt: Date.now(),
			errorCode,
			fallbackIndex,
		});
	}

	/**
	 * Get the next fallback model for an agent, if one is available.
	 * Returns undefined if no fallback is needed or available.
	 */
	getNextFallback(agentName: string, agentConfig: AgentConfig): string | undefined {
		const state = this.agentErrorState.get(agentName);
		if (!state) return undefined;

		// Check TTL
		if (Date.now() - state.failedAt > this.ERROR_STATE_TTL_MS) {
			this.agentErrorState.delete(agentName);
			return undefined;
		}

		const fallbacks = agentConfig.fallbackModels;
		if (!fallbacks?.length) return undefined;

		if (state.fallbackIndex >= fallbacks.length) {
			// Exhausted all fallbacks
			return undefined;
		}

		return fallbacks[state.fallbackIndex];
	}

	/**
	 * Clear error state for an agent (e.g., after successful completion).
	 */
	clearError(agentName: string): void {
		this.agentErrorState.delete(agentName);
	}
}
