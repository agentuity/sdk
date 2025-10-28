/**
 * Terminal UI utilities for formatted, colorized output
 *
 * Provides semantic helpers for console output with automatic icons and colors.
 * Uses Bun's built-in color support and ANSI escape codes.
 */

import type { ColorScheme } from './terminal';

// Icons
const ICONS = {
	success: '✓',
	error: '✗',
	warning: '⚠',
	info: 'ℹ',
	arrow: '→',
	bullet: '•',
} as const;

// Color definitions (light/dark adaptive)
const COLORS = {
	success: {
		light: '\x1b[32m', // green
		dark: '\x1b[92m', // bright green
	},
	error: {
		light: '\x1b[31m', // red
		dark: '\x1b[91m', // bright red
	},
	warning: {
		light: '\x1b[33m', // yellow
		dark: '\x1b[93m', // bright yellow
	},
	info: {
		light: '\x1b[36m', // cyan
		dark: '\x1b[96m', // bright cyan
	},
	muted: {
		light: '\x1b[90m', // gray
		dark: '\x1b[37m', // white
	},
	bold: {
		light: '\x1b[1m',
		dark: '\x1b[1m',
	},
	link: {
		light: '\x1b[34;4m', // blue underline
		dark: '\x1b[94;4m', // bright blue underline
	},
	reset: '\x1b[0m',
} as const;

let currentColorScheme: ColorScheme = 'dark';

export function setColorScheme(scheme: ColorScheme): void {
	currentColorScheme = scheme;
}

function getColor(colorKey: keyof typeof COLORS): string {
	const color = COLORS[colorKey];
	if (typeof color === 'string') {
		return color;
	}
	return color[currentColorScheme];
}

/**
 * Print a success message with a green checkmark
 */
export function success(message: string): void {
	const color = getColor('success');
	const reset = COLORS.reset;
	console.log(`${color}${ICONS.success} ${message}${reset}`);
}

/**
 * Print an error message with a red X
 */
export function error(message: string): void {
	const color = getColor('error');
	const reset = COLORS.reset;
	console.error(`${color}${ICONS.error} ${message}${reset}`);
}

/**
 * Print a warning message with a yellow warning icon
 */
export function warning(message: string): void {
	const color = getColor('warning');
	const reset = COLORS.reset;
	console.log(`${color}${ICONS.warning} ${message}${reset}`);
}

/**
 * Print an info message with a cyan info icon
 */
export function info(message: string): void {
	const color = getColor('info');
	const reset = COLORS.reset;
	console.log(`${color}${ICONS.info} ${message}${reset}`);
}

/**
 * Format text in muted/gray color
 */
export function muted(text: string): string {
	const color = getColor('muted');
	const reset = COLORS.reset;
	return `${color}${text}${reset}`;
}

/**
 * Format text in bold
 */
export function bold(text: string): string {
	const color = getColor('bold');
	const reset = COLORS.reset;
	return `${color}${text}${reset}`;
}

/**
 * Format text as a link (blue and underlined)
 */
export function link(url: string): string {
	const color = getColor('link');
	const reset = COLORS.reset;

	// Check if terminal supports hyperlinks (OSC 8)
	if (supportsHyperlinks()) {
		return `\x1b]8;;${url}\x07${color}${url}${reset}\x1b]8;;\x07`;
	}

	return `${color}${url}${reset}`;
}

/**
 * Check if terminal supports OSC 8 hyperlinks
 */
function supportsHyperlinks(): boolean {
	const term = process.env.TERM || '';
	const termProgram = process.env.TERM_PROGRAM || '';
	const wtSession = process.env.WT_SESSION || '';

	// Known terminal programs that support OSC 8
	return (
		termProgram.includes('iTerm.app') ||
		termProgram.includes('WezTerm') ||
		termProgram.includes('ghostty') ||
		termProgram.includes('Apple_Terminal') ||
		termProgram.includes('Hyper') ||
		term.includes('xterm-kitty') ||
		term.includes('xterm-256color') ||
		wtSession !== '' // Windows Terminal
	);
}

/**
 * Print a bulleted list item
 */
export function bullet(message: string): void {
	console.log(`${ICONS.bullet} ${message}`);
}

/**
 * Print an arrow item (for showing next steps)
 */
export function arrow(message: string): void {
	console.log(`${ICONS.arrow} ${message}`);
}

/**
 * Print a blank line
 */
export function newline(): void {
	console.log('');
}

/**
 * Pad a string to a specific length on the right
 */
