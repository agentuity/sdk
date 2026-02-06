import { describe, expect, it, vi } from 'bun:test';
import { getDefaultConfig, mergeConfig } from '../src/config/loader';
import { isOpenAIModel, isAnthropicModel } from '../src/config/presets';
import { validateAgentConfig, validateAndWarnConfigs } from '../src/config/validation';

describe('Config', () => {
	describe('getDefaultConfig', () => {
		it('returns empty disabledMcps by default', () => {
			const config = getDefaultConfig();
			expect(config.disabledMcps).toEqual([]);
		});

		it('returns blocked commands for security', () => {
			const config = getDefaultConfig();
			expect(config.blockedCommands).toContain('cloud secrets');
			expect(config.blockedCommands).toContain('auth token');
		});
	});

	describe('mergeConfig', () => {
		it('overrides org from user config', () => {
			const base = getDefaultConfig();
			const override = { org: 'my-org' };

			const merged = mergeConfig(base, override);
			expect(merged.org).toBe('my-org');
		});

		it('preserves base values when not overridden', () => {
			const base = getDefaultConfig();
			const override = {};

			const merged = mergeConfig(base, override);
			expect(merged.blockedCommands).toContain('cloud secrets');
		});

		it('overrides disabledMcps', () => {
			const base = getDefaultConfig();
			const override = { disabledMcps: ['websearch'] };

			const merged = mergeConfig(base, override);
			expect(merged.disabledMcps).toEqual(['websearch']);
		});

		it('overrides blockedCommands', () => {
			const base = getDefaultConfig();
			const override = { blockedCommands: ['custom-blocked'] };

			const merged = mergeConfig(base, override);
			expect(merged.blockedCommands).toEqual(['custom-blocked']);
		});
	});

	describe('Model helpers', () => {
		it('isOpenAIModel correctly identifies OpenAI models', () => {
			expect(isOpenAIModel('openai/gpt-5.2')).toBe(true);
			expect(isOpenAIModel('openai/gpt-5.3-codex')).toBe(true);
			expect(isOpenAIModel('anthropic/claude-opus-4-6')).toBe(false);
		});

		it('isAnthropicModel correctly identifies Anthropic models', () => {
			expect(isAnthropicModel('anthropic/claude-opus-4-6')).toBe(true);
			expect(isAnthropicModel('anthropic/claude-haiku-4-5')).toBe(true);
			expect(isAnthropicModel('openai/gpt-5.2')).toBe(false);
		});
	});

	describe('Config validation', () => {
		it('warns when reasoningEffort is used with Anthropic model', () => {
			const warnings = validateAgentConfig('TestAgent', {
				model: 'anthropic/claude-sonnet-4-5-20250514',
				reasoningEffort: 'high',
			});
			expect(warnings).toHaveLength(1);
			expect(warnings[0].message).toContain('reasoningEffort');
			expect(warnings[0].message).toContain('Anthropic');
		});

		it('warns when variant is used with OpenAI model', () => {
			const warnings = validateAgentConfig('TestAgent', {
				model: 'openai/gpt-5.2',
				variant: 'high',
			});
			expect(warnings).toHaveLength(1);
			expect(warnings[0].message).toContain('variant');
			expect(warnings[0].message).toContain('OpenAI');
		});

		it('warns when thinking is used with OpenAI model', () => {
			const warnings = validateAgentConfig('TestAgent', {
				model: 'openai/gpt-5.2',
				thinking: { type: 'enabled', budgetTokens: 10000 },
			});
			expect(warnings).toHaveLength(1);
			expect(warnings[0].message).toContain('thinking');
		});

		it('returns no warnings for correct OpenAI config', () => {
			const warnings = validateAgentConfig('TestAgent', {
				model: 'openai/gpt-5.2',
				reasoningEffort: 'high',
			});
			expect(warnings).toHaveLength(0);
		});

		it('returns no warnings for correct Anthropic config', () => {
			const warnings = validateAgentConfig('TestAgent', {
				model: 'anthropic/claude-sonnet-4-5-20250514',
				variant: 'high',
			});
			expect(warnings).toHaveLength(0);
		});

		it('returns no warnings when no model specified', () => {
			const warnings = validateAgentConfig('TestAgent', {});
			expect(warnings).toHaveLength(0);
		});

		it('validateAndWarnConfigs logs all warnings', () => {
			const mockLogger = { warn: vi.fn() };
			validateAndWarnConfigs(
				{
					Agent1: { model: 'anthropic/claude-sonnet-4-5-20250514', reasoningEffort: 'high' },
					Agent2: { model: 'openai/gpt-5.2', variant: 'high' },
				},
				mockLogger
			);
			expect(mockLogger.warn).toHaveBeenCalledTimes(2);
		});
	});
});
