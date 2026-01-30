/**
 * Information about a tmux pane
 */
export interface TmuxPaneInfo {
	paneId: string; // e.g., %0, %1
	width: number; // Columns
	height: number; // Rows
	left: number; // Position from left
	top: number; // Position from top
	title: string; // Pane title
	isActive: boolean; // Is this the active pane?
}

/**
 * Current state of the tmux window
 */
export interface WindowState {
	windowWidth: number;
	windowHeight: number;
	mainPane: TmuxPaneInfo | null; // The pane running the main agent
	agentPanes: TmuxPaneInfo[]; // Panes for background agents
}

/**
 * Tracked session for a background agent in tmux
 */
export interface TrackedSession {
	sessionId: string; // OpenCode session ID
	paneId: string; // Tmux pane ID
	description: string; // Task description
	createdAt: Date;
	lastSeenAt: Date;
}

/**
 * Direction for splitting panes
 */
export type SplitDirection = '-h' | '-v'; // -h = horizontal (side by side), -v = vertical (stacked)

/**
 * Actions for managing panes
 */
export type PaneAction =
	| {
			type: 'spawn';
			sessionId: string;
			description: string;
			targetPaneId: string;
			splitDirection: SplitDirection;
	  }
	| { type: 'close'; paneId: string; sessionId: string }
	| {
			type: 'replace';
			paneId: string;
			oldSessionId: string;
			newSessionId: string;
			description: string;
	  };

/**
 * Decision result from the spawn decision engine
 */
export interface SpawnDecision {
	canSpawn: boolean;
	actions: PaneAction[];
	reason?: string;
}

/**
 * Capacity configuration for pane layout
 */
export interface CapacityConfig {
	mainPaneMinWidth: number;
	agentPaneMinWidth: number;
}

/**
 * Session mapping for decision engine
 */
export interface SessionMapping {
	sessionId: string;
	paneId: string;
	createdAt: Date;
}

/**
 * Configuration for tmux integration
 *
 * Agents spawn in a dedicated "Agents" window with tiled grid layout.
 * This keeps the main pane untouched while grouping all agent panes together.
 */
export interface TmuxConfig {
	enabled: boolean;
	maxPanes: number;
	mainPaneMinWidth: number;
	agentPaneMinWidth: number;
}

// Minimum pane dimensions
export const MIN_PANE_WIDTH = 52;
export const MIN_PANE_HEIGHT = 11;

// Polling intervals
export const POLL_INTERVAL_MS = 2000;
export const SESSION_MISSING_GRACE_MS = 5000;
export const SESSION_TIMEOUT_MS = 10 * 60 * 1000;
