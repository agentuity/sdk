import { describe, it, expect } from 'bun:test';
import {
	buildCustomCompactionPrompt,
	formatCompactionDiagnostics,
	countListItems,
} from '../src/plugin/hooks/compaction-utils.ts';
import type { CompactionStats } from '../src/sqlite/types.ts';

describe('compaction-utils', () => {
	describe('buildCustomCompactionPrompt', () => {
		it('returns cadence prompt with loop state section', () => {
			const prompt = buildCustomCompactionPrompt('cadence');
			expect(prompt).toContain('multi-agent coding system');
			expect(prompt).toContain('Cadence Loop State');
			expect(prompt).toContain('Loop ID');
		});

		it('returns regular prompt without cadence section', () => {
			const prompt = buildCustomCompactionPrompt('regular');
			expect(prompt).toContain('multi-agent coding system');
			expect(prompt).not.toContain('Cadence Loop State');
		});

		it('includes critical preservation instructions', () => {
			const prompt = buildCustomCompactionPrompt('cadence');
			expect(prompt).toContain('Active planning state');
			expect(prompt).toContain('Active Task');
			expect(prompt).toContain('Planning State');
			expect(prompt).toContain('Next Steps');
			expect(prompt).toContain('Images');
		});

		it('includes structure sections in both modes', () => {
			for (const mode of ['cadence', 'regular'] as const) {
				const prompt = buildCustomCompactionPrompt(mode);
				expect(prompt).toContain('### Active Task');
				expect(prompt).toContain('### Key Context');
				expect(prompt).toContain('### Active Files');
				expect(prompt).toContain('### Next Steps');
			}
		});

		it('includes rules about specificity', () => {
			const prompt = buildCustomCompactionPrompt('regular');
			expect(prompt).toContain('specific file paths');
			expect(prompt).toContain('completeness over brevity');
		});
	});

	describe('formatCompactionDiagnostics', () => {
		it('returns empty string when no stats', () => {
			const stats: CompactionStats = {
				planningPhasesCount: 0,
				imageDescriptionsCount: 0,
				toolCallSummariesCount: 0,
				estimatedTokens: 0,
			};
			expect(formatCompactionDiagnostics(stats)).toBe('');
		});

		it('includes all non-zero counts', () => {
			const stats: CompactionStats = {
				planningPhasesCount: 3,
				imageDescriptionsCount: 1,
				toolCallSummariesCount: 5,
				estimatedTokens: 2500,
			};
			const result = formatCompactionDiagnostics(stats);
			expect(result).toContain('3 planning phases');
			expect(result).toContain('1 image refs');
			expect(result).toContain('5 tool calls');
			expect(result).toContain('2500 tokens');
		});

		it('returns empty string when all counts are zero', () => {
			const stats: CompactionStats = {
				planningPhasesCount: 0,
				imageDescriptionsCount: 0,
				toolCallSummariesCount: 0,
				estimatedTokens: 1000,
			};
			// No non-zero counts means no parts, so returns empty
			expect(formatCompactionDiagnostics(stats)).toBe('');
		});

		it('only includes non-zero items', () => {
			const stats: CompactionStats = {
				planningPhasesCount: 0,
				imageDescriptionsCount: 2,
				toolCallSummariesCount: 0,
				estimatedTokens: 500,
			};
			const result = formatCompactionDiagnostics(stats);
			expect(result).toContain('2 image refs');
			expect(result).not.toContain('planning phases');
			expect(result).not.toContain('tool calls');
			expect(result).toContain('500 tokens');
		});

		it('starts with blockquote formatting', () => {
			const stats: CompactionStats = {
				planningPhasesCount: 1,
				imageDescriptionsCount: 0,
				toolCallSummariesCount: 0,
				estimatedTokens: 100,
			};
			const result = formatCompactionDiagnostics(stats);
			expect(result).toMatch(/^> \*\*Compaction preserved:\*\*/);
		});
	});

	describe('countListItems', () => {
		it('returns 0 for null', () => {
			expect(countListItems(null)).toBe(0);
		});

		it('returns 0 for empty string', () => {
			expect(countListItems('')).toBe(0);
		});

		it('counts markdown list items', () => {
			expect(countListItems('- one\n- two\n- three')).toBe(3);
		});

		it('ignores non-list lines', () => {
			expect(countListItems('hello\n- item\nworld')).toBe(1);
		});

		it('counts items with nested content', () => {
			expect(countListItems('- item one\n  continued\n- item two')).toBe(2);
		});

		it('handles single item', () => {
			expect(countListItems('- only one')).toBe(1);
		});

		it('returns 0 for string with no list markers', () => {
			expect(countListItems('just some text\nno lists here')).toBe(0);
		});
	});
});
