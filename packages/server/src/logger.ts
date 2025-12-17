import type { Logger, LogLevel } from '@agentuity/core';
import { format, inspect } from 'node:util';

// Save original console before it might be patched (must be at module level)
const originalConsole = {
	log: console.log.bind(console),
	error: console.error.bind(console),
	warn: console.warn.bind(console),
	debug: console.debug.bind(console),
};

const LOG_LEVELS: Record<LogLevel, number> = {
	trace: 0,
	debug: 1,
	info: 2,
	warn: 3,
	error: 4,
};

const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

// Helper to convert hex color to ANSI 24-bit color code
function hexToAnsi(hex: string): string {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return `\x1b[38;2;${r};${g};${b}m`;
}

function shouldUseColors(): boolean {
	// Check for NO_COLOR environment variable (any non-empty value disables colors)
	if (process.env.NO_COLOR) {
		return false;
	}

	// Check for TERM=dumb
	if (process.env.TERM === 'dumb') {
		return false;
	}

	// Check if stdout is a TTY
	if (!process.stdout || typeof process.stdout.isTTY === 'undefined') {
		return false;
	}

	if (!process.stdout.isTTY) {
		return false;
	}

	return true;
}

const USE_COLORS = shouldUseColors();

interface LogColors {
	level: string;
	message: string;
	timestamp: string;
}

export type ColorScheme = 'light' | 'dark';

function getLogColors(scheme: ColorScheme): Record<LogLevel, LogColors> {
	if (scheme === 'light') {
		// Darker, high-contrast colors for light backgrounds
		return {
			trace: {
				level: hexToAnsi('#008B8B') + BOLD, // Dark cyan
				message: hexToAnsi('#4B4B4B'), // Dark gray
				timestamp: hexToAnsi('#808080'), // Gray
			},
			debug: {
				level: hexToAnsi('#0000CD') + BOLD, // Medium blue
				message: hexToAnsi('#006400'), // Dark green
				timestamp: hexToAnsi('#808080'),
			},
			info: {
				level: hexToAnsi('#FF8C00') + BOLD, // Dark orange
				message: hexToAnsi('#0066CC') + BOLD, // Strong blue
				timestamp: hexToAnsi('#808080'),
			},
			warn: {
				level: hexToAnsi('#9400D3') + BOLD, // Dark violet
				message: hexToAnsi('#8B008B'), // Dark magenta
				timestamp: hexToAnsi('#808080'),
			},
			error: {
				level: hexToAnsi('#DC143C') + BOLD, // Crimson
				message: hexToAnsi('#8B0000') + BOLD, // Dark red
				timestamp: hexToAnsi('#808080'),
			},
		};
	}

	// Dark mode colors (brighter for dark backgrounds)
	return {
		trace: {
			level: hexToAnsi('#00FFFF') + BOLD, // Cyan
			message: hexToAnsi('#A0A0A0'), // Light gray
			timestamp: hexToAnsi('#666666'),
		},
		debug: {
			level: hexToAnsi('#5C9CFF') + BOLD, // Blue
			message: hexToAnsi('#90EE90'), // Light green
			timestamp: hexToAnsi('#666666'),
		},
		info: {
			level: hexToAnsi('#FFD700') + BOLD, // Gold/Yellow
			message: hexToAnsi('#FFFFFF') + BOLD, // White
			timestamp: hexToAnsi('#666666'),
		},
		warn: {
			level: hexToAnsi('#FF00FF') + BOLD, // Magenta
			message: hexToAnsi('#FF00FF'), // Magenta
			timestamp: hexToAnsi('#666666'),
		},
		error: {
			level: hexToAnsi('#FF4444') + BOLD, // Red
			message: hexToAnsi('#FF4444'), // Red
			timestamp: hexToAnsi('#666666'),
		},
	};
}

/**
 * Console logger implementation
 */
export class ConsoleLogger implements Logger {
	public level: LogLevel;
	private showTimestamp: boolean;
	private colorScheme: ColorScheme;
	private colors: Record<LogLevel, LogColors>;
	private showPrefix = true;
	private context: Record<string, unknown>;

	constructor(
		level: LogLevel = 'info',
		showTimestamp: boolean = false,
		colorScheme: ColorScheme = 'dark',
		context: Record<string, unknown> = {}
	) {
		this.level = level;
		this.showTimestamp = showTimestamp;
		this.colorScheme = colorScheme;
		this.colors = getLogColors(this.colorScheme);
		this.context = context;
	}

