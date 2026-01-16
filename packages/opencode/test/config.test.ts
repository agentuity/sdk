import { describe, expect, it } from 'bun:test';
import { getDefaultConfig, mergeConfig } from '../src/config/loader';

describe('Config', () => {
	describe('getDefaultConfig', () => {
		it('returns default agent models', () => {
			const config = getDefaultConfig();

			expect(config.agents?.lead?.model).toBe('anthropic/claude-opus-4-5-20251101');
			expect(config.agents?.scout?.model).toBe('anthropic/claude-haiku-4-5-20251001');
			expect(config.agents?.builder?.model).toBe('anthropic/claude-opus-4-5-20251101');
			expect(config.agents?.reviewer?.model).toBe('anthropic/claude-haiku-4-5-20251001');
			expect(config.agents?.memory?.model).toBe('anthropic/claude-haiku-4-5-20251001');
			expect(config.agents?.expert?.model).toBe('anthropic/claude-opus-4-5-20251101');
		});

		it('returns empty disabledMcps by default', () => {
			const config = getDefaultConfig();
			expect(config.disabledMcps).toEqual([]);
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
			expect(merged.agents?.lead?.model).toBe('anthropic/claude-opus-4-5-20251101');
		});

		it('overrides specific agent model', () => {
			const base = getDefaultConfig();
			const override = {
				agents: {
					lead: { model: 'openai/gpt-4o' },
				},
			};

			const merged = mergeConfig(base, override);
			expect(merged.agents?.lead?.model).toBe('openai/gpt-4o');
		});

		it('overrides disabledMcps', () => {
			const base = getDefaultConfig();
			const override = { disabledMcps: ['websearch'] };

			const merged = mergeConfig(base, override);
			expect(merged.disabledMcps).toEqual(['websearch']);
		});
	});
});
