/**
 * Color utilities for TUI components using existing tui.ts color system
 */

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
 * Detect if terminal is in dark mode
 */
function isDarkMode(): boolean {
	const scheme = process.env.COLOR_SCHEME;
	if (scheme === 'light') return false;
	if (scheme === 'dark') return true;
	return true;
}

export const colors = {
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
