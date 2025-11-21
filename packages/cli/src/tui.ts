/**
 * Terminal UI utilities for formatted, colorized output
 *
 * Provides semantic helpers for console output with automatic icons and colors.
 * Uses Bun's built-in color support and ANSI escape codes.
 */
import { stringWidth } from 'bun';
import { colorize } from 'json-colorizer';
import enquirer from 'enquirer';
import { type OrganizationList, projectList } from '@agentuity/server';
import * as readline from 'readline';
import type { ColorScheme } from './terminal';
import type { Profile } from './types';
import { type APIClient as APIClientType } from './api';
import { getExitCode } from './errors';

// Icons
const ICONS = {
	success: '✓',
	error: '✗',
	warning: '⚠',
	info: 'ℹ',
	arrow: '→',
	bullet: '•',
} as const;

export function shouldUseColors(): boolean {
	return (
		!process.env.NO_COLOR &&
		!process.env.CI &&
		process.env.TERM !== 'dumb' &&
		!!process.stdout.isTTY
	);
}

// Color definitions (light/dark adaptive) using Bun.color
function getColors() {
	const USE_COLORS = shouldUseColors();
	if (!USE_COLORS) {
		return {
			success: { light: '', dark: '' },
			error: { light: '', dark: '' },
			warning: { light: '', dark: '' },
			info: { light: '', dark: '' },
			muted: { light: '', dark: '' },
			bold: { light: '', dark: '' },
			link: { light: '', dark: '' },
			reset: '',
		} as const;
	}

	return {
		success: {
			light: Bun.color('#008000', 'ansi') || '\x1b[32m', // green
			dark: Bun.color('#00FF00', 'ansi') || '\x1b[92m', // bright green
		},
		error: {
			light: Bun.color('#CC0000', 'ansi') || '\x1b[31m', // red
			dark: Bun.color('#FF5555', 'ansi') || '\x1b[91m', // bright red
		},
		warning: {
			light: Bun.color('#B58900', 'ansi') || '\x1b[33m', // yellow
			dark: Bun.color('#FFFF55', 'ansi') || '\x1b[93m', // bright yellow
		},
		info: {
			light: Bun.color('#008B8B', 'ansi') || '\x1b[36m', // dark cyan
			dark: Bun.color('#55FFFF', 'ansi') || '\x1b[96m', // bright cyan
		},
		muted: {
			light: Bun.color('#808080', 'ansi') || '\x1b[90m', // gray
			dark: Bun.color('#888888', 'ansi') || '\x1b[90m', // darker gray
		},
		bold: {
			light: '\x1b[1m',
			dark: '\x1b[1m',
		},
		link: {
			light: '\x1b[34;4m', // blue underline (need ANSI for underline)
			dark: '\x1b[94;4m', // bright blue underline
		},
		reset: '\x1b[0m',
	} as const;
}

let currentColorScheme: ColorScheme = process.env.CI ? 'light' : 'dark';

export function setColorScheme(scheme: ColorScheme): void {
	currentColorScheme = scheme;
	process.env.COLOR_SCHEME = scheme;
}

export function isDarkMode(): boolean {
	return currentColorScheme === 'dark';
}

function getColor(colorKey: keyof ReturnType<typeof getColors>): string {
	const COLORS = getColors();
	const color = COLORS[colorKey];
	if (typeof color === 'string') {
		return color;
	}
	return color[currentColorScheme];
}

/**
 * Color helpers that return colored strings (for inline use, no icons)
 */
export function colorSuccess(text: string): string {
	const color = getColor('success');
	const reset = getColor('reset');
	return `${color}${text}${reset}`;
}

export function colorError(text: string): string {
	const color = getColor('error');
	const reset = getColor('reset');
	return `${color}${text}${reset}`;
}

export function colorWarning(text: string): string {
	const color = getColor('warning');
	const reset = getColor('reset');
	return `${color}${text}${reset}`;
}

export function colorInfo(text: string): string {
	const color = getColor('info');
	const reset = getColor('reset');
	return `${color}${text}${reset}`;
}

