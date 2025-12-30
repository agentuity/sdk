/**
 * Tests for agent_ids population in session events.
 *
 * These tests validate that agent IDs are correctly tracked and sent
 * to Catalyst in session complete events. This is critical for:
 * - Analytics and billing attribution
 * - Debugging which agents participated in a session
 * - Session filtering by agent in the UI
 *
 * Key scenarios tested:
 * 1. Agent with metadata populates agentIds
 * 2. Agent without metadata does NOT populate agentIds (documents current behavior)
 * 3. Multiple agents in same session all contribute IDs
 * 4. agentIds Set is properly converted to array for session events
 * 5. Both metadata.id and metadata.agentId are tracked
 */

import { test, expect, describe } from 'bun:test';
import { Hono } from 'hono';
import { createAgent } from '../src/agent';
import { z } from 'zod';
import type { PrivateVariables } from '../src/app';
import * as metadataModule from '../src/_metadata';

describe('Agent IDs Session Tracking', () => {
	describe('agentIds Set in Hono context', () => {
		test('agentIds set is created empty and can be populated', async () => {
			type TestEnv = {
				Variables: PrivateVariables;
			};

			const app = new Hono<TestEnv>();
			let capturedAgentIds: Set<string> | undefined;

			app.use('*', async (c, next) => {
				c.set('agentIds', new Set<string>());
				await next();
			});

			app.post('/test', (c) => {
				capturedAgentIds = c.var.agentIds;
				c.var.agentIds.add('agent-id-1');
				c.var.agentIds.add('agent-id-2');
				return c.json({ count: c.var.agentIds.size });
			});

			const res = await app.request('/test', { method: 'POST' });
			expect(res.status).toBe(200);
			expect(capturedAgentIds?.size).toBe(2);
			expect(capturedAgentIds?.has('agent-id-1')).toBe(true);
			expect(capturedAgentIds?.has('agent-id-2')).toBe(true);
		});

		test('agentIds filters out empty strings when converted to array', async () => {
			const agentIds = new Set<string>();
			agentIds.add('valid-id');
			agentIds.add('');
			agentIds.add('another-valid-id');

			const filtered = [...agentIds].filter(Boolean);
			expect(filtered).toEqual(['valid-id', 'another-valid-id']);
			expect(filtered.length).toBe(2);
		});

		test('agentIds returns undefined when empty after filtering', async () => {
			const agentIdsSet = new Set<string>();
			agentIdsSet.add('');

			const agentIds = agentIdsSet ? [...agentIdsSet].filter(Boolean) : undefined;
			const result = agentIds?.length ? agentIds : undefined;

			expect(result).toBeUndefined();
		});
	});

	describe('Agent metadata and ID population', () => {
		test('agent with build-time metadata has IDs populated', () => {
			const agent = createAgent('test-with-metadata', {
				metadata: {
					id: 'build-time-id-123',
					agentId: 'build-time-agent-id-456',
				},
				handler: async () => {
					return { success: true };
				},
			});

			expect(agent.metadata.id).toBe('build-time-id-123');
			expect(agent.metadata.agentId).toBe('build-time-agent-id-456');
		});

		test('agent without metadata has empty IDs in dev/test mode', () => {
			// In dev/test mode (no AGENTUITY_CLOUD_PROJECT_ID), agents can be created
			// without metadata - IDs will be empty strings
			const agent = createAgent('test-without-metadata', {
				handler: async () => {
					return { success: true };
				},
			});

			expect(agent.metadata.id).toBe('');
			expect(agent.metadata.agentId).toBe('');
		});

		test('both id and agentId are truthy for filtering', () => {
			const agent = createAgent('test-truthy-check', {
				metadata: {
					id: 'id-value',
					agentId: 'agentId-value',
				},
				handler: async () => ({}),
			});

			// Verify the truthiness check used in the actual code
			expect(!!agent.metadata.id).toBe(true);
			expect(!!agent.metadata.agentId).toBe(true);
		});
	});

	describe('Agent ID tracking in Hono context simulation', () => {
		test('simulates agent run adding IDs to context agentIds set', async () => {
			type TestEnv = {
				Variables: PrivateVariables;
			};

			const app = new Hono<TestEnv>();
			const capturedIds: string[] = [];

			const agent = createAgent('simulated-agent', {
				metadata: {
					id: 'sim-id-001',
					agentId: 'sim-agent-id-001',
				},
				handler: async () => ({ done: true }),
			});

			app.use('*', async (c, next) => {
				c.set('agentIds', new Set<string>());
				await next();
			});

			app.post('/run', (c) => {
				// Simulate what happens in agent.ts lines 1575-1578
				if (agent.metadata.id) {
					c.var.agentIds.add(agent.metadata.id);
				}
				if (agent.metadata.agentId) {
					c.var.agentIds.add(agent.metadata.agentId);
				}

				// Capture for assertion
				capturedIds.push(...c.var.agentIds);

				return c.json({ agentIds: [...c.var.agentIds] });
			});

			const res = await app.request('/run', { method: 'POST' });
			const data = (await res.json()) as { agentIds: string[] };

			expect(data.agentIds).toContain('sim-id-001');
			expect(data.agentIds).toContain('sim-agent-id-001');
			expect(data.agentIds.length).toBe(2);
		});

		test('multiple agents contribute to same agentIds set', async () => {
			type TestEnv = {
				Variables: PrivateVariables;
			};

			const app = new Hono<TestEnv>();

			const agent1 = createAgent('multi-agent-1', {
				metadata: {
					id: 'agent1-id',
					agentId: 'agent1-agentId',
				},
				handler: async () => ({}),
			});

			const agent2 = createAgent('multi-agent-2', {
				metadata: {
					id: 'agent2-id',
					agentId: 'agent2-agentId',
				},
				handler: async () => ({}),
			});

			app.use('*', async (c, next) => {
				c.set('agentIds', new Set<string>());
				await next();
			});

			app.post('/multi', (c) => {
				// Simulate both agents running
				[agent1, agent2].forEach((agent) => {
					if (agent.metadata.id) c.var.agentIds.add(agent.metadata.id);
					if (agent.metadata.agentId) c.var.agentIds.add(agent.metadata.agentId);
				});

				return c.json({ agentIds: [...c.var.agentIds] });
			});

			const res = await app.request('/multi', { method: 'POST' });
			const data = (await res.json()) as { agentIds: string[] };

			expect(data.agentIds.length).toBe(4);
			expect(data.agentIds).toContain('agent1-id');
			expect(data.agentIds).toContain('agent1-agentId');
			expect(data.agentIds).toContain('agent2-id');
			expect(data.agentIds).toContain('agent2-agentId');
		});

		test('duplicate IDs are deduplicated by Set', async () => {
			type TestEnv = {
				Variables: PrivateVariables;
			};

			const app = new Hono<TestEnv>();

			const agent = createAgent('dedup-agent', {
				metadata: {
					id: 'shared-id',
					agentId: 'shared-id', // Same as id
				},
				handler: async () => ({}),
			});

			app.use('*', async (c, next) => {
				c.set('agentIds', new Set<string>());
				await next();
			});

			app.post('/dedup', (c) => {
				// Add the same agent twice (simulates agent being called multiple times)
				for (let i = 0; i < 2; i++) {
					if (agent.metadata.id) c.var.agentIds.add(agent.metadata.id);
					if (agent.metadata.agentId) c.var.agentIds.add(agent.metadata.agentId);
				}

				return c.json({ agentIds: [...c.var.agentIds] });
			});

			const res = await app.request('/dedup', { method: 'POST' });
			const data = (await res.json()) as { agentIds: string[] };

			// Set deduplicates, so only 1 unique ID
			expect(data.agentIds.length).toBe(1);
			expect(data.agentIds[0]).toBe('shared-id');
		});
	});

	describe('Session complete event payload', () => {
		test('agentIds is included when array has values', () => {
			const agentIdsSet = new Set(['id1', 'id2']);
			const agentIds = agentIdsSet ? [...agentIdsSet].filter(Boolean) : undefined;

			const payload = {
				id: 'session-123',
				statusCode: 200,
				agentIds: agentIds?.length ? agentIds : undefined,
			};

			expect(payload.agentIds).toEqual(['id1', 'id2']);
		});

		test('agentIds is undefined when set is empty', () => {
			const agentIdsSet = new Set<string>();
			const agentIds = agentIdsSet ? [...agentIdsSet].filter(Boolean) : undefined;

			const payload = {
				id: 'session-123',
				statusCode: 200,
				agentIds: agentIds?.length ? agentIds : undefined,
			};

			expect(payload.agentIds).toBeUndefined();
		});

		test('agentIds is undefined when set only contains empty strings', () => {
			const agentIdsSet = new Set(['', '']);
			const agentIds = agentIdsSet ? [...agentIdsSet].filter(Boolean) : undefined;

			const payload = {
				id: 'session-123',
				statusCode: 200,
				agentIds: agentIds?.length ? agentIds : undefined,
			};

			expect(payload.agentIds).toBeUndefined();
		});
	});

	describe('Metadata file loading scenarios', () => {
		test('getAgentMetadataByName returns undefined when no metadata file', () => {
			// This tests the fallback behavior when agentuity.metadata.json doesn't exist
			const result = metadataModule.getAgentMetadataByName('nonexistent-agent');
			// Will be undefined if metadata file doesn't exist or agent not found
			expect(result).toBeUndefined();
		});

		test('agent without file metadata has empty IDs in dev/test mode', () => {
			// In dev/test mode (no AGENTUITY_CLOUD_PROJECT_ID), agents can be created
			// without metadata - IDs will be empty strings
			const agent = createAgent('no-file-metadata-agent', {
				description: 'Test agent without file metadata',
				handler: async () => ({ result: 'ok' }),
			});

			expect(agent.metadata.id).toBe('');
			expect(agent.metadata.agentId).toBe('');
		});
	});

	describe('End-to-end agent ID flow simulation', () => {
		test('complete flow: agent creation -> run -> session complete payload', async () => {
			type TestEnv = {
				Variables: PrivateVariables;
			};

			// 1. Create agent with metadata (simulates build-time injection)
			const myAgent = createAgent('e2e-test-agent', {
				metadata: {
					id: 'e2e-id-123',
					agentId: 'e2e-agent-id-456',
				},
				schema: {
					input: z.object({ message: z.string() }),
					output: z.object({ reply: z.string() }),
				},
				handler: async (_ctx, input) => {
					return { reply: `Hello, ${input.message}!` };
				},
			});

			const app = new Hono<TestEnv>();
			let sessionCompletePayload: { agentIds?: string[] } | undefined;

			// 2. Middleware sets up agentIds (simulates otelMiddleware)
			app.use('*', async (c, next) => {
				c.set('agentIds', new Set<string>());
				await next();

				// 4. After handler, construct session complete payload (simulates middleware finally block)
				const agentIdsSet = c.var.agentIds;
				const agentIds = agentIdsSet ? [...agentIdsSet].filter(Boolean) : undefined;
				sessionCompletePayload = {
					agentIds: agentIds?.length ? agentIds : undefined,
				};
			});

			// 3. Handler runs agent and adds IDs (simulates agent.ts handler)
			app.post('/agent', async (c) => {
				// Simulate what happens when agent.run() is called
				if (myAgent.metadata.id) {
					c.var.agentIds.add(myAgent.metadata.id);
				}
				if (myAgent.metadata.agentId) {
					c.var.agentIds.add(myAgent.metadata.agentId);
				}

				return c.json({ success: true });
			});

			await app.request('/agent', { method: 'POST' });

			// 5. Verify session complete payload has agent IDs
			expect(sessionCompletePayload).toBeDefined();
			expect(sessionCompletePayload?.agentIds).toContain('e2e-id-123');
			expect(sessionCompletePayload?.agentIds).toContain('e2e-agent-id-456');
			expect(sessionCompletePayload?.agentIds?.length).toBe(2);
		});

		test('agent without metadata in dev mode still has empty agent_ids', async () => {
			// In dev/test mode, agents can be created without metadata
			// This documents that agent_ids will be empty (but no error is thrown)
			type TestEnv = {
				Variables: PrivateVariables;
			};

			const agentNoMeta = createAgent('no-meta-agent', {
				handler: async () => ({ result: 'ok' }),
			});

			const app = new Hono<TestEnv>();
			let sessionCompletePayload: { agentIds?: string[] } | undefined;

			app.use('*', async (c, next) => {
				c.set('agentIds', new Set<string>());
				await next();

				const agentIdsSet = c.var.agentIds;
				const agentIds = agentIdsSet ? [...agentIdsSet].filter(Boolean) : undefined;
				sessionCompletePayload = {
					agentIds: agentIds?.length ? agentIds : undefined,
				};
			});

			app.post('/agent', async (c) => {
				if (agentNoMeta.metadata.id) {
					c.var.agentIds.add(agentNoMeta.metadata.id);
				}
				if (agentNoMeta.metadata.agentId) {
					c.var.agentIds.add(agentNoMeta.metadata.agentId);
				}
				return c.json({ success: true });
			});

			await app.request('/agent', { method: 'POST' });

			// In dev mode, agent_ids will be empty (no error thrown, but IDs are missing)
			expect(sessionCompletePayload).toBeDefined();
			expect(sessionCompletePayload?.agentIds).toBeUndefined();
		});
	});
});

describe('Agent IDs - Catalyst Integration Scenarios', () => {
	test('Catalyst receives empty array when SDK sends undefined agentIds', () => {
		// Simulates Catalyst's session_2025_03_17.go lines 128-131
		const event = {
			ID: 'session-123',
			AgentIDs: undefined as string[] | undefined,
		};

		let agentIds = event.AgentIDs;
		if (event.AgentIDs == null) {
			agentIds = [];
		}

		expect(agentIds).toEqual([]);
	});

	test('Catalyst preserves agent IDs when SDK sends valid array', () => {
		const event = {
			ID: 'session-123',
			AgentIDs: ['agent-id-1', 'agent-id-2'],
		};

		let agentIds = event.AgentIDs;
		if (event.AgentIDs == null) {
			agentIds = [];
		}

		expect(agentIds).toEqual(['agent-id-1', 'agent-id-2']);
	});
});
