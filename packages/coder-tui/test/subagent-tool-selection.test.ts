import { describe, expect, it } from 'bun:test';
import type { AgentDefinition } from '../src/protocol.ts';
import { selectSubAgentToolNames } from '../src/subagent-tool-selection.ts';

function createAgent(overrides?: Partial<AgentDefinition>): AgentDefinition {
	return {
		name: 'runner',
		source: 'builtin',
		description: 'test',
		systemPrompt: 'test',
		tools: ['read', 'grep', 'find', 'ls'],
		readOnly: true,
		...overrides,
	};
}

describe('selectSubAgentToolNames', () => {
	it('uses the read-only baseline for read-only agents without bash', () => {
		expect(selectSubAgentToolNames(createAgent())).toEqual(['read', 'grep', 'find', 'ls']);
	});

	it('switches to the coding baseline when a read-only agent declares bash', () => {
		expect(
			selectSubAgentToolNames(createAgent({ tools: ['read', 'bash', 'ls'], readOnly: true }))
		).toEqual(['read', 'bash']);
	});

	it('keeps the legacy fallback for non-strict agents when declarations do not match', () => {
		expect(selectSubAgentToolNames(createAgent({ tools: ['totally_unknown_tool'] }))).toEqual([
			'read',
			'grep',
			'find',
			'ls',
		]);
	});

	it('keeps custom agents deny-by-default when declarations do not match', () => {
		expect(
			selectSubAgentToolNames(
				createAgent({
					name: 'qa-review',
					source: 'custom',
					tools: ['totally_unknown_tool'],
				})
			)
		).toEqual([]);
	});

	it('does not widen tool access for strict custom agents when names do not match', () => {
		expect(
			selectSubAgentToolNames(
				createAgent({
					name: 'code-review',
					source: 'custom',
					tools: ['totally_unknown_tool'],
					strictToolSelection: true,
				})
			)
		).toEqual([]);
	});

	it('returns the coding baseline for non-read-only agents without declared Pi tools', () => {
		expect(
			selectSubAgentToolNames(
				createAgent({
					readOnly: false,
					tools: undefined,
				})
			)
		).toEqual(['read', 'bash', 'edit', 'write']);
	});
});