export function colorMuted(text: string): string {
	const color = getColor('muted');
	const reset = getColor('reset');
	return `${color}${text}${reset}`;
}

/**
 * Print a success message with a green checkmark
 */
export function success(message: string): void {
	const color = getColor('success');
	const reset = getColor('reset');
	process.stderr.write(`${color}${ICONS.success} ${message}${reset}\n`);
}

/**
 * Print an error message with a red X
 */
export function error(message: string): void {
	const color = getColor('error');
	const reset = getColor('reset');
	process.stderr.write(`${color}${ICONS.error} ${message}${reset}\n`);
}

/**
 * Print an error message with a red X and then exit
 */
export function fatal(message: string, errorCode?: import('./errors').ErrorCode): never {
	const color = getColor('error');
	const reset = getColor('reset');
	process.stderr.write(`${color}${ICONS.error} ${message}${reset}\n`);

	if (errorCode) {
		const exitCode = getExitCode(errorCode);
		process.exit(exitCode);
	} else {
		process.exit(1);
	}
}

/**
 * Print a warning message with a yellow warning icon
 */
export function warning(message: string, asError = false): void {
	const color = asError ? getColor('error') : getColor('warning');
	const reset = getColor('reset');
	process.stderr.write(`${color}${ICONS.warning} ${message}${reset}\n`);
}

/**
 * Print an info message with a cyan info icon
 */
export function info(message: string): void {
	const color = getColor('info');
	const reset = getColor('reset');
	process.stderr.write(`${color}${ICONS.info} ${message}${reset}\n`);
}

/**
 * Format text in muted/gray color
 */
export function muted(text: string): string {
	const color = getColor('muted');
	const reset = getColor('reset');
	return `${color}${text}${reset}`;
}

/**
 * Format text in warn color
 */
export function warn(text: string): string {
	const color = getColor('warning');
	const reset = getColor('reset');
	return `${color}${text}${reset}`;
}

/**
 * Format text in bold
 */
export function bold(text: string): string {
	const color = getColor('bold');
	const reset = getColor('reset');
	return `${color}${text}${reset}`;
}

/**
 * Format text as a link (blue and underlined)
 */
export function link(url: string, title?: string): string {
	const color = getColor('link');
	const reset = getColor('reset');

	// Check if terminal supports hyperlinks (OSC 8) and colors are enabled
	if (shouldUseColors() && supportsHyperlinks()) {
		return `\x1b]8;;${url}\x07${color}${title ?? url}${reset}\x1b]8;;\x07`;
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
	process.stderr.write(`${ICONS.bullet} ${message}\n`);
}

/**
 * Print an arrow item (for showing next steps)
 */
export function arrow(message: string): void {
	process.stderr.write(`${ICONS.arrow} ${message}\n`);
}

/**
 * Print a blank line
 */
export function newline(): void {
	process.stderr.write('\n');
}

/**
 * Get the display width of a string, handling ANSI codes and OSC 8 hyperlinks
 *
 * Note: Bun.stringWidth() counts OSC 8 hyperlink escape sequences in the width,
 * which causes incorrect alignment. We strip OSC 8 codes first, then use Bun.stringWidth()
 * to handle regular ANSI codes and unicode characters correctly.
 */
function getDisplayWidth(str: string): number {
	// Remove OSC-8 hyperlink sequences using Unicode escapes (\u001b = ESC, \u0007 = BEL) to satisfy linter
	// eslint-disable-next-line no-control-regex
	const withoutOSC8 = str.replace(/\u001b\]8;;[^\u0007]*\u0007/g, '');
	return Bun.stringWidth(withoutOSC8);
}

/**
 * Pad a string to a specific length on the right
 */
export function padRight(str: string, length: number, pad = ' '): string {
	const displayWidth = getDisplayWidth(str);
	if (displayWidth >= length) {
		return str;
	}
	return str + pad.repeat(length - displayWidth);
}

/**
 * Pad a string to a specific length on the left
 */
