import { describe, it, expect, mock } from 'bun:test';
import type { PluginInput } from '@opencode-ai/plugin';
import { createCadenceHooks } from '../../src/plugin/hooks/cadence';
import { createSessionMemoryHooks } from '../../src/plugin/hooks/session-memory';

/**
 * Integration tests for the compaction hook flow.
 *
 * These verify the end-to-end routing between Cadence and session-memory
 * compaction paths, including post-compaction event routing and false
 * positive prevention.
 *
 * External dependencies (KV, SQLite, git) are mocked to keep tests fast
 * and hermetic.
 */

// ---------------------------------------------------------------------------
// Mocks for compaction-utils (KV, SQLite, git)
// ---------------------------------------------------------------------------

// We mock the entire compaction-utils module so that no real Bun.spawn or KV
// calls are made.  Each mock returns a safe no-op / null value.
mock.module('../../src/plugin/hooks/compaction-utils', () => ({
	getCurrentBranch: async () => 'test-branch',
	buildCustomCompactionPrompt: (mode: 'cadence' | 'regular') => {
		const cadenceSection =
			mode === 'cadence'
				? `

## Cadence Loop State
- Loop ID, iteration number, max iterations
- Current phase and what's in progress
- Whether this is a Lead-of-Leads session with child tasks`
				: '';

		return `You are generating a continuation context for a multi-agent coding system (Agentuity Coder). Your summary will be the ONLY context the orchestrating Lead agent has after this compaction. Preserve everything needed for seamless continuation.

## CRITICAL \u2014 Preserve These Verbatim
1. The current task/objective (quote the user's original request exactly)
2. All background task IDs (bg_xxx) with status, purpose, and session IDs
3. Active planning state: current phase, completed phases, next steps, blockers
4. ALL file paths being actively worked on (with role: created/modified/read)
5. Key decisions made and their rationale
6. Any corrections or gotchas discovered during the session
7. Todo list state (what's done, in progress, pending)
8. Descriptions of any images or attachments that appeared in conversation${cadenceSection}

## Structure Your Summary As:

### Active Task
[Verbatim objective + what the agent was doing when compaction fired]

### Planning State
[Phases with status. Include phase notes, not just titles.]

### Background Tasks
[bg_xxx: description \u2192 status (running/completed/errored). Include session IDs.]

### Key Context
[Decisions, constraints, user preferences, corrections discovered]

### Active Files
[filepath \u2192 role (creating/modifying/reading) + what's being done to it]

### Images & Attachments
[Describe any images/screenshots: what they showed, when they appeared, why they mattered]

### Next Steps
[What should happen immediately after compaction resumes]

## Rules
- Use specific file paths, task IDs, phase names \u2014 NOT vague references.
- State what tools returned, not just that they were called.
- NEVER drop background task references \u2014 the agent MUST know what's still running.
- Prefer completeness over brevity \u2014 this is the agent's entire working memory.`;
	},
	fetchAndFormatPlanningState: async () => null,
	getImageDescriptions: () => null,
	getRecentToolCallSummaries: () => null,
	storePreCompactionSnapshot: async () => {},
	persistCadenceStateToKV: async () => {},
	restoreCadenceStateFromKV: async () => null,
	formatCompactionDiagnostics: () => '',
	countListItems: (s: string | null) => {
		if (!s) return 0;
		return (s.match(/^- /gm) ?? []).length;
	},
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockCtx() {
	const capturedPrompts: Array<{
		path: { id: string };
		body: { parts: Array<{ type: string; text: string }>; agent?: string };
	}> = [];
	const logMessages: string[] = [];

	const ctx = {
		client: {
			app: {
				log: (args: { body: { message: string } }) => {
					logMessages.push(args.body.message);
				},
			},
			tui: {
				showToast: () => {},
			},
			session: {
				prompt: async (args: unknown) => {
					capturedPrompts.push(
						args as {
							path: { id: string };
							body: {
								parts: Array<{ type: string; text: string }>;
								agent?: string;
							};
						}
					);
				},
			},
		},
	} as unknown as PluginInput;

	return { ctx, capturedPrompts, logMessages };
}

function createMockConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		compaction: {
			customPrompt: true,
			inlinePlanning: true,
			imageAwareness: true,
			snapshotToKV: true,
			maxContextTokens: 4000,
			toolCallSummaryLimit: 5,
			...overrides,
		},
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('compaction flow integration', () => {
	describe('Test A: Non-Cadence session compaction (session-memory path)', () => {
		it('sets output.prompt with continuation context', async () => {
			const { ctx } = createMockCtx();
			const config = createMockConfig();
			const hooks = createSessionMemoryHooks(ctx, config);

			const output: { context: string[]; prompt?: string } = { context: [] };
			await hooks.onCompacting({ sessionID: 'test-123' }, output);

			expect(output.prompt).toBeDefined();
			expect(typeof output.prompt).toBe('string');
		});

		it('prompt contains continuation context instructions', async () => {
			const { ctx } = createMockCtx();
			const config = createMockConfig();
			const hooks = createSessionMemoryHooks(ctx, config);

			const output: { context: string[]; prompt?: string } = { context: [] };
			await hooks.onCompacting({ sessionID: 'test-123' }, output);

			expect(output.prompt).toContain('You are generating a continuation context');
		});

		it('prompt includes session memory section with session ID', async () => {
			const { ctx } = createMockCtx();
			const config = createMockConfig();
			const hooks = createSessionMemoryHooks(ctx, config);

			const output: { context: string[]; prompt?: string } = { context: [] };
			await hooks.onCompacting({ sessionID: 'test-123' }, output);

			expect(output.prompt).toContain('Session Memory');
			expect(output.prompt).toContain('test-123');
		});

		it('prompt does NOT contain Cadence Loop State', async () => {
			const { ctx } = createMockCtx();
			const config = createMockConfig();
			const hooks = createSessionMemoryHooks(ctx, config);

			const output: { context: string[]; prompt?: string } = { context: [] };
			await hooks.onCompacting({ sessionID: 'test-123' }, output);

			expect(output.prompt).not.toContain('Cadence Loop State');
		});
	});

	describe('Test B: Cadence session compaction (cadence path)', () => {
		it('sets output.prompt with Cadence-specific content after activation', async () => {
			const { ctx } = createMockCtx();
			const config = createMockConfig();
			const lastUserMessages = new Map<string, string>();

			const hooks = createCadenceHooks(ctx, config, undefined, undefined, lastUserMessages);

			// Activate Cadence for this session by simulating a user message
			// containing [CADENCE MODE]
			lastUserMessages.set('test-123', '[CADENCE MODE] Start working');
			await hooks.onMessage(
				{ sessionID: 'test-123' },
				{ parts: [{ type: 'text', text: 'Acknowledged.' }] }
			);

			// Verify activation
			expect(hooks.isActiveCadenceSession('test-123')).toBe(true);

			// Now trigger compaction
			const output: { context: string[]; prompt?: string } = { context: [] };
			await hooks.onCompacting({ sessionID: 'test-123' }, output);

			expect(output.prompt).toBeDefined();
			expect(typeof output.prompt).toBe('string');
		});

		it('cadence compaction prompt contains Cadence Loop State section', async () => {
			const { ctx } = createMockCtx();
			const config = createMockConfig();
			const lastUserMessages = new Map<string, string>();

			const hooks = createCadenceHooks(ctx, config, undefined, undefined, lastUserMessages);

			// Activate Cadence
			lastUserMessages.set('test-123', '[CADENCE MODE] Start working');
			await hooks.onMessage(
				{ sessionID: 'test-123' },
				{ parts: [{ type: 'text', text: 'Acknowledged.' }] }
			);

			const output: { context: string[]; prompt?: string } = { context: [] };
			await hooks.onCompacting({ sessionID: 'test-123' }, output);

			expect(output.prompt).toContain('Cadence Loop State');
		});

		it('cadence compaction prompt includes CADENCE MODE ACTIVE section', async () => {
			const { ctx } = createMockCtx();
			const config = createMockConfig();
			const lastUserMessages = new Map<string, string>();

			const hooks = createCadenceHooks(ctx, config, undefined, undefined, lastUserMessages);

			// Activate Cadence
			lastUserMessages.set('test-123', '[CADENCE MODE] Start working');
			await hooks.onMessage(
				{ sessionID: 'test-123' },
				{ parts: [{ type: 'text', text: 'Acknowledged.' }] }
			);

			const output: { context: string[]; prompt?: string } = { context: [] };
			await hooks.onCompacting({ sessionID: 'test-123' }, output);

			expect(output.prompt).toContain('CADENCE MODE ACTIVE');
			expect(output.prompt).toContain('test-123');
		});

		it('non-activated session falls through (no prompt set)', async () => {
			const { ctx } = createMockCtx();
			const config = createMockConfig();
			const lastUserMessages = new Map<string, string>();

			const hooks = createCadenceHooks(ctx, config, undefined, undefined, lastUserMessages);

			// Do NOT activate Cadence
			const output: { context: string[]; prompt?: string } = { context: [] };
			await hooks.onCompacting({ sessionID: 'test-999' }, output);

			// Should not set prompt since session is not in Cadence mode
			expect(output.prompt).toBeUndefined();
		});
	});

	describe('Test C: Post-compaction event routing', () => {
		it('non-Cadence: session.compacted sends [COMPACTION COMPLETE]', async () => {
			const { ctx, capturedPrompts } = createMockCtx();
			const config = createMockConfig();
			const hooks = createSessionMemoryHooks(ctx, config);

			await hooks.onEvent({
				event: {
					type: 'session.compacted',
					properties: { sessionId: 'test-456' },
				},
			});

			expect(capturedPrompts.length).toBe(1);
			const promptText = capturedPrompts[0]!.body.parts[0]!.text;
			expect(promptText).toContain('[COMPACTION COMPLETE]');
			expect(promptText).toContain('test-456');
		});

		it('non-Cadence: session.compacted directs to Lead agent', async () => {
			const { ctx, capturedPrompts } = createMockCtx();
			const config = createMockConfig();
			const hooks = createSessionMemoryHooks(ctx, config);

			await hooks.onEvent({
				event: {
					type: 'session.compacted',
					properties: { sessionId: 'test-456' },
				},
			});

			expect(capturedPrompts[0]!.body.agent).toBe('Agentuity Coder Lead');
			expect(capturedPrompts[0]!.path.id).toBe('test-456');
		});

		it('Cadence: session.compacted sends [CADENCE COMPACTION COMPLETE]', async () => {
			const { ctx, capturedPrompts } = createMockCtx();
			const config = createMockConfig();
			const lastUserMessages = new Map<string, string>();

			const hooks = createCadenceHooks(ctx, config, undefined, undefined, lastUserMessages);

			// Activate Cadence first
			lastUserMessages.set('test-789', '[CADENCE MODE] Start');
			await hooks.onMessage(
				{ sessionID: 'test-789' },
				{ parts: [{ type: 'text', text: 'OK' }] }
			);
			expect(hooks.isActiveCadenceSession('test-789')).toBe(true);

			// Fire compacted event
			await hooks.onEvent({
				event: {
					type: 'session.compacted',
					properties: { sessionId: 'test-789' },
				},
			});

			expect(capturedPrompts.length).toBe(1);
			const promptText = capturedPrompts[0]!.body.parts[0]!.text;
			expect(promptText).toContain('[CADENCE COMPACTION COMPLETE]');
			expect(promptText).toContain('test-789');
		});

		it('Cadence: post-compaction includes iteration info', async () => {
			const { ctx, capturedPrompts } = createMockCtx();
			const config = createMockConfig();
			const lastUserMessages = new Map<string, string>();

			const hooks = createCadenceHooks(ctx, config, undefined, undefined, lastUserMessages);

			// Activate Cadence
			lastUserMessages.set('test-789', '[CADENCE MODE] Start');
			await hooks.onMessage(
				{ sessionID: 'test-789' },
				{ parts: [{ type: 'text', text: 'OK' }] }
			);

			// Fire compacted event
			await hooks.onEvent({
				event: {
					type: 'session.compacted',
					properties: { sessionId: 'test-789' },
				},
			});

			const promptText = capturedPrompts[0]!.body.parts[0]!.text;
			// Should reference the current iteration
			expect(promptText).toContain('iteration 1');
		});

		it('non-compacted events are ignored by session-memory hooks', async () => {
			const { ctx, capturedPrompts } = createMockCtx();
			const config = createMockConfig();
			const hooks = createSessionMemoryHooks(ctx, config);

			await hooks.onEvent({
				event: {
					type: 'session.idle',
					properties: { sessionId: 'test-456' },
				},
			});

			expect(capturedPrompts.length).toBe(0);
		});
	});

	describe('Test D: False positive prevention (Option A fix)', () => {
		it('model response with "go deep" does NOT activate Cadence', async () => {
			const { ctx } = createMockCtx();
			const config = createMockConfig();
			const lastUserMessages = new Map<string, string>();

			const hooks = createCadenceHooks(ctx, config, undefined, undefined, lastUserMessages);

			// Simulate a user message that does NOT contain Cadence triggers
			lastUserMessages.set('test-fp-1', 'Please fix the bug in auth.ts');

			// Model responds with "go deep" in its output (should NOT trigger)
			await hooks.onMessage(
				{ sessionID: 'test-fp-1' },
				{
					parts: [
						{
							type: 'text',
							text: 'I will go deep into the codebase to find the root cause.',
						},
					],
				}
			);

			expect(hooks.isActiveCadenceSession('test-fp-1')).toBe(false);
		});

		it('model response with "be thorough" does NOT activate Cadence', async () => {
			const { ctx } = createMockCtx();
			const config = createMockConfig();
			const lastUserMessages = new Map<string, string>();

			const hooks = createCadenceHooks(ctx, config, undefined, undefined, lastUserMessages);

			// User message without triggers
			lastUserMessages.set('test-fp-2', 'Review the test coverage');

			// Model responds with "be thorough"
			await hooks.onMessage(
				{ sessionID: 'test-fp-2' },
				{
					parts: [
						{
							type: 'text',
							text: 'I will be thorough in my review of all test files.',
						},
					],
				}
			);

			expect(hooks.isActiveCadenceSession('test-fp-2')).toBe(false);
		});

		it('user message with "go deep" DOES activate Cadence', async () => {
			const { ctx } = createMockCtx();
			const config = createMockConfig();
			const lastUserMessages = new Map<string, string>();

			const hooks = createCadenceHooks(ctx, config, undefined, undefined, lastUserMessages);

			// User explicitly says "go deep"
			lastUserMessages.set('test-fp-3', 'go deep on refactoring the API');

			await hooks.onMessage(
				{ sessionID: 'test-fp-3' },
				{ parts: [{ type: 'text', text: 'Starting deep refactor.' }] }
			);

			expect(hooks.isActiveCadenceSession('test-fp-3')).toBe(true);
		});

		it('user message with "be thorough" DOES activate Cadence', async () => {
			const { ctx } = createMockCtx();
			const config = createMockConfig();
			const lastUserMessages = new Map<string, string>();

			const hooks = createCadenceHooks(ctx, config, undefined, undefined, lastUserMessages);

			// User explicitly says "be thorough"
			lastUserMessages.set('test-fp-4', 'be thorough and check everything');

			await hooks.onMessage(
				{ sessionID: 'test-fp-4' },
				{ parts: [{ type: 'text', text: 'Will do.' }] }
			);

			expect(hooks.isActiveCadenceSession('test-fp-4')).toBe(true);
		});

		it('empty lastUserMessages map means no false positives from model text', async () => {
			const { ctx } = createMockCtx();
			const config = createMockConfig();
			const lastUserMessages = new Map<string, string>();

			const hooks = createCadenceHooks(ctx, config, undefined, undefined, lastUserMessages);

			// No user message recorded at all for this session
			// Model output contains multiple trigger words
			await hooks.onMessage(
				{ sessionID: 'test-fp-5' },
				{
					parts: [
						{
							type: 'text',
							text: 'I will go deep and be thorough. ultrawork mode engaged!',
						},
					],
				}
			);

			expect(hooks.isActiveCadenceSession('test-fp-5')).toBe(false);
		});
	});

	describe('routing orchestration (plugin.ts pattern)', () => {
		it('cadence session routes to cadence hooks, non-cadence to session-memory', async () => {
			const { ctx: ctx1, capturedPrompts: cap1 } = createMockCtx();
			const { ctx: ctx2, capturedPrompts: cap2 } = createMockCtx();
			const config = createMockConfig();
			const lastUserMessages = new Map<string, string>();

			const cadenceHooks = createCadenceHooks(
				ctx1,
				config,
				undefined,
				undefined,
				lastUserMessages
			);
			const sessionMemoryHooks = createSessionMemoryHooks(ctx2, config);

			// Activate Cadence for session-A
			lastUserMessages.set('session-A', '[CADENCE MODE] Start');
			await cadenceHooks.onMessage(
				{ sessionID: 'session-A' },
				{ parts: [{ type: 'text', text: 'OK' }] }
			);

			// --- Compaction routing (mirrors plugin.ts lines 264-276) ---

			// Session-A: should go through cadence path
			const outputA: { context: string[]; prompt?: string } = { context: [] };
			if (cadenceHooks.isActiveCadenceSession('session-A')) {
				await cadenceHooks.onCompacting({ sessionID: 'session-A' }, outputA);
			} else {
				await sessionMemoryHooks.onCompacting({ sessionID: 'session-A' }, outputA);
			}
			expect(outputA.prompt).toContain('CADENCE MODE ACTIVE');

			// Session-B: should go through session-memory path
			const outputB: { context: string[]; prompt?: string } = { context: [] };
			if (cadenceHooks.isActiveCadenceSession('session-B')) {
				await cadenceHooks.onCompacting({ sessionID: 'session-B' }, outputB);
			} else {
				await sessionMemoryHooks.onCompacting({ sessionID: 'session-B' }, outputB);
			}
			expect(outputB.prompt).toContain('Session Memory');
			expect(outputB.prompt).not.toContain('CADENCE MODE ACTIVE');

			// --- Event routing (mirrors plugin.ts lines 241-262) ---

			// Session-A compacted event: should go through cadence path
			if (cadenceHooks.isActiveCadenceSession('session-A')) {
				await cadenceHooks.onEvent({
					event: {
						type: 'session.compacted',
						properties: { sessionId: 'session-A' },
					},
				});
			}
			expect(cap1.length).toBe(1);
			expect(cap1[0]!.body.parts[0]!.text).toContain('[CADENCE COMPACTION COMPLETE]');

			// Session-B compacted event: should go through session-memory path
			if (!cadenceHooks.isActiveCadenceSession('session-B')) {
				await sessionMemoryHooks.onEvent({
					event: {
						type: 'session.compacted',
						properties: { sessionId: 'session-B' },
					},
				});
			}
			expect(cap2.length).toBe(1);
			expect(cap2[0]!.body.parts[0]!.text).toContain('[COMPACTION COMPLETE]');
		});
	});
});
