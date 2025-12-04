/**
 * Box drawing and UI symbols for TUI components
 * Supports Unicode with ASCII fallbacks for non-unicode terminals
 */

// Detect unicode support
const isUnicodeSupported = (): boolean => {
	if (process.platform !== 'win32') {
		return process.env.TERM !== 'linux'; // Linux console (kernel) doesn't support Unicode
	}

	return (
		Boolean(process.env.WT_SESSION) || // Windows Terminal
		Boolean(process.env.TERMINUS_SUBLIME) || // Terminus (<0.2.27)
		process.env.TERM_PROGRAM === 'vscode' ||
		process.env.TERM === 'xterm-256color' ||
		process.env.TERM === 'alacritty' ||
		process.env.TERMINAL_EMULATOR === 'JetBrains-JediTerm'
	);
};

const unicode = isUnicodeSupported();

export const symbols = {
	// Step symbols
	active: unicode ? '◆' : '*',
	completed: unicode ? '◇' : 'o',
	error: unicode ? '■' : 'x',
	warning: unicode ? '▲' : '!',
	cancel: unicode ? '■' : 'x',

	// Borders - bars
	bar: unicode ? '│' : '|',
	barH: unicode ? '─' : '-',

	// Borders - rounded corners
	cornerTL: unicode ? '╭' : '+',
	cornerTR: unicode ? '╮' : '+',
	cornerBL: unicode ? '╰' : '+',
	cornerBR: unicode ? '╯' : '+',

	// Borders - square corners
	squareTL: unicode ? '┌' : 'T',
	squareTR: unicode ? '┐' : 'T',
	squareBL: unicode ? '└' : 'L',
	squareBR: unicode ? '┘' : 'J',

	// Connectors
	connect: unicode ? '├' : '+',
	connectRight: unicode ? '┤' : '+',

	// Selection symbols
	radioActive: unicode ? '●' : '>',
	radioInactive: unicode ? '○' : ' ',
	checkboxActive: unicode ? '◻' : '[ ]',
	checkboxSelected: unicode ? '◼' : '[x]',
	checkboxInactive: unicode ? '◻' : '[ ]',

	// Other
	passwordMask: unicode ? '▪' : '*',
	info: unicode ? '●' : '*',
};

export const isUnicode = unicode;