export function padLeft(str: string, length: number, pad = ' '): string {
	const displayWidth = getDisplayWidth(str);
	if (displayWidth >= length) {
		return str;
	}
	return pad.repeat(length - displayWidth) + str;
}

interface BannerOptions {
	padding?: number;
	minWidth?: number;
	topSpacer?: boolean;
	middleSpacer?: boolean;
	bottomSpacer?: boolean;
	centerTitle?: boolean;
}

/**
 * Display a formatted banner with title and body content
 * Creates a bordered box around the content
 *
 * Uses Bun.stringWidth() for accurate width calculation with ANSI codes and unicode
 * Responsive to terminal width - adapts to narrow terminals
 */
export function banner(title: string, body: string, options?: BannerOptions): void {
	// Get terminal width, default to 120 if not available
	const termWidth = process.stdout.columns || 120;

	const border = {
		topLeft: '╭',
		topRight: '╮',
		bottomLeft: '╰',
		bottomRight: '╯',
		horizontal: '─',
		vertical: '│',
	};

	// Calculate content width first (before wrapping)
	const titleWidth = getDisplayWidth(title);
	const bodyLines = body.split('\n');
	const maxBodyWidth = Math.max(0, ...bodyLines.map((line) => getDisplayWidth(line)));
	const requiredContentWidth = Math.max(titleWidth, maxBodyWidth);

	// Box width = content + borders (2) + side spaces (2)
	const boxWidth = Math.min(requiredContentWidth + 4, termWidth);

	// If required content width exceeds terminal width, skip box and print plain text
	if (requiredContentWidth + 4 > termWidth) {
		console.log('\n' + bold(title));
		console.log(body + '\n');
		return;
	}

	// Inner width is box width minus borders (2) and side spaces (2)
	const innerWidth = boxWidth - 4;

	// Wrap text to fit box width
	const wrappedBodyLines = wrapText(body, innerWidth);

	// Colors
	const borderColor = getColor('muted');
	const titleColor = getColor('info');
	const reset = getColor('reset');

	// Build banner
	const lines: string[] = [];

	// Top border
	lines.push(
		`${borderColor}${border.topLeft}${border.horizontal.repeat(boxWidth - 2)}${border.topRight}${reset}`
	);

	if (options?.topSpacer === true || options?.topSpacer === undefined) {
		// Empty line
		lines.push(
			`${borderColor}${border.vertical}${' '.repeat(boxWidth - 2)}${border.vertical}${reset}`
		);
	}

	// Title (centered and bold)
	const titleDisplayWidth = getDisplayWidth(title);
	if (options?.centerTitle === true || options?.centerTitle === undefined) {
		const titlePadding = Math.max(0, Math.floor((innerWidth - titleDisplayWidth) / 2));
		const titleRightPadding = Math.max(0, innerWidth - titlePadding - titleDisplayWidth);
		const titleLine =
			' '.repeat(titlePadding) +
			`${titleColor}${bold(title)}${reset}` +
			' '.repeat(titleRightPadding);
		lines.push(
			`${borderColor}${border.vertical} ${reset}${titleLine}${borderColor} ${border.vertical}${reset}`
		);
	} else {
		const titleRightPadding = Math.max(0, innerWidth - titleDisplayWidth);
		const titleLine = `${titleColor}${bold(title)}${reset}` + ' '.repeat(titleRightPadding);
		lines.push(
			`${borderColor}${border.vertical} ${reset}${titleLine}${borderColor} ${border.vertical}${reset}`
		);
	}

	if (options?.middleSpacer === true || options?.middleSpacer === undefined) {
		// Empty line
		lines.push(
			`${borderColor}${border.vertical}${' '.repeat(boxWidth - 2)}${border.vertical}${reset}`
		);
	}

	// Body lines
	for (const line of wrappedBodyLines) {
		const lineWidth = getDisplayWidth(line);
		const linePadding = Math.max(0, innerWidth - lineWidth);
		lines.push(
			`${borderColor}${border.vertical} ${reset}${line}${' '.repeat(linePadding)}${borderColor} ${border.vertical}${reset}`
		);
	}

	if (options?.bottomSpacer === true || options?.bottomSpacer === undefined) {
		// Empty line
		lines.push(
			`${borderColor}${border.vertical}${' '.repeat(boxWidth - 2)}${border.vertical}${reset}`
		);
	}

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
 * Display a signup benefits box with cyan border
 * Shows the value proposition for creating an Agentuity account
 */
export function showSignupBenefits(): void {
	const CYAN = Bun.color('cyan', 'ansi-16m');
	const TEXT =
		currentColorScheme === 'dark' ? Bun.color('white', 'ansi') : Bun.color('black', 'ansi');
	const RESET = '\x1b[0m';

	const lines = [
		'╔════════════════════════════════════════════╗',
		`║ ⨺ Signup for Agentuity             ${muted('free')}${CYAN}    ║`,
		'║                                            ║',
		`║ ✓ ${TEXT}Cloud deployment, previews and CI/CD${CYAN}     ║`,
		`║ ✓ ${TEXT}AI Gateway, KV, Vector and more${CYAN}          ║`,
		`║ ✓ ${TEXT}Observability, Tracing and Logging${CYAN}       ║`,
		`║ ✓ ${TEXT}Organization and Team support${CYAN}            ║`,
		`║ ✓ ${TEXT}And much more!${CYAN}                           ║`,
		'╚════════════════════════════════════════════╝',
	];

	console.log('');
	lines.map((line) => console.log(CYAN + line + RESET));
	console.log('');
}

/**
 * Display a message when unauthenticated to let the user know certain capabilities are disabled
 */
export function showLoggedOutMessage(): void {
	const YELLOW = Bun.color('yellow', 'ansi-16m');
	const TEXT =
		currentColorScheme === 'dark' ? Bun.color('white', 'ansi') : Bun.color('black', 'ansi');
	const RESET = '\x1b[0m';

	const signupTitle = 'Sign up / Login';
	const showInline = supportsHyperlinks();
	const signupURL = 'https://app.agentuity.com/sign-up';
	const signupLink = showInline
		? link(signupURL, signupTitle)
		: ' '.repeat(stringWidth(signupTitle));
	const showNewLine = showInline ? '' : `║ ${RESET}${link(signupURL)}${YELLOW}            ║`;

	const lines = [
		'╔══════════════════════════════════════════════╗',
		`║ ⨺ Unauthenticated (local mode)               ║`,
		'║                                              ║',
		`║ ${TEXT}Certain capabilities such as the AI services${YELLOW} ║`,
		`║ ${TEXT}and devmode remote are unavailable when${YELLOW}      ║`,
		`║ ${TEXT}unauthenticated.${YELLOW} ${signupLink}${YELLOW}             ║`,
		showNewLine,
		'╚══════════════════════════════════════════════╝',
	];

	console.log('');
	lines.filter(Boolean).map((line) => console.log(YELLOW + line + RESET));
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
 * Extract ANSI codes from the beginning of a string
 */
function extractLeadingAnsiCodes(str: string): string {
	// Match ANSI escape sequences at the start of the string
	// eslint-disable-next-line no-control-regex
	const match = str.match(/^(\x1b\[[0-9;]*m)+/);
	return match ? match[0] : '';
}

/**
 * Strip ANSI codes from a string
 */
function stripAnsiCodes(str: string): string {
	// Remove all ANSI escape sequences
	// eslint-disable-next-line no-control-regex
	return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Check if a string ends with ANSI reset code
 */
function endsWithReset(str: string): boolean {
	return str.endsWith('\x1b[0m') || str.endsWith(getColor('reset'));
}

/**
 * Wrap text to a maximum width
 * Handles explicit newlines and word wrapping
 * Preserves ANSI color codes across wrapped lines
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

		// Record starting index for this paragraph's lines
		const paragraphStart = allLines.length;

		// Extract any leading ANSI codes from the paragraph
		const leadingCodes = extractLeadingAnsiCodes(paragraph);
		const hasReset = endsWithReset(paragraph);

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
				// But if we have leading codes and this isn't the first line, apply them
				if (leadingCodes && currentLine) {
					// Strip any existing codes from the word to avoid duplication
					const strippedWord = stripAnsiCodes(word);
					currentLine = leadingCodes + strippedWord;
				} else {
					currentLine = word;
				}
			}
		}

		if (currentLine) {
			allLines.push(currentLine);
		}

		// If the original paragraph had ANSI codes and ended with reset,
		// ensure each wrapped line ends with reset (only for this paragraph's lines)
		if (leadingCodes && hasReset) {
			for (let i = paragraphStart; i < allLines.length; i++) {
				if (!endsWithReset(allLines[i])) {
					allLines[i] += getColor('reset');
				}
			}
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
	/**
	 * If true, clear the spinner output on success (no icon, no message)
	 * Defaults to false
	 */
	clearOnSuccess?: boolean;
}

/**
 * Spinner options (with progress tracking)
 */
export interface ProgressSpinnerOptions<T> {
	type: 'progress';
	message: string;
	callback: (progress: SpinnerProgressCallback) => Promise<T>;
	/**
	 * If true, clear the spinner output on success (no icon, no message)
	 * Defaults to false
	 */
	clearOnSuccess?: boolean;
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
	const reset = getColor('reset');

	// Check if progress should be disabled (from global options)
	const { getOutputOptions, shouldDisableProgress } = await import('./output');
	const outputOptions = getOutputOptions();
	const noProgress = outputOptions ? shouldDisableProgress(outputOptions) : false;

	// If no TTY or progress disabled, just execute the callback without animation
	if (!process.stderr.isTTY || noProgress) {
		try {
			const result =
				options.type === 'progress'
					? await options.callback(() => {})
					: typeof options.callback === 'function'
						? await options.callback()
						: await options.callback;

			// If clearOnSuccess is true, don't show success message
			if (!options.clearOnSuccess) {
				const successColor = getColor('success');
				console.error(`${successColor}${ICONS.success} ${message}${reset}`);
			}

			return result;
		} catch (err) {
			const errorColor = getColor('error');
			console.error(`${errorColor}${ICONS.error} ${message}${reset}`);
			throw err;
		}
	}

	const frames = ['◐', '◓', '◑', '◒'];
	const spinnerColors = [
		{ light: '\x1b[36m', dark: '\x1b[96m' }, // cyan
		{ light: '\x1b[34m', dark: '\x1b[94m' }, // blue
		{ light: '\x1b[35m', dark: '\x1b[95m' }, // magenta
		{ light: '\x1b[36m', dark: '\x1b[96m' }, // cyan
	];
	const bold = '\x1b[1m';
	const cyanColor = { light: '\x1b[36m', dark: '\x1b[96m' }[currentColorScheme];

	let frameIndex = 0;
	let currentProgress: number | undefined;

	// Hide cursor
	process.stderr.write('\x1B[?25l');

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
		process.stderr.write('\r\x1B[K' + `${frame} ${message}${progressIndicator}`);
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
		process.stderr.write('\r\x1B[K');

		// If clearOnSuccess is false, show success message
		if (!options.clearOnSuccess) {
			// Show success
			const successColor = getColor('success');
			console.error(`${successColor}${ICONS.success} ${message}${reset}`);
		}

		// Show cursor
		process.stderr.write('\x1B[?25h');

		return result;
	} catch (err) {
		// Clear interval and line
		clearInterval(interval);
		process.stderr.write('\r\x1B[K');

		// Show error
		const errorColor = getColor('error');
		console.error(`${errorColor}${ICONS.error} ${message}${reset}`);

		// Show cursor
		process.stderr.write('\x1B[?25h');

		throw err;
	}
}

/**
 * Options for running a command with streaming output
 */
export interface CommandRunnerOptions {
	/**
	 * The command to run (displayed in the UI)
	 */
	command: string;
	/**
	 * The actual command and arguments to execute
	 */
	cmd: string[];
	/**
	 * Current working directory
	 */
	cwd?: string;
	/**
	 * Environment variables
	 */
	env?: Record<string, string>;
	/**
	 * If true, clear output on success and only show command + success icon
	 * Defaults to false
	 */
	clearOnSuccess?: boolean;
	/**
	 * If true or undefined, will truncate each line of output
	 */
	truncate?: boolean;
	/**
	 * If undefined, will show up to 3 last lines of output while running. Customize the number with this property.
	 */
	maxLinesOutput?: number;
	/**
	 * If undefined, will show up to 10 last lines on failure. Customize the number with this property.
	 */
	maxLinesOnFailure?: number;
}

/**
 * Run an external command and stream its output with a live UI
 *
 * Displays the command with a colored $ prompt:
 * - Blue while running
 * - Green on successful exit (code 0)
 * - Red on failed exit (code != 0)
 *
 * Shows the last 3 lines of output as it streams.
 */
export async function runCommand(options: CommandRunnerOptions): Promise<number> {
	const {
		command,
		cmd,
		cwd,
		env,
		clearOnSuccess = false,
		truncate = true,
		maxLinesOutput = 3,
		maxLinesOnFailure = 10,
	} = options;
	const isTTY = process.stdout.isTTY;

	// If not a TTY, just run the command normally and log output
	if (!isTTY) {
		const proc = Bun.spawn(cmd, {
			cwd,
			env: { ...process.env, ...env },
			stdout: 'inherit',
			stderr: 'inherit',
		});
		return await proc.exited;
	}

	// Colors using Bun.color
	const blue =
		currentColorScheme === 'light'
			? Bun.color('#0000FF', 'ansi') || '\x1b[34m'
			: Bun.color('#5C9CFF', 'ansi') || '\x1b[94m';
	const green = getColor('success');
	const red = getColor('error');
	const cmdColor =
		currentColorScheme === 'light'
			? '\x1b[1m' + (Bun.color('#00008B', 'ansi') || '\x1b[34m')
			: Bun.color('#FFFFFF', 'ansi') || '\x1b[97m'; // bold dark blue / white
	const mutedColor = Bun.color('#808080', 'ansi') || '\x1b[90m';
	const reset = getColor('reset');

	// Get terminal width
	const termWidth = process.stdout.columns || 80;
	const maxCmdWidth = Math.min(40, termWidth);
	const maxLineWidth = Math.min(80, termWidth);

	// Truncate command if needed
	let displayCmd = command;
	if (getDisplayWidth(displayCmd) > maxCmdWidth) {
		// Simple truncation for now - could be smarter about this
		displayCmd = displayCmd.slice(0, maxCmdWidth - 3) + '...';
	}

	// Store all output lines, display subset based on context
	const allOutputLines: string[] = [];
	let linesRendered = 0;

	// Hide cursor
	process.stdout.write('\x1B[?25l');

	// Render the command and output lines in place
	const renderOutput = (linesToShow: number) => {
		// Move cursor up to start of our output area
		if (linesRendered > 0) {
			process.stdout.write(`\x1b[${linesRendered}A`);
		}

		// Render command line
		process.stdout.write(`\r\x1b[K${blue}$${reset} ${cmdColor}${displayCmd}${reset}\n`);

		// Get last N lines to display
		const displayLines = allOutputLines.slice(-linesToShow);

		// Render output lines
		for (const line of displayLines) {
			// Truncate line if needed
			let displayLine = line;
			if (getDisplayWidth(displayLine) > maxLineWidth) {
				displayLine = displayLine.slice(0, maxLineWidth - 3) + '...';
			}
			process.stdout.write(`\r\x1b[K${mutedColor}${displayLine}${reset}\n`);
		}

		// Update count of lines we've rendered (command + output lines)
		linesRendered = 1 + displayLines.length;
	};

	// Initial display
	renderOutput(maxLinesOutput);

	try {
		// Spawn the command
		const proc = Bun.spawn(cmd, {
			cwd,
			env: { ...process.env, ...env },
			stdout: 'pipe',
			stderr: 'pipe',
		});

		// Process output streams
		const processStream = async (stream: ReadableStream<Uint8Array>) => {
			const reader = stream.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split('\n');
					buffer = lines.pop() || ''; // Keep incomplete line in buffer

					for (const line of lines) {
						if (line.trim()) {
							allOutputLines.push(line);
							renderOutput(maxLinesOutput); // Show last N lines while streaming
						}
					}
				}
			} finally {
				reader.releaseLock();
			}
		};

		// Process both stdout and stderr
		await Promise.all([processStream(proc.stdout), processStream(proc.stderr)]);

		// Wait for process to exit
		const exitCode = await proc.exited;

		// If clearOnSuccess is true and command succeeded, clear everything
		if (clearOnSuccess && exitCode === 0) {
			if (linesRendered > 0) {
				// Move up to the command line
				process.stdout.write(`\x1b[${linesRendered}A`);
				// Clear each line (entire line) and move cursor back up
				for (let i = 0; i < linesRendered; i++) {
					process.stdout.write('\x1b[2K'); // Clear entire line
					if (i < linesRendered - 1) {
						process.stdout.write('\x1b[B'); // Move down one line
					}
				}
				// Move cursor back up to original position
				process.stdout.write(`\x1b[${linesRendered}A\r`);
			}
			return exitCode;
		}

		// Clear all rendered lines completely
		if (linesRendered > 0) {
			// Move up to the command line (first line of our output)
			process.stdout.write(`\x1b[${linesRendered}A`);
			// Move to beginning of line and clear from cursor to end of screen
			process.stdout.write('\r\x1b[J');
		}

		// Determine icon based on exit code
		const icon = exitCode === 0 ? ICONS.success : ICONS.error;
		const statusColor = exitCode === 0 ? green : red;

		// Show final status: icon + command
		process.stdout.write(
			`\r\x1b[K${statusColor}${icon}${reset} ${cmdColor}${displayCmd}${reset}\n`
		);

		// Determine how many lines to show in final output
		const finalLinesToShow = exitCode === 0 ? maxLinesOutput : maxLinesOnFailure;

		// Show final output lines
		const finalOutputLines = allOutputLines.slice(-finalLinesToShow);
		for (const line of finalOutputLines) {
			let displayLine = line;
			if (truncate && getDisplayWidth(displayLine) > maxLineWidth) {
				displayLine = displayLine.slice(0, maxLineWidth - 3) + '...';
			}
			process.stdout.write(`\r\x1b[K${mutedColor}${displayLine}${reset}\n`);
		}

		return exitCode;
	} catch (err) {
		// Move cursor up to clear our UI
		if (linesRendered > 0) {
			process.stdout.write(`\x1b[${linesRendered}A`);
			// Clear all our lines
			for (let i = 0; i < linesRendered; i++) {
				process.stdout.write('\r\x1b[K\n');
			}
			process.stdout.write(`\x1b[${linesRendered}A`);
		}

		// Show error status
		process.stdout.write(`\r\x1b[K${red}$${reset} ${cmdColor}${displayCmd}${reset}\n`);

		// Log the error
		const errorMsg = err instanceof Error ? err.message : String(err);
		console.error(`${red}${ICONS.error} Failed to spawn command: ${errorMsg}${reset}`);
		if (cwd) {
			console.error(`${mutedColor}  cwd: ${cwd}${reset}`);
		}
		console.error(`${mutedColor}  cmd: ${cmd.join(' ')}${reset}`);

		return 1; // Return non-zero exit code
	} finally {
		// Always restore cursor visibility
		process.stdout.write('\x1B[?25h');
	}
}