export function padRight(str: string, length: number, pad = ' '): string {
	if (str.length >= length) {
		return str;
	}
	return str + pad.repeat(length - str.length);
}

/**
 * Pad a string to a specific length on the left
 */
export function padLeft(str: string, length: number, pad = ' '): string {
	if (str.length >= length) {
		return str;
	}
	return pad.repeat(length - str.length) + str;
}

/**
 * Display a formatted banner with title and body content
 * Creates a bordered box around the content
 *
 * Uses Bun.stringWidth() for accurate width calculation with ANSI codes and unicode
 */
export function banner(title: string, body: string): void {
	const maxWidth = 80;
	const border = {
		topLeft: '╭',
		topRight: '╮',
		bottomLeft: '╰',
		bottomRight: '╯',
		horizontal: '─',
		vertical: '│',
	};

	// Split body into lines and wrap if needed
	const bodyLines = wrapText(body, maxWidth - 4); // -4 for padding and borders

	// Calculate width based on content
	const titleWidth = getDisplayWidth(title);
	const maxBodyWidth = Math.max(...bodyLines.map((line) => getDisplayWidth(line)));
	const contentWidth = Math.max(titleWidth, maxBodyWidth);
	const boxWidth = Math.min(contentWidth + 4, maxWidth); // +4 for padding
	const innerWidth = boxWidth - 4;

	// Colors
	const borderColor = getColor('muted');
	const titleColor = getColor('info');
	const reset = COLORS.reset;

	// Build banner
	const lines: string[] = [];

	// Top border
	lines.push(
		`${borderColor}${border.topLeft}${border.horizontal.repeat(boxWidth - 2)}${border.topRight}${reset}`
	);

	// Empty line
	lines.push(
		`${borderColor}${border.vertical}${' '.repeat(boxWidth - 2)}${border.vertical}${reset}`
	);

	// Title (centered and bold)
	const titleDisplayWidth = getDisplayWidth(title);
	const titlePadding = Math.max(0, Math.floor((innerWidth - titleDisplayWidth) / 2));
	const titleRightPadding = Math.max(0, innerWidth - titlePadding - titleDisplayWidth);
	const titleLine =
		' '.repeat(titlePadding) +
		`${titleColor}${bold(title)}${reset}` +
		' '.repeat(titleRightPadding);
	lines.push(
		`${borderColor}${border.vertical} ${reset}${titleLine}${borderColor} ${border.vertical}${reset}`
	);

	// Empty line
	lines.push(
		`${borderColor}${border.vertical}${' '.repeat(boxWidth - 2)}${border.vertical}${reset}`
	);

	// Body lines
	for (const line of bodyLines) {
		const lineWidth = getDisplayWidth(line);
		const padding = Math.max(0, innerWidth - lineWidth);
		lines.push(
			`${borderColor}${border.vertical} ${reset}${line}${' '.repeat(padding)}${borderColor} ${border.vertical}${reset}`
		);
	}

	// Empty line
	lines.push(
		`${borderColor}${border.vertical}${' '.repeat(boxWidth - 2)}${border.vertical}${reset}`
	);

	// Bottom border
	lines.push(
		`${borderColor}${border.bottomLeft}${border.horizontal.repeat(boxWidth - 2)}${border.bottomRight}${reset}`
	);

	// Print the banner
	console.log('\n' + lines.join('\n') + '\n');
}

/**
 * Wait for any key press before continuing
 * Displays a prompt message and waits for user input
 * Exits with code 1 if CTRL+C is pressed
 */
export async function waitForAnyKey(message = 'Press Enter to continue...'): Promise<void> {
	process.stdout.write(muted(message));

	// Check if we're in a TTY environment
	if (!process.stdin.isTTY) {
		// Not a TTY (CI/piped), just write newline and exit
		console.log('');
		return Promise.resolve();
	}

	// Set stdin to raw mode to read a single keypress
	process.stdin.setRawMode(true);
	process.stdin.resume();
	let rawModeSet = true;

	return new Promise((resolve) => {
		process.stdin.once('data', (data: Buffer) => {
			if (rawModeSet && process.stdin.isTTY) {
				process.stdin.setRawMode(false);
				rawModeSet = false;
			}
			process.stdin.pause();

			// Check for CTRL+C (character code 3)
			if (data.length === 1 && data[0] === 3) {
				console.log('\n');
				process.exit(1);
			}

			console.log('');
			resolve();
		});
	});
}

