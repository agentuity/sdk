import { isOpenAIModel, isAnthropicModel } from './presets';

export interface ConfigWarning {
	agent: string;
	message: string;
}

/**
 * Minimal config shape for validation - works with both AgentConfig and AgentModelConfig.
 */
interface ValidatableConfig {
	model?: string;
	reasoningEffort?: string;
	variant?: string;
	thinking?: unknown;
}

/**
 * Validates agent model configuration and returns warnings for mismatches.
 * Does not throw - just warns about potentially incorrect configuration.
 */
export function validateAgentConfig(agentName: string, config: ValidatableConfig): ConfigWarning[] {
	const warnings: ConfigWarning[] = [];
	const model = config.model;

	if (!model) return warnings;

	// Check for OpenAI-specific options on Anthropic models
	if (isAnthropicModel(model)) {
		if (config.reasoningEffort) {
			warnings.push({
				agent: agentName,
				message: `'reasoningEffort' is an OpenAI-specific option but model is Anthropic (${model}). Use 'variant' or 'thinking' instead.`,
			});
		}
	}

	// Check for Anthropic-specific options on OpenAI models
	if (isOpenAIModel(model)) {
		if (config.variant) {
			warnings.push({
				agent: agentName,
				message: `'variant' is an Anthropic-specific option but model is OpenAI (${model}). Use 'reasoningEffort' instead.`,
			});
		}
		if (config.thinking) {
			warnings.push({
				agent: agentName,
				message: `'thinking' is an Anthropic-specific option but model is OpenAI (${model}). Use 'reasoningEffort' instead.`,
			});
		}
	}

	return warnings;
}

/**
 * Validates all agent configs and logs warnings.
 */
export function validateAndWarnConfigs(
	configs: Record<string, ValidatableConfig>,
	logger: { warn: (msg: string) => void } = console
): void {
	for (const [agentName, config] of Object.entries(configs)) {
		const warnings = validateAgentConfig(agentName, config);
		for (const warning of warnings) {
			logger.warn(`[Agentuity Coder] Config warning for ${warning.agent}: ${warning.message}`);
		}
	}
}
