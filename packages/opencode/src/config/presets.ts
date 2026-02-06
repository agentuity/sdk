/**
 * Model helper utilities.
 *
 * Note: Presets have been removed in favor of using OpenCode's native config.
 * Default models are baked into agent definitions.
 * Users can override via opencode.json.
 */

/**
 * Check if a model ID is from OpenAI.
 */
export function isOpenAIModel(model: string): boolean {
	return model.startsWith('openai/');
}

/**
 * Check if a model ID is from Anthropic.
 */
export function isAnthropicModel(model: string): boolean {
	return model.startsWith('anthropic/');
}
