import type {
	CapacityConfig,
	PaneAction,
	SessionMapping,
	SpawnDecision,
	WindowState,
} from './types';
import { MIN_PANE_HEIGHT, MIN_PANE_WIDTH } from './types';

/**
 * Extended capacity config that includes maxPanes limit
 */
export interface ExtendedCapacityConfig extends CapacityConfig {
	maxPanes?: number;
}

/**
 * Decide what actions to take to spawn a new agent pane
 *
 * Respects maxPanes limit with LRU rotation:
 * - If current agent panes >= maxPanes, close oldest pane before spawning new one
 * - This implements LRU (Least Recently Used) rotation
 */
export function decideSpawnActions(
	state: WindowState,
	sessionId: string,
	description: string,
	config: ExtendedCapacityConfig,
	sessionMappings: SessionMapping[]
): SpawnDecision {
	if (!state.mainPane) {
		return { canSpawn: false, actions: [], reason: 'Main pane not found.' };
	}

	if (state.windowWidth < config.mainPaneMinWidth + config.agentPaneMinWidth) {
		return { canSpawn: false, actions: [], reason: 'Window too small for split.' };
	}

	const capacity = calculateCapacity(state.windowWidth, state.windowHeight);
	if (capacity.total <= 0) {
		return { canSpawn: false, actions: [], reason: 'Window too small for agent panes.' };
	}

	// Determine effective max panes (user config or calculated capacity)
	const effectiveMaxPanes = config.maxPanes ?? capacity.total;
	const currentPaneCount = state.agentPanes.length;

	// Check if we need LRU rotation (at or over maxPanes limit)
	if (currentPaneCount >= effectiveMaxPanes) {
		// Find oldest pane to close (LRU rotation)
		const oldestMapping = pickOldestPane(sessionMappings);
		if (!oldestMapping) {
			// No tracked sessions, try replacement instead
			const replacement = pickReplacementPane(state, sessionMappings);
			if (!replacement) {
				return { canSpawn: false, actions: [], reason: 'No pane available to replace.' };
			}
			return {
				canSpawn: true,
				actions: [
					{
						type: 'replace',
						paneId: replacement.paneId,
						oldSessionId: replacement.sessionId,
						newSessionId: sessionId,
						description,
					},
				],
			};
		}

		// Close oldest pane, then spawn new one
		const actions: PaneAction[] = [
			{
				type: 'close',
				paneId: oldestMapping.paneId,
				sessionId: oldestMapping.sessionId,
			},
		];

		// After closing, we'll have room to spawn
		// Determine where to spawn the new pane
		if (currentPaneCount === 1) {
			// After closing the only agent pane, split from main
			actions.push({
				type: 'spawn',
				sessionId,
				description,
				targetPaneId: state.mainPane.paneId,
				splitDirection: '-h',
			});
		} else {
			// Find a remaining pane to split (not the one being closed)
			const remainingPanes = state.agentPanes.filter((p) => p.paneId !== oldestMapping.paneId);
			if (remainingPanes.length > 0) {
				const targetPane = pickBestSplitPane(remainingPanes);
				const splitDirection = chooseSplitDirection(targetPane, config.agentPaneMinWidth);
				actions.push({
					type: 'spawn',
					sessionId,
					description,
					targetPaneId: targetPane.paneId,
					splitDirection,
				});
			} else {
				// Fallback: split from main pane
				actions.push({
					type: 'spawn',
					sessionId,
					description,
					targetPaneId: state.mainPane.paneId,
					splitDirection: '-h',
				});
			}
		}

		return { canSpawn: true, actions };
	}

	// Under maxPanes limit - normal spawn logic
	if (state.agentPanes.length === 0) {
		if (!canSplitHorizontally(state.mainPane, config.agentPaneMinWidth)) {
			return { canSpawn: false, actions: [], reason: 'Main pane too narrow to split.' };
		}
		return {
			canSpawn: true,
			actions: [
				{
					type: 'spawn',
					sessionId,
					description,
					targetPaneId: state.mainPane.paneId,
					splitDirection: '-h',
				},
			],
		};
	}

	const targetPane = pickBestSplitPane(state.agentPanes);
	const splitDirection = chooseSplitDirection(targetPane, config.agentPaneMinWidth);
	if (!canSplitPane(targetPane, splitDirection, config.agentPaneMinWidth)) {
		return { canSpawn: false, actions: [], reason: 'No suitable pane to split.' };
	}

	return {
		canSpawn: true,
		actions: [
			{
				type: 'spawn',
				sessionId,
				description,
				targetPaneId: targetPane.paneId,
				splitDirection,
			},
		],
	};
}

/**
 * Calculate grid capacity based on window size
 */
export function calculateCapacity(
	windowWidth: number,
	windowHeight: number
): { cols: number; rows: number; total: number } {
	const reservedWidth = Math.floor(windowWidth * 0.5);
	const agentWidth = Math.max(0, windowWidth - reservedWidth);
	const cols = Math.floor(agentWidth / MIN_PANE_WIDTH);
	const rows = Math.floor(windowHeight / MIN_PANE_HEIGHT);
	return {
		cols: Math.max(0, cols),
		rows: Math.max(0, rows),
		total: Math.max(0, cols * rows),
	};
}

function pickBestSplitPane(panes: WindowState['agentPanes']): WindowState['agentPanes'][number] {
	return panes.reduce((best, pane) => {
		const bestArea = best.width * best.height;
		const area = pane.width * pane.height;
		return area > bestArea ? pane : best;
	});
}

function chooseSplitDirection(
	pane: WindowState['agentPanes'][number],
	minAgentWidth: number
): '-h' | '-v' {
	const canSplitHorizontally = pane.width >= minAgentWidth * 2;
	const canSplitVertically = pane.height >= MIN_PANE_HEIGHT * 2;
	if (canSplitHorizontally && canSplitVertically) {
		return pane.width >= pane.height ? '-h' : '-v';
	}
	if (canSplitHorizontally) return '-h';
	if (canSplitVertically) return '-v';
	return '-h';
}

function canSplitPane(
	pane: WindowState['agentPanes'][number],
	direction: '-h' | '-v',
	minAgentWidth: number
): boolean {
	if (direction === '-h') {
		return canSplitHorizontally(pane, minAgentWidth);
	}
	return pane.height >= MIN_PANE_HEIGHT * 2;
}

function canSplitHorizontally(
	pane: WindowState['agentPanes'][number],
	minAgentWidth: number
): boolean {
	return pane.width >= minAgentWidth * 2;
}

function pickReplacementPane(
	state: WindowState,
	sessionMappings: SessionMapping[]
): SessionMapping | null {
	const panesById = new Set(state.agentPanes.map((pane) => pane.paneId));
	const candidates = sessionMappings.filter((mapping) => panesById.has(mapping.paneId));
	if (candidates.length === 0) return null;
	return candidates.reduce((oldest, entry) =>
		entry.createdAt.getTime() < oldest.createdAt.getTime() ? entry : oldest
	);
}

/**
 * Pick the oldest pane from session mappings (LRU - Least Recently Used)
 * Used for rotation when maxPanes limit is reached
 */
function pickOldestPane(sessionMappings: SessionMapping[]): SessionMapping | null {
	if (sessionMappings.length === 0) return null;
	return sessionMappings.reduce((oldest, entry) =>
		entry.createdAt.getTime() < oldest.createdAt.getTime() ? entry : oldest
	);
}