	setLevel(level: LogLevel): void {
		this.level = level;
	}

	setTimestamp(enabled: boolean): void {
		this.showTimestamp = enabled;
	}

	setColorScheme(scheme: ColorScheme): void {
		this.colorScheme = scheme;
		this.colors = getLogColors(this.colorScheme);
	}

	setShowPrefix(show: boolean): void {
		this.showPrefix = show;
	}

	private shouldLog(level: LogLevel): boolean {
		return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
	}

	private formatMessage(message: unknown, args: unknown[]): string {
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const base = format(message as any, ...(args as any[]));

			if (!this.context || Object.keys(this.context).length === 0) {
				return base;
			}

			const ctx = Object.entries(this.context)
				.map(
					([k, v]) =>
						`${k}=${typeof v === 'object' ? inspect(v, { depth: 2, maxArrayLength: 50, colors: false }) : String(v)}`
				)
				.join(' ');

			const result = `${base} ${ctx}`;

			const MAX_LENGTH = 10000;
			if (result.length > MAX_LENGTH) {
				return `${result.slice(0, MAX_LENGTH)} …(+${result.length - MAX_LENGTH} chars truncated)`;
			}

			return result;
		} catch {
			const base = [String(message), ...args.map((a) => String(a))].join(' ');
			return this.context && Object.keys(this.context).length > 0
				? `${base} ${JSON.stringify(this.context)}`
				: base;
		}
	}

	private log(level: LogLevel, message: unknown, ...args: unknown[]): void {
		if (!this.shouldLog(level)) {
			return;
		}

		const colors = this.colors[level];
		const levelText = `[${level.toUpperCase()}]`;
		const formattedMessage = this.formatMessage(message, args);

		let output = '';

		if (USE_COLORS) {
			if (this.showPrefix) {
				if (this.showTimestamp) {
					const timestamp = new Date().toISOString();
					output = `${colors.timestamp}[${timestamp}]${RESET} ${colors.level}${levelText}${RESET} ${colors.message}${formattedMessage}${RESET}`;
				} else {
					output = `${colors.level}${levelText}${RESET} ${colors.message}${formattedMessage}${RESET}`;
				}
			} else {
				// No prefix - just the message with color
				output = `${colors.message}${formattedMessage}${RESET}`;
			}
		} else {
			// No colors - plain text output
			if (this.showPrefix) {
				if (this.showTimestamp) {
					const timestamp = new Date().toISOString();
					output = `[${timestamp}] ${levelText} ${formattedMessage}`;
				} else {
					output = `${levelText} ${formattedMessage}`;
				}
			} else {
				// No prefix, no colors - just message
				output = formattedMessage;
			}
		}

		// Use original console to avoid recursive logging when console is patched
		if (level === 'error') {
			originalConsole.error(output);
		} else if (level === 'warn') {
			originalConsole.warn(output);
		} else {
			originalConsole.log(output);
		}
	}

	trace(message: unknown, ...args: unknown[]): void {
		this.log('trace', message, ...args);
	}

	debug(message: unknown, ...args: unknown[]): void {
		this.log('debug', message, ...args);
	}

	info(message: unknown, ...args: unknown[]): void {
		this.log('info', message, ...args);
	}

	warn(message: unknown, ...args: unknown[]): void {
		this.log('warn', message, ...args);
	}

	error(message: unknown, ...args: unknown[]): void {
		this.log('error', message, ...args);
	}

	fatal(message: unknown, ...args: unknown[]): never {
		this.log('error', message, ...args);
		process.exit(1);
	}

	child(opts: Record<string, unknown>): Logger {
		return new ConsoleLogger(this.level, this.showTimestamp, this.colorScheme, {
			...this.context,
			...opts,
		});
	}
}

/**
 * Create a new console logger instance
 *
 * @param level - The minimum log level to display
 * @param showTimestamp - Whether to show timestamps in log messages
 * @param colorScheme - The color scheme to use ('light' or 'dark')
 * @param context - Initial context for the logger
 * @returns A new ConsoleLogger instance
 */
export function createLogger(
	level: LogLevel = 'info',
	showTimestamp: boolean = false,
	colorScheme: ColorScheme = 'dark',
	context: Record<string, unknown> = {}
): Logger {
	return new ConsoleLogger(level, showTimestamp, colorScheme, context);
}