/**
 * Prompt user for text input
 * Returns the input string
 */
export async function prompt(message: string): Promise<string> {
	process.stdout.write(message);

	// Check if we're in a TTY environment
	if (!process.stdin.isTTY) {
		console.log('');
		return '';
	}

	// Use readline for full line input
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return new Promise((resolve) => {
		rl.question('', (answer: string) => {
			rl.close();
			resolve(answer);
		});
	});
}

export async function selectOrganization(
	orgs: OrganizationList,
	initial?: string
): Promise<string> {
	if (orgs.length === 0) {
		fatal(
			'You do not belong to any organizations.\n' +
				'Please contact support or create an organization at https://agentuity.com'
		);
	}

	if (process.env.AGENTUITY_CLOUD_ORG_ID) {
		const org = orgs.find((o) => o.id === process.env.AGENTUITY_CLOUD_ORG_ID);
		if (org) {
			return org.id;
		}
	}

	if (!process.stdin.isTTY) {
		if (orgs.length === 1) {
			return orgs[0].id;
		}
		if (initial) {
			return initial;
		}
		fatal(
			'Organization selection required but cannot prompt in non-interactive environment. Set AGENTUITY_CLOUD_ORG_ID or provide a default organization using --org-id'
		);
	}

	const response = await enquirer.prompt<{ action: string }>({
		type: 'select',
		name: 'action',
		message: 'Select an organization',
		initial: initial || (orgs.length === 1 ? orgs[0].id : undefined),
		choices: orgs.map((o) => ({ message: o.name, name: o.id })),
	});

	return response.action;
}

