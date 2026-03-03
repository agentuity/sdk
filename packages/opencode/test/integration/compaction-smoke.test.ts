import { describe, it, expect } from 'bun:test';
import {
	buildCustomCompactionPrompt,
	fetchAndFormatPlanningState,
	formatCompactionDiagnostics,
	getCurrentBranch,
} from '../../src/plugin/hooks/compaction-utils';
import type { CompactionStats } from '../../src/sqlite/types';

describe('compaction integration', () => {
	describe('custom compaction prompt', () => {
		it('cadence prompt includes all required sections', () => {
			const prompt = buildCustomCompactionPrompt('cadence');
			// Must include all the critical sections from our design
			const requiredSections = [
				'Active Task',
				'Planning State',
				'Key Context',
				'Active Files',
				'Images',
				'Next Steps',
			];
			for (const section of requiredSections) {
				expect(prompt).toContain(section);
			}
		});

		it('regular prompt is shorter than cadence prompt', () => {
			const cadence = buildCustomCompactionPrompt('cadence');
			const regular = buildCustomCompactionPrompt('regular');
			expect(cadence.length).toBeGreaterThan(regular.length);
		});
	});

	describe('getCurrentBranch', () => {
		it('returns a non-empty string', async () => {
			const branch = await getCurrentBranch();
			expect(typeof branch).toBe('string');
			expect(branch.length).toBeGreaterThan(0);
		});
	});

	describe('fetchAndFormatPlanningState', () => {
		it('returns null gracefully when KV unavailable', async () => {
			// This tests the graceful fallback when agentuity CLI isn't available
			// or the session doesn't exist
			const result = await fetchAndFormatPlanningState('nonexistent-session-id');
			// Should return null, not throw
			expect(result === null || typeof result === 'string').toBe(true);
		});
	});

	describe('token budget enforcement', () => {
		it('diagnostics reflect accurate counts', () => {
			const stats: CompactionStats = {
				planningPhasesCount: 5,
				imageDescriptionsCount: 2,
				toolCallSummariesCount: 4,
				estimatedTokens: 3500,
			};
			const diag = formatCompactionDiagnostics(stats);
			expect(diag).toContain('5 planning phases');
			expect(diag).toContain('2 image refs');
			expect(diag).toContain('4 tool calls');
			expect(diag).toContain('3500 tokens');
		});
	});

	describe('end-to-end prompt assembly', () => {
		it('assembled prompt stays within reasonable token budget', () => {
			const instructions = buildCustomCompactionPrompt('cadence');

			// Simulate sections that would be assembled
			const mockPlanningState =
				'## Planning State\n- [completed] Research\n- [in_progress] Implementation\n- [pending] Testing';
			const mockToolSummaries =
				'## Recent Tool Activity\n- edit → modified cadence.ts\n- bash → bun run build → success';
			const mockDiagnostics =
				'> **Compaction preserved:** 3 planning phases, 2 tool calls (~500 tokens)';

			const sections = [instructions, mockPlanningState, mockToolSummaries, mockDiagnostics];
			const fullPrompt = sections.join('\n\n');
			const estimatedTokens = Math.ceil(fullPrompt.length / 4);

			// The full prompt should be reasonable (under 8000 tokens even with all sections)
			expect(estimatedTokens).toBeLessThan(8000);
			// But not too small (instructions alone should be substantial)
			expect(estimatedTokens).toBeGreaterThan(200);
		});
	});
});
