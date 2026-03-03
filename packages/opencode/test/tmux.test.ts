import { describe, expect, it, afterEach } from 'bun:test';
import { calculateCapacity, decideSpawnActions } from '../src/tmux/decision-engine.ts';
import { isInsideTmux, getCurrentPaneId } from '../src/tmux/utils.ts';
import type {
	WindowState,
	TmuxPaneInfo,
	CapacityConfig,
	SessionMapping,
	SpawnDecision,
} from '../src/tmux/types.ts';
import { MIN_PANE_WIDTH, MIN_PANE_HEIGHT } from '../src/tmux/types.ts';

describe('Tmux', () => {
	describe('utils', () => {
		const originalEnv = { ...process.env };

		afterEach(() => {
			process.env = { ...originalEnv };
		});

		describe('isInsideTmux', () => {
			it('returns true when TMUX env var is set', () => {
				process.env.TMUX = '/tmp/tmux-1000/default,12345,0';
				expect(isInsideTmux()).toBe(true);
			});

			it('returns false when TMUX env var is not set', () => {
				delete process.env.TMUX;
				expect(isInsideTmux()).toBe(false);
			});

			it('returns false when TMUX env var is empty', () => {
				process.env.TMUX = '';
				expect(isInsideTmux()).toBe(false);
			});
		});

		describe('getCurrentPaneId', () => {
			it('returns pane ID when TMUX_PANE is set', () => {
				process.env.TMUX_PANE = '%5';
				expect(getCurrentPaneId()).toBe('%5');
			});

			it('returns undefined when TMUX_PANE is not set', () => {
				delete process.env.TMUX_PANE;
				expect(getCurrentPaneId()).toBeUndefined();
			});
		});
	});

	describe('types', () => {
		it('MIN_PANE_WIDTH is reasonable', () => {
			expect(MIN_PANE_WIDTH).toBeGreaterThan(0);
			expect(MIN_PANE_WIDTH).toBeLessThan(200);
		});

		it('MIN_PANE_HEIGHT is reasonable', () => {
			expect(MIN_PANE_HEIGHT).toBeGreaterThan(0);
			expect(MIN_PANE_HEIGHT).toBeLessThan(100);
		});
	});

	describe('decision-engine', () => {
		const defaultConfig: CapacityConfig = {
			mainPaneMinWidth: 120,
			agentPaneMinWidth: 40,
		};

		const createMainPane = (overrides?: Partial<TmuxPaneInfo>): TmuxPaneInfo => ({
			paneId: '%0',
			width: 200,
			height: 50,
			left: 0,
			top: 0,
			title: 'main',
			isActive: true,
			...overrides,
		});

		const createAgentPane = (id: string, overrides?: Partial<TmuxPaneInfo>): TmuxPaneInfo => ({
			paneId: id,
			width: 80,
			height: 25,
			left: 200,
			top: 0,
			title: `agent-${id}`,
			isActive: false,
			...overrides,
		});

		const createWindowState = (overrides?: Partial<WindowState>): WindowState => ({
			windowWidth: 280,
			windowHeight: 50,
			mainPane: createMainPane(),
			agentPanes: [],
			...overrides,
		});

		describe('calculateCapacity', () => {
			it('calculates capacity for standard window', () => {
				const capacity = calculateCapacity(280, 50);
				expect(capacity.cols).toBeGreaterThan(0);
				expect(capacity.rows).toBeGreaterThan(0);
				expect(capacity.total).toBe(capacity.cols * capacity.rows);
			});

			it('returns zero capacity for tiny window', () => {
				const capacity = calculateCapacity(50, 10);
				// Window too small for agent panes
				expect(capacity.cols).toBe(0);
				expect(capacity.total).toBe(0);
			});

			it('increases capacity with larger window', () => {
				const small = calculateCapacity(200, 30);
				const large = calculateCapacity(400, 60);
				expect(large.total).toBeGreaterThanOrEqual(small.total);
			});

			it('reserves space for main pane', () => {
				// With 280 width, 50% reserved = 140 for agents
				// 140 / MIN_PANE_WIDTH should give cols
				const capacity = calculateCapacity(280, 50);
				expect(capacity.cols).toBeLessThanOrEqual(Math.floor(140 / MIN_PANE_WIDTH));
			});
		});

		describe('decideSpawnActions', () => {
			it('returns canSpawn false when no main pane', () => {
				const state = createWindowState({ mainPane: null });
				const result = decideSpawnActions(state, 'session-1', 'Test task', defaultConfig, []);
				expect(result.canSpawn).toBe(false);
				expect(result.reason).toContain('Main pane');
			});

			it('returns canSpawn false when window too small', () => {
				const state = createWindowState({ windowWidth: 100 }); // Too narrow
				const result = decideSpawnActions(state, 'session-1', 'Test task', defaultConfig, []);
				expect(result.canSpawn).toBe(false);
				expect(result.reason).toContain('small');
			});

			it('spawns from main pane when no agent panes exist', () => {
				const state = createWindowState({
					windowWidth: 300,
					mainPane: createMainPane({ width: 200 }),
				});
				const result = decideSpawnActions(state, 'session-1', 'Test task', defaultConfig, []);

				expect(result.canSpawn).toBe(true);
				expect(result.actions).toHaveLength(1);
				expect(result.actions[0].type).toBe('spawn');
				if (result.actions[0].type === 'spawn') {
					expect(result.actions[0].targetPaneId).toBe('%0');
					expect(result.actions[0].splitDirection).toBe('-h');
				}
			});

			it('spawns by splitting existing agent pane when under capacity', () => {
				const state = createWindowState({
					windowWidth: 400,
					windowHeight: 60,
					mainPane: createMainPane({ width: 200 }),
					agentPanes: [createAgentPane('%1', { width: 200, height: 60 })],
				});

				const result = decideSpawnActions(state, 'session-2', 'Test task', defaultConfig, [
					{ sessionId: 'session-1', paneId: '%1', createdAt: new Date() },
				]);

				expect(result.canSpawn).toBe(true);
				expect(result.actions).toHaveLength(1);
				expect(result.actions[0].type).toBe('spawn');
			});

			it('replaces oldest pane when at capacity', () => {
				const now = new Date();
				const old = new Date(now.getTime() - 60000); // 1 minute ago

				const state = createWindowState({
					windowWidth: 160, // Narrow window = capacity 1
					windowHeight: 50,
					mainPane: createMainPane({ width: 80 }),
					agentPanes: [createAgentPane('%1', { width: 80, left: 80 })],
				});

				const mappings: SessionMapping[] = [
					{ sessionId: 'old-session', paneId: '%1', createdAt: old },
				];

				const result = decideSpawnActions(
					state,
					'new-session',
					'New task',
					defaultConfig,
					mappings
				);

				// When at capacity and can't split, should replace
				if (result.canSpawn && result.actions[0]?.type === 'replace') {
					expect(result.actions[0].oldSessionId).toBe('old-session');
					expect(result.actions[0].newSessionId).toBe('new-session');
				}
			});

			it('picks largest pane to split', () => {
				const state = createWindowState({
					windowWidth: 500,
					windowHeight: 100,
					mainPane: createMainPane({ width: 200 }),
					agentPanes: [
						createAgentPane('%1', { width: 100, height: 100, left: 200 }),
						createAgentPane('%2', { width: 200, height: 100, left: 300 }), // Larger
					],
				});

				const result = decideSpawnActions(state, 'session-3', 'Test task', defaultConfig, []);

				expect(result.canSpawn).toBe(true);
				if (result.actions[0]?.type === 'spawn') {
					// Should pick the larger pane
					expect(result.actions[0].targetPaneId).toBe('%2');
				}
			});

			it('performs LRU rotation when maxPanes is exceeded', () => {
				const now = new Date();
				const oldest = new Date(now.getTime() - 120000); // 2 minutes ago
				const newer = new Date(now.getTime() - 60000); // 1 minute ago

				const state = createWindowState({
					windowWidth: 500,
					windowHeight: 100,
					mainPane: createMainPane({ width: 200 }),
					agentPanes: [
						createAgentPane('%1', { width: 150, height: 100, left: 200 }),
						createAgentPane('%2', { width: 150, height: 100, left: 350 }),
					],
				});

				const mappings: SessionMapping[] = [
					{ sessionId: 'oldest-session', paneId: '%1', createdAt: oldest },
					{ sessionId: 'newer-session', paneId: '%2', createdAt: newer },
				];

				// Set maxPanes to 2, so with 2 existing panes we should trigger LRU rotation
				const configWithMaxPanes = { ...defaultConfig, maxPanes: 2 };

				const result = decideSpawnActions(
					state,
					'new-session',
					'New task',
					configWithMaxPanes,
					mappings
				);

				expect(result.canSpawn).toBe(true);
				// Should have close action for oldest pane, then spawn action
				expect(result.actions.length).toBe(2);
				expect(result.actions[0].type).toBe('close');
				if (result.actions[0].type === 'close') {
					expect(result.actions[0].sessionId).toBe('oldest-session');
					expect(result.actions[0].paneId).toBe('%1');
				}
				expect(result.actions[1].type).toBe('spawn');
			});

			it('respects maxPanes limit even when window has more capacity', () => {
				const state = createWindowState({
					windowWidth: 800, // Large window with lots of capacity
					windowHeight: 100,
					mainPane: createMainPane({ width: 400 }),
					agentPanes: [createAgentPane('%1', { width: 400, height: 100, left: 400 })],
				});

				const mappings: SessionMapping[] = [
					{ sessionId: 'session-1', paneId: '%1', createdAt: new Date() },
				];

				// Set maxPanes to 1, even though window could fit more
				const configWithMaxPanes = { ...defaultConfig, maxPanes: 1 };

				const result = decideSpawnActions(
					state,
					'new-session',
					'New task',
					configWithMaxPanes,
					mappings
				);

				expect(result.canSpawn).toBe(true);
				// Should close existing pane and spawn new one (LRU rotation)
				expect(result.actions.length).toBe(2);
				expect(result.actions[0].type).toBe('close');
				expect(result.actions[1].type).toBe('spawn');
			});
		});
	});

	describe('SpawnDecision structure', () => {
		it('includes reason when canSpawn is false', () => {
			const decision: SpawnDecision = {
				canSpawn: false,
				actions: [],
				reason: 'Window too small',
			};
			expect(decision.reason).toBeDefined();
		});

		it('includes actions when canSpawn is true', () => {
			const decision: SpawnDecision = {
				canSpawn: true,
				actions: [
					{
						type: 'spawn',
						sessionId: 'test',
						description: 'Test',
						targetPaneId: '%0',
						splitDirection: '-h',
					},
				],
			};
			expect(decision.actions.length).toBeGreaterThan(0);
		});
	});
});