/**
 * show a project list picker
 *
 * @param apiClient
 * @param showDeployment
 * @returns
 */
export async function showProjectList(
	apiClient: APIClientType,
	showDeploymentId = false
): Promise<string> {
	const projects = await spinner({
		message: 'Fetching projects',
		clearOnSuccess: true,
		callback: () => {
			return projectList(apiClient, showDeploymentId);
		},
	});

	if (projects.length === 0) {
		return '';
	}

	// TODO: might want to sort by the last org_id we used
	if (projects) {
		projects.sort((a, b) => {
			return a.name.localeCompare(b.name);
		});
	}

	const response = await enquirer.prompt<{ id: string }>({
		type: 'select',
		name: 'id',
		message: 'Select a project:',
		choices: projects.map((p) => ({
			name: p.id,
			message: `${p.name.padEnd(25, ' ')} ${muted(p.id)} ${showDeploymentId ? muted(p.latestDeploymentId ?? 'no deployment') : ''}`,
		})),
	});

	return response.id;
}

/**
 * Show a profile list picker
 *
 * @param profiles List of profiles to choose from
 * @param message Prompt message
 * @returns The name of the selected profile
 */
export async function showProfileList(
	profiles: Profile[],
	message = 'Select a profile:'
): Promise<string> {
	if (profiles.length === 0) {
		warning('No profiles found');
		process.exit(0);
	}

	// If only one profile, just return it? No, let them confirm/see it if they asked to pick?
	// But for "use" it implies switching. If only one, you are already on it or it's the only choice.
	// But for delete, you might want to delete the only one.
	// So always show list.

	// Find currently selected profile for initial selection
	const selectedProfile = profiles.find((p) => p.selected);
	const initial = selectedProfile ? selectedProfile.name : undefined;

	// If non-interactive, return initial or first
	if (!process.stdin.isTTY) {
		if (initial) return initial;
		if (profiles.length === 1) {
			return profiles[0].name;
		}
		fatal(
			'Profile selection required but cannot prompt in non-interactive environment. ' +
				'Pass a profile name explicitly when running non-interactively.'
		);
	}

	const response = await enquirer.prompt<{ name: string }>({
		type: 'select',
		name: 'name',
		message: message,
		initial: initial,
		choices: profiles.map((p) => ({
			name: p.name,
			message: p.selected ? `${p.name.padEnd(15, ' ')} ${muted('(current)')}` : p.name,
		})),
	});

	return response.name;
}

export function json(value: unknown) {
	const stringValue = typeof value === 'string' ? value : JSON.stringify(value, null, 2);

	if (shouldUseColors() && process.stdout.isTTY) {
		try {
			console.log(colorize(stringValue));
			return;
		} catch {
			/* */
		}
	}
	console.log(stringValue);
}

export function plural(count: number, singular: string, plural: string): string {
	switch (count) {
		case 0:
			return plural;
		case 1:
			return singular;
		default:
			return plural;
	}
}
