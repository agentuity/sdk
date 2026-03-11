import { describe, expect, it } from 'bun:test';
import {
	buildProjectionFromEntries,
	normalizeStreamProjection,
	shouldReplaceStreamProjection,
} from '../src/hub-overlay-state.ts';

describe('hub overlay stream projection helpers', () => {
	it('normalizes sparse stream projections into concrete buffers', () => {
		expect(
			normalizeStreamProjection({
				output: 'lead output',
				tasks: {
					task_1: {
						thinking: 'task thinking',
					},
				},
			})
		).toEqual({
			output: 'lead output',
			thinking: '',
			tasks: {
				task_1: {
					output: '',
					thinking: 'task thinking',
				},
			},
		});
	});

	it('rebuilds output and thinking buffers from replay-style conversation entries', () => {
		expect(
			buildProjectionFromEntries([
				{ type: 'thinking', content: 'lead thought' },
				{ type: 'message', content: 'lead answer' },
				{ type: 'tool_call', toolName: 'task' },
				{ type: 'task_result', content: 'worker result', taskId: 'task_1' },
				{ type: 'thinking', content: 'worker thought', taskId: 'task_1' },
			])
		).toEqual({
			output: 'lead answer\n\n[tool_call] task\n\n',
			thinking: 'lead thought\n\n',
			tasks: {
				task_1: {
					output: 'worker result\n\n',
					thinking: 'worker thought\n\n',
				},
			},
		});
	});

	it('never lets snapshot, replay, or hydration overwrite live buffers', () => {
		expect(shouldReplaceStreamProjection('live', 'snapshot')).toBe(false);
		expect(shouldReplaceStreamProjection('live', 'replay')).toBe(false);
		expect(shouldReplaceStreamProjection('live', 'hydration')).toBe(false);
	});

	it('allows snapshot, replay, and hydration to replace stale pre-live state in order', () => {
		expect(shouldReplaceStreamProjection('none', 'snapshot')).toBe(true);
		expect(shouldReplaceStreamProjection('snapshot', 'snapshot')).toBe(true);
		expect(shouldReplaceStreamProjection('snapshot', 'replay')).toBe(true);
		expect(shouldReplaceStreamProjection('replay', 'replay')).toBe(true);
		expect(shouldReplaceStreamProjection('snapshot', 'hydration')).toBe(true);
		expect(shouldReplaceStreamProjection('replay', 'hydration')).toBe(true);
		expect(shouldReplaceStreamProjection('hydration', 'hydration')).toBe(true);
		expect(shouldReplaceStreamProjection('hydration', 'replay')).toBe(false);
		expect(shouldReplaceStreamProjection('hydration', 'snapshot')).toBe(false);
	});
});