/**
 * Prompts user with a yes/no question
 * Returns true for yes, false for no
 * Exits with code 1 if CTRL+C is pressed
 */
export async function confirm(message: string, defaultValue = true): Promise<boolean> {
	const suffix = defaultValue ? '[Y/n]' : '[y/N]';
	process.stdout.write(`${message} ${muted(suffix)} `);

	// Check if we're in a TTY environment
	if (!process.stdin.isTTY) {
		console.log('');
		return defaultValue;
	}

	// Set stdin to raw mode to read a single keypress
	process.stdin.setRawMode(true);
	process.stdin.resume();
	let rawModeSet = true;

	return new Promise((resolve) => {
		process.stdin.once('data', (data: Buffer) => {
			if (rawModeSet && process.stdin.isTTY) {
				process.stdin.setRawMode(false);
				rawModeSet = false;
			}
			process.stdin.pause();

			// Check for CTRL+C (character code 3)
			if (data.length === 1 && data[0] === 3) {
				console.log('\n');
				process.exit(1);
			}

			const input = data.toString().trim().toLowerCase();
			console.log('');

			// Enter key (just newline) uses default
			if (input === '') {
				resolve(defaultValue);
				return;
			}

			// Check first character for y/n
			const char = input.charAt(0);
			if (char === 'y') {
				resolve(true);
			} else if (char === 'n') {
				resolve(false);
			} else {
				// Invalid input, use default
				resolve(defaultValue);
			}
		});
	});
}

/**
 * Copy text to clipboard
 * Returns true if successful, false otherwise
 */
export async function copyToClipboard(text: string): Promise<boolean> {
	try {
		const platform = process.platform;

		if (platform === 'darwin') {
			// macOS - use pbcopy
			const proc = Bun.spawn(['pbcopy'], {
				stdin: 'pipe',
			});
			proc.stdin.write(text);
			proc.stdin.end();
			await proc.exited;
			return proc.exitCode === 0;
		} else if (platform === 'win32') {
			// Windows - use clip
			const proc = Bun.spawn(['clip'], {
				stdin: 'pipe',
			});
			proc.stdin.write(text);
			proc.stdin.end();
			await proc.exited;
			return proc.exitCode === 0;
		} else {
			// Linux - try xclip first, then xsel
			try {
				const proc = Bun.spawn(['xclip', '-selection', 'clipboard'], {
					stdin: 'pipe',
				});
				proc.stdin.write(text);
				proc.stdin.end();
				await proc.exited;
				return proc.exitCode === 0;
			} catch {
				// Try xsel as fallback
				const proc = Bun.spawn(['xsel', '--clipboard', '--input'], {
					stdin: 'pipe',
				});
				proc.stdin.write(text);
				proc.stdin.end();
				await proc.exited;
				return proc.exitCode === 0;
			}
		}
	} catch {
		return false;
	}
}

/**
 * Get the display width of a string, handling ANSI codes and OSC 8 hyperlinks
 *
 * Note: Bun.stringWidth() counts OSC 8 hyperlink escape sequences in the width,
 * which causes incorrect alignment. We strip OSC 8 codes first, then use Bun.stringWidth()
 * to handle regular ANSI codes and unicode characters correctly.
 */
function getDisplayWidth(str: string): number {
	// Strip OSC 8 hyperlink sequences: \x1b]8;;URL\x07...\x1b]8;;\x07
	// eslint-disable-next-line no-control-regex
	const withoutOSC8 = str.replace(/\x1b\]8;;[^\x07]*\x07/g, '');
	return Bun.stringWidth(withoutOSC8);
}

/**
 * Wrap text to a maximum width
 * Handles explicit newlines and word wrapping
 */
function wrapText(text: string, maxWidth: number): string[] {
	const allLines: string[] = [];

	// First split by explicit newlines
	const paragraphs = text.split('\n');

	for (const paragraph of paragraphs) {
		// Skip empty paragraphs (they become blank lines)
		if (paragraph.trim() === '') {
			allLines.push('');
			continue;
		}

		// Wrap each paragraph
		const words = paragraph.split(' ');
		let currentLine = '';

		for (const word of words) {
			const testLine = currentLine ? `${currentLine} ${word}` : word;
			const testLineWidth = getDisplayWidth(testLine);

			if (testLineWidth <= maxWidth) {
				currentLine = testLine;
			} else {
				// If current line has content, save it
				if (currentLine) {
					allLines.push(currentLine);
				}
				// If the word itself is longer than maxWidth, just use it as is
				// (better to have a long line than break in the middle)
				currentLine = word;
			}
		}

		if (currentLine) {
			allLines.push(currentLine);
		}
	}

	return allLines.length > 0 ? allLines : [''];
}

