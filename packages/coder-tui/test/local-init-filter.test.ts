import { describe, expect, it } from 'bun:test';
import { adaptInitMessageForLocalTui } from '../src/local-init-filter.ts';
import type { InitMessage } from '../src/protocol.ts';

function makeInitMessage(): InitMessage {
	return {
		type: 'init',
		role: 'lead',
		tools: [
			{
				name: 'sandbox_exec',
				label: 'Execute in Sandbox',
				description: 'Run in sandbox',
				parameters: { type: 'object', properties: {} },
			},
			{
				name: 'web_search',
				label: 'Web Search',
				description: 'Search the web',
				parameters: { type: 'object', properties: {} },
			},
		],
		agents: [
			{
				name: 'runner',
				description: 'Runs commands',
				systemPrompt: 'runner prompt',
				hubTools: [
					{
						name: 'sandbox_exec',
						label: 'Execute in Sandbox',
						description: 'Run in sandbox',
						parameters: { type: 'object', properties: {} },
					},
					{
						name: 'loop_get_state',
						label: 'Loop State',
						description: 'Read loop state',
						parameters: { type: 'object', properties: {} },
					},
				],
			},
			{
				name: 'builder',
				description: 'Builds code',
				systemPrompt: 'builder prompt',
				hubTools: [
					{
						name: 'sandbox_exec',
						label: 'Execute in Sandbox',
						description: 'Run in sandbox',
						parameters: { type: 'object', properties: {} },
					},
				],
			},
		],
	};
}

describe('adaptInitMessageForLocalTui', () => {
	it('hides sandbox_exec for local TUI sessions', () => {
		const init = makeInitMessage();

		const filtered = adaptInitMessageForLocalTui(init, { isRemoteSession: false });

		expect(filtered.tools?.map((tool) => tool.name)).toEqual(['web_search']);
		expect(
			filtered.agents
				?.find((agent) => agent.name === 'runner')
				?.hubTools?.map((tool) => tool.name)
		).toEqual(['loop_get_state']);
		expect(filtered.agents?.find((agent) => agent.name === 'builder')?.hubTools).toBeUndefined();

		expect(init.tools?.map((tool) => tool.name)).toEqual(['sandbox_exec', 'web_search']);
		expect(
			init.agents?.find((agent) => agent.name === 'runner')?.hubTools?.map((tool) => tool.name)
		).toEqual(['sandbox_exec', 'loop_get_state']);
	});

	it('preserves sandbox_exec for remote sessions', () => {
		const init = makeInitMessage();

		const filtered = adaptInitMessageForLocalTui(init, { isRemoteSession: true });

		expect(filtered).toBe(init);
		expect(filtered.tools?.map((tool) => tool.name)).toEqual(['sandbox_exec', 'web_search']);
		expect(
			filtered.agents
				?.find((agent) => agent.name === 'runner')
				?.hubTools?.map((tool) => tool.name)
		).toEqual(['sandbox_exec', 'loop_get_state']);
	});
});
