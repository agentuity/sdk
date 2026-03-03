/**
 * Color utilities for TUI components using existing tui.ts color system
 */
import { getExecutingAgent } from '../agent-detection';

// ANSI escape codes for additional colors not in main tui.ts
const RESET = '\x1b[0m';
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const BLUE = '\x1b[34m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const UNDERLINE = '\x1b[4m';
const BG_CYAN = '\x1b[46m';
const BLACK = '\x1b[30m';
const WHITE = '\x1b[37m';

/**
 * Check if colors should be used.
 * Disabled for: AI agents, CI, NO_COLOR, dumb terminals, non-TTY, piped output.
 * FORCE_COLOR=1 overrides all checks.
 */
function shouldUseColors(): boolean {
	// FORCE_COLOR overrides all checks
	if (process.env.FORCE_COLOR === '1') {
		return true;
	}
	// Disable for AI coding agents
	if (getExecutingAgent()) {
		return false;
	}
	// Disable for NO_COLOR, CI, dumb terminals, or non-TTY
	if (process.env.NO_COLOR) {
		return false;
	}
	if (process.env.CI) {
		return false;
	}
	if (process.env.TERM === 'dumb') {
		return false;
	}
	if (!process.stdout.isTTY) {
		return false;
	}
	return true;
}

/**
 * Detect if terminal is in dark mode
 */
function isDarkMode(): boolean {
	const scheme = process.env.COLOR_SCHEME;
	if (scheme === 'light') return false;
	if (scheme === 'dark') return true;
	return true;
}

// No-op color function for when colors are disabled
const noColor = (text: string) => text;

function createColors() {
	if (!shouldUseColors()) {
		return {
			active: noColor,
			completed: noColor,
			error: noColor,
			warning: noColor,
			success: noColor,
			info: noColor,
			muted: noColor,
			bold: noColor,
			underline: noColor,
			reset: noColor,
			primary: noColor,
			secondary: noColor,
			link: noColor,
			inverseCyan: noColor,
		};
	}

	return {
		// State colors - using simple ANSI codes (consistent with tui.ts approach)
		active: (text: string) => `${CYAN}${text}${RESET}`,
		completed: (text: string) => `${GRAY}${text}${RESET}`,
		error: (text: string) => `${RED}${text}${RESET}`,
		warning: (text: string) => `${YELLOW}${text}${RESET}`,
		success: (text: string) => `${GREEN}${text}${RESET}`,
		info: (text: string) => `${BLUE}${text}${RESET}`,

		// Text formatting
		muted: (text: string) => `${DIM}${text}${RESET}`,
		bold: (text: string) => `${BOLD}${text}${RESET}`,
		underline: (text: string) => `${UNDERLINE}${text}${RESET}`,
		reset: (text: string) => `${RESET}${text}`,

		// Semantic colors
		primary: (text: string) => `${CYAN}${text}${RESET}`,
		secondary: (text: string) => `${GRAY}${text}${RESET}`,
		link: (text: string) => `${CYAN}${UNDERLINE}${text}${RESET}`,

		// Inversed colors (adapt to light/dark mode)
		inverseCyan: (text: string) => {
			const dark = isDarkMode();
			return dark ? `${BG_CYAN}${BLACK}${text}${RESET}` : `${BG_CYAN}${WHITE}${text}${RESET}`;
		},
	};
}

export const colors = createColors();