/**
 * Progress callback for spinner
 */
export type SpinnerProgressCallback = (progress: number) => void;

/**
 * Spinner options (simple without progress)
 */
export interface SimpleSpinnerOptions<T> {
	type?: 'simple';
	message: string;
	callback: (() => Promise<T>) | Promise<T>;
}

/**
 * Spinner options (with progress tracking)
 */
export interface ProgressSpinnerOptions<T> {
	type: 'progress';
	message: string;
	callback: (progress: SpinnerProgressCallback) => Promise<T>;
}

/**
 * Spinner options (discriminated union)
 */
export type SpinnerOptions<T> = SimpleSpinnerOptions<T> | ProgressSpinnerOptions<T>;

/**
 * Run a callback with an animated spinner (simple overload)
 *
 * Shows a spinner animation while the callback executes.
 * On success, shows a checkmark. On error, shows an X and re-throws.
 *
 * @param message - The message to display next to the spinner
 * @param callback - Async function or Promise to execute
 */
export async function spinner<T>(
	message: string,
	callback: (() => Promise<T>) | Promise<T>
): Promise<T>;

/**
 * Run a callback with an animated spinner (options overload)
 *
 * Shows a spinner animation while the callback executes.
 * On success, shows a checkmark. On error, shows an X and re-throws.
 *
 * @param options - Spinner options with optional progress tracking
 */
export async function spinner<T>(options: SpinnerOptions<T>): Promise<T>;

export async function spinner<T>(
	messageOrOptions: string | SpinnerOptions<T>,
	callback?: (() => Promise<T>) | Promise<T>
): Promise<T> {
	// Normalize to options format
	let options: SpinnerOptions<T>;
	if (typeof messageOrOptions === 'string') {
		if (callback === undefined) {
			throw new Error('callback is required when first argument is a string');
		}
		options = { type: 'simple', message: messageOrOptions, callback };
	} else {
		options = messageOrOptions;
	}

	const message = options.message;
	const frames = ['◐', '◓', '◑', '◒'];
	const spinnerColors = [
		{ light: '\x1b[36m', dark: '\x1b[96m' }, // cyan
		{ light: '\x1b[34m', dark: '\x1b[94m' }, // blue
		{ light: '\x1b[35m', dark: '\x1b[95m' }, // magenta
		{ light: '\x1b[36m', dark: '\x1b[96m' }, // cyan
	];
	const bold = '\x1b[1m';
	const reset = COLORS.reset;
	const cyanColor = { light: '\x1b[36m', dark: '\x1b[96m' }[currentColorScheme];

	let frameIndex = 0;
	let currentProgress: number | undefined;

	// Hide cursor
	process.stdout.write('\x1B[?25l');

	// Start animation
	const interval = setInterval(() => {
		const colorDef = spinnerColors[frameIndex % spinnerColors.length];
		const color = colorDef[currentColorScheme];
		const frame = `${color}${bold}${frames[frameIndex % frames.length]}${reset}`;

		// Add progress indicator if available
		const progressIndicator =
			currentProgress !== undefined
				? ` ${cyanColor}${Math.floor(currentProgress)}%${reset}`
				: '';

		// Clear line and render
		process.stdout.write('\r\x1B[K' + `${frame} ${message}${progressIndicator}`);
		frameIndex++;
	}, 120);

	// Progress callback
	const progressCallback: SpinnerProgressCallback = (progress: number) => {
		currentProgress = Math.min(100, Math.max(0, progress));
	};

	try {
		// Execute callback
		const result =
			options.type === 'progress'
				? await options.callback(progressCallback)
				: typeof options.callback === 'function'
					? await options.callback()
					: await options.callback;

		// Clear interval and line
		clearInterval(interval);
		process.stdout.write('\r\x1B[K');

		// Show success
		const successColor = getColor('success');
		console.log(`${successColor}${ICONS.success} ${message}${reset}`);

		// Show cursor
		process.stdout.write('\x1B[?25h');

		return result;
	} catch (err) {
		// Clear interval and line
		clearInterval(interval);
		process.stdout.write('\r\x1B[K');

		// Show error
		const errorColor = getColor('error');
		console.error(`${errorColor}${ICONS.error} ${message}${reset}`);

		// Show cursor
		process.stdout.write('\x1B[?25h');

		throw err;
	}
}
