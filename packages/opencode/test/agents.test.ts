import { describe, expect, it } from 'bun:test';
import { agents, getAgentByRole, getAgentById } from '../src/agents';

describe('Agents', () => {
	describe('agent definitions', () => {
		it('exports all 14 agents', () => {
			expect(Object.keys(agents)).toHaveLength(14);
			expect(agents.lead).toBeDefined();
			expect(agents.scout).toBeDefined();
			expect(agents.builder).toBeDefined();
			expect(agents.architect).toBeDefined();
			expect(agents.reviewer).toBeDefined();
			expect(agents.memory).toBeDefined();
			expect(agents.expert).toBeDefined();
			expect(agents['expert-backend']).toBeDefined();
			expect(agents['expert-frontend']).toBeDefined();
			expect(agents['expert-ops']).toBeDefined();
			expect(agents.runner).toBeDefined();
			expect(agents.product).toBeDefined();
			expect(agents.reasoner).toBeDefined();
			expect(agents.monitor).toBeDefined();
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
			expect(getAgentByRole('architect')?.id).toBe('ag-architect');
			expect(getAgentByRole('reviewer')?.id).toBe('ag-reviewer');
			expect(getAgentByRole('memory')?.id).toBe('ag-memory');
			expect(getAgentByRole('expert')?.id).toBe('ag-expert');
			expect(getAgentByRole('runner')?.id).toBe('ag-runner');
			expect(getAgentByRole('product')?.id).toBe('ag-product');
			expect(getAgentByRole('reasoner')?.id).toBe('ag-reasoner');
		});
	});

	describe('getAgentById', () => {
		it('returns correct agent for each id', () => {
			expect(getAgentById('ag-lead')?.role).toBe('lead');
			expect(getAgentById('ag-scout')?.role).toBe('scout');
			expect(getAgentById('ag-builder')?.role).toBe('builder');
			expect(getAgentById('ag-architect')?.role).toBe('architect');
			expect(getAgentById('ag-reviewer')?.role).toBe('reviewer');
			expect(getAgentById('ag-memory')?.role).toBe('memory');
			expect(getAgentById('ag-expert')?.role).toBe('expert');
			expect(getAgentById('ag-runner')?.role).toBe('runner');
			expect(getAgentById('ag-product')?.role).toBe('product');
			expect(getAgentById('ag-reasoner')?.role).toBe('reasoner');
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

		it('Architect agent has GPT Codex with xhigh reasoning', () => {
			const architect = agents.architect;
			expect(architect.defaultModel).toBe('openai/gpt-5.3-codex');
			expect(architect.reasoningEffort).toBe('xhigh');
			expect(architect.temperature).toBe(0.1);
			expect(architect.systemPrompt).toContain('Cadence');
		});

		it('Builder and Architect have different default models', () => {
			expect(agents.builder.defaultModel).not.toBe(agents.architect.defaultModel);
			expect(agents.builder.defaultModel).toContain('anthropic/');
			expect(agents.architect.defaultModel).toContain('openai/');
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

		it('Product agent is read-only with high reasoning', () => {
			expect(agents.product.tools?.exclude).toContain('write');
			expect(agents.product.tools?.exclude).toContain('edit');
			expect(agents.product.tools?.exclude).toContain('bash');
			expect(agents.product.mode).toBe('subagent');
			expect(agents.product.defaultModel).toBe('openai/gpt-5.2');
			expect(agents.product.reasoningEffort).toBe('high');
			expect(agents.product.temperature).toBe(0.3);
			// Phase 2: Clarity features
			expect(agents.product.systemPrompt).toContain('Clarity Interview Workflow');
			expect(agents.product.systemPrompt).toContain('Validation Gates');
			// Phase 3: Cadence integration
			expect(agents.product.systemPrompt).toContain('Cadence Briefing Format');
			expect(agents.product.systemPrompt).toContain('agentuity cloud kv');
			// Phase 4: PRD generation
			expect(agents.product.systemPrompt).toContain('PRD Generation');
		});

		it('Reasoner agent is subagent-only with restricted tools', () => {
			expect(agents.reasoner.mode).toBe('subagent');
			expect(agents.reasoner.tools?.exclude).toContain('write');
			expect(agents.reasoner.tools?.exclude).toContain('edit');
			expect(agents.reasoner.tools?.exclude).toContain('task');
			expect(agents.reasoner.defaultModel).toBe('openai/gpt-5.2');
			expect(agents.reasoner.temperature).toBe(0.3);
		});
	});
});
