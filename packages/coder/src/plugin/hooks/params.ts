import type { PluginContext, CoderConfig } from '../../types';

export interface ParamsHooks {
	onParams: (input: unknown, output: unknown) => Promise<void>;
}

/**
 * Dynamic mode triggers based on user message content.
 * Users can use advertised keywords or natural variations.
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
			'ideas',
			'explore options',
			'alternatives',
			'think outside',
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
			'reason through',
			'analyze carefully',
			'think this through',
			'extra thought',
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
			'take time',
			'no rush',
			'careful',
			'meticulous',
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

export function createParamsHooks(ctx: PluginContext, _config: CoderConfig): ParamsHooks {
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
				ctx.client.tui?.showToast?.({
					body: { message: modeMessages[detected.mode] || `${detected.mode} mode activated` },
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
 * These can also be triggered by natural variations like:
 * - "be creative", "ideas", "explore options", "alternatives"
 * - "think deeply", "analyze carefully", "reason through this"
 * - "deep dive", "take time", "no rush", "careful", "meticulous"
 */
