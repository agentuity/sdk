import { describe, expect, it } from 'bun:test';
import { agents, getAgentByRole, getAgentById } from '../src/agents';

describe('Agents', () => {
	describe('agent definitions', () => {
		it('exports all 9 agents', () => {
			expect(Object.keys(agents)).toHaveLength(9);
			expect(agents.lead).toBeDefined();
			expect(agents.scout).toBeDefined();
			expect(agents.builder).toBeDefined();
			expect(agents['sr-builder']).toBeDefined();
			expect(agents.reviewer).toBeDefined();
			expect(agents.memory).toBeDefined();
			expect(agents.expert).toBeDefined();
			expect(agents.planner).toBeDefined();
			expect(agents.runner).toBeDefined();
		});

		it('each agent has required properties', () => {
			for (const agent of Object.values(agents)) {
				expect(agent.role).toBeDefined();
				expect(agent.id).toMatch(/^ag-/);
				expect(agent.displayName).toMatch(/^Agentuity Coder /);
				expect(agent.description).toBeDefined();
				expect(agent.defaultModel).toBeDefined();
				expect(agent.systemPrompt).toBeDefined();
			}
		});

		it('agent IDs are unique', () => {
			const ids = Object.values(agents).map((a) => a.id);
			const uniqueIds = new Set(ids);
			expect(uniqueIds.size).toBe(ids.length);
		});

		it('agent display names are unique', () => {
			const names = Object.values(agents).map((a) => a.displayName);
			const uniqueNames = new Set(names);
			expect(uniqueNames.size).toBe(names.length);
		});
	});

	describe('getAgentByRole', () => {
		it('returns correct agent for each role', () => {
			expect(getAgentByRole('lead')?.id).toBe('ag-lead');
			expect(getAgentByRole('scout')?.id).toBe('ag-scout');
			expect(getAgentByRole('builder')?.id).toBe('ag-builder');
			expect(getAgentByRole('sr-builder')?.id).toBe('ag-sr-builder');
			expect(getAgentByRole('reviewer')?.id).toBe('ag-reviewer');
			expect(getAgentByRole('memory')?.id).toBe('ag-memory');
			expect(getAgentByRole('expert')?.id).toBe('ag-expert');
			expect(getAgentByRole('planner')?.id).toBe('ag-planner');
			expect(getAgentByRole('runner')?.id).toBe('ag-runner');
		});
	});

	describe('getAgentById', () => {
		it('returns correct agent for each id', () => {
			expect(getAgentById('ag-lead')?.role).toBe('lead');
			expect(getAgentById('ag-scout')?.role).toBe('scout');
			expect(getAgentById('ag-builder')?.role).toBe('builder');
			expect(getAgentById('ag-sr-builder')?.role).toBe('sr-builder');
			expect(getAgentById('ag-reviewer')?.role).toBe('reviewer');
			expect(getAgentById('ag-memory')?.role).toBe('memory');
			expect(getAgentById('ag-expert')?.role).toBe('expert');
			expect(getAgentById('ag-planner')?.role).toBe('planner');
			expect(getAgentById('ag-runner')?.role).toBe('runner');
		});

		it('returns undefined for unknown id', () => {
			expect(getAgentById('ag-unknown')).toBeUndefined();
		});
	});

	describe('agent prompts', () => {
		it('Memory agent prompt includes KV commands', () => {
			expect(agents.memory.systemPrompt).toContain('agentuity cloud kv');
		});

		it('Builder agent prompt includes sandbox commands', () => {
			expect(agents.builder.systemPrompt).toContain('agentuity cloud sandbox');
		});

		it('Expert agent prompt includes CLI introspection', () => {
			expect(agents.expert.systemPrompt).toContain('agentuity ai schema show');
		});

		it('Scout agent is read-only', () => {
			expect(agents.scout.tools?.exclude).toContain('write');
			expect(agents.scout.tools?.exclude).toContain('edit');
		});

		it('Memory agent cannot write files', () => {
			expect(agents.memory.tools?.exclude).toContain('write');
			expect(agents.memory.tools?.exclude).toContain('edit');
		});

		it('Planner agent is read-only with high reasoning', () => {
			expect(agents.planner.tools?.exclude).toContain('write');
			expect(agents.planner.tools?.exclude).toContain('edit');
			expect(agents.planner.tools?.exclude).toContain('bash');
			expect(agents.planner.reasoningEffort).toBe('xhigh');
			expect(agents.planner.temperature).toBe(0.1);
		});

		it('Sr Builder agent has GPT Codex with xhigh reasoning', () => {
			const srBuilder = agents['sr-builder'];
			expect(srBuilder.defaultModel).toBe('openai/gpt-5.2-codex');
			expect(srBuilder.reasoningEffort).toBe('xhigh');
			expect(srBuilder.temperature).toBe(0.1);
			expect(srBuilder.systemPrompt).toContain('Cadence');
		});

		it('Builder and Sr Builder have different default models', () => {
			expect(agents.builder.defaultModel).not.toBe(agents['sr-builder'].defaultModel);
			expect(agents.builder.defaultModel).toContain('anthropic/');
			expect(agents['sr-builder'].defaultModel).toContain('openai/');
		});

		it('Runner agent is read-only and fast', () => {
			expect(agents.runner.tools?.exclude).toContain('write');
			expect(agents.runner.tools?.exclude).toContain('edit');
			expect(agents.runner.tools?.exclude).toContain('task');
			expect(agents.runner.defaultModel).toBe('anthropic/claude-haiku-4-5-20251001');
			expect(agents.runner.temperature).toBe(0.1);
			expect(agents.runner.systemPrompt).toContain('lint');
			expect(agents.runner.systemPrompt).toContain('build');
			expect(agents.runner.systemPrompt).toContain('test');
		});
	});
});
