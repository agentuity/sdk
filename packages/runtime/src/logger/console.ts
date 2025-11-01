import type { LogLevel } from '@agentuity/core';
import { __originalConsole } from '../otel/logger';
import type { Logger } from './logger';
import { formatMessage } from './util';

const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

// Helper to convert hex color to ANSI 24-bit color code
function hexToAnsi(hex: string): string {
	const r = parseInt(hex.slice(1, 3), 16);
	const g = parseInt(hex.slice(3, 5), 16);
	const b = parseInt(hex.slice(5, 7), 16);
	return `\x1b[38;2;${r};${g};${b}m`;
}

interface LogColors {
	level: string;
	message: string;
}

type ColorScheme = 'light' | 'dark';

function getLogColors(scheme: ColorScheme): Record<LogLevel, LogColors> {
	if (scheme === 'light') {
		// Darker, high-contrast colors for light backgrounds
		return {
			trace: {
				level: hexToAnsi('#008B8B') + BOLD, // Dark cyan
				message: hexToAnsi('#4B4B4B'), // Dark gray
			},
			debug: {
				level: hexToAnsi('#0000CD') + BOLD, // Medium blue
				message: hexToAnsi('#006400'), // Dark green
			},
			info: {
				level: hexToAnsi('#FF8C00') + BOLD, // Dark orange
				message: hexToAnsi('#0066CC') + BOLD, // Strong blue
			},
			warn: {
				level: hexToAnsi('#9400D3') + BOLD, // Dark violet
				message: hexToAnsi('#8B008B'), // Dark magenta
			},
			error: {
				level: hexToAnsi('#DC143C') + BOLD, // Crimson
				message: hexToAnsi('#8B0000') + BOLD, // Dark red
			},
		};
	}

	// Dark mode colors (brighter for dark backgrounds)
	return {
		trace: {
			level: hexToAnsi('#00FFFF') + BOLD, // Cyan
			message: hexToAnsi('#A0A0A0'), // Light gray
		},
		debug: {
			level: hexToAnsi('#5C9CFF') + BOLD, // Blue
			message: hexToAnsi('#90EE90'), // Light green
		},
		info: {
			level: hexToAnsi('#FFD700') + BOLD, // Gold/Yellow
			message: hexToAnsi('#FFFFFF') + BOLD, // White
		},
		warn: {
			level: hexToAnsi('#FF00FF') + BOLD, // Magenta
			message: hexToAnsi('#FF00FF'), // Magenta
		},
		error: {
			level: hexToAnsi('#FF4444') + BOLD, // Red
			message: hexToAnsi('#FF4444'), // Red
		},
	};
}

// Detect color scheme from environment
function detectColorScheme(): ColorScheme {
	const scheme = process.env.COLOR_SCHEME?.toLowerCase();
	if (scheme === 'light' || scheme === 'dark') {
		return scheme;
	}
	if (process.env.CI) {
		return 'light';
	}
	return 'dark'; // Default to dark mode
}

/**
 * Console implementation of the Logger interface
 */
export default class ConsoleLogger implements Logger {
	private context: Record<string, unknown>;
	private formatContext: boolean;
	private logLevel: LogLevel;
	private colors: Record<LogLevel, LogColors>;
	private detectedTraceLoopLog: boolean | undefined;

	/**
	 * Creates a new console logger
	 *
	 * @param context - Initial context for the logger
	 */
	constructor(
		context: Record<string, unknown> = {},
		formatContext = true,
		logLevel: LogLevel = 'info'
	) {
		this.context = context;
		this.formatContext = formatContext;
		this.logLevel = logLevel;
		this.colors = getLogColors(detectColorScheme());
	}

	private shouldLog(level: LogLevel): boolean {
		switch (this.logLevel) {
			case 'trace':
				return true;
			case 'debug':
				return level === 'debug' || level === 'info' || level === 'warn' || level === 'error';
			case 'info':
				return level === 'info' || level === 'warn' || level === 'error';
			case 'warn':
				return level === 'warn' || level === 'error';
			case 'error':
				return level === 'error';
		}
		return false;
	}

	/**
	 * Log a trace message (most verbose)
	 *
	 * @param message - The message to log
	 * @param args - Additional arguments to log
	 */
	trace(message: unknown, ...args: unknown[]): void {
		if (!this.shouldLog('trace')) {
			return;
		}
		try {
			const colors = this.colors.trace;
			const formattedMessage = formatMessage(this.formatContext, this.context, message, args);
			__originalConsole.debug(
				`${colors.level}[TRACE]${RESET} ${colors.message}${formattedMessage}${RESET}`
			);
		} catch (err) {
			// Fallback to direct logging if formatting fails
			const colors = this.colors.trace;
			__originalConsole.debug(`${colors.level}[TRACE]${RESET} ${message}`, ...args);
			__originalConsole.error('Error formatting log message:', err);
		}
	}

	/**
	 * Log a debug message
	 *
	 * @param message - The message to log
	 * @param args - Additional arguments to log
	 */
	debug(message: unknown, ...args: unknown[]): void {
		if (!this.shouldLog('debug')) {
			return;
		}
		try {
			const colors = this.colors.debug;
			const formattedMessage = formatMessage(this.formatContext, this.context, message, args);
			__originalConsole.debug(
				`${colors.level}[DEBUG]${RESET} ${colors.message}${formattedMessage}${RESET}`
			);
		} catch (err) {
			// Fallback to direct logging if formatting fails
			const colors = this.colors.debug;
			__originalConsole.debug(`${colors.level}[DEBUG]${RESET} ${message}`, ...args);
			__originalConsole.error('Error formatting log message:', err);
		}
	}

	/**
	 * Log an info message
	 *
	 * @param message - The message to log
	 * @param args - Additional arguments to log
	 */
	info(message: unknown, ...args: unknown[]): void {
		if (!this.shouldLog('info')) {
			return;
		}
		// suppress the default traceloop message at info level
		if (
			!this.detectedTraceLoopLog &&
			typeof message === 'string' &&
			message.includes('Traceloop exporting traces to')
		) {
			this.detectedTraceLoopLog = true;
			if (this.shouldLog('debug')) {
				this.debug(message, ...args);
			}
			return;
		}
		try {
			const colors = this.colors.info;
			const formattedMessage = formatMessage(this.formatContext, this.context, message, args);
			__originalConsole.info(
				`${colors.level}[INFO]${RESET} ${colors.message}${formattedMessage}${RESET}`
			);
		} catch (err) {
			// Fallback to direct logging if formatting fails
			const colors = this.colors.info;
			__originalConsole.info(`${colors.level}[INFO]${RESET} ${message}`, ...args);
			__originalConsole.error('Error formatting log message:', err);
		}
	}

	/**
	 * Log a warning message
	 *
	 * @param message - The message to log
	 * @param args - Additional arguments to log
	 */
	warn(message: unknown, ...args: unknown[]): void {
		if (!this.shouldLog('warn')) {
			return;
		}
		try {
			const colors = this.colors.warn;
			const formattedMessage = formatMessage(this.formatContext, this.context, message, args);
			__originalConsole.warn(
				`${colors.level}[WARN]${RESET}  ${colors.message}${formattedMessage}${RESET}`
			);
		} catch (err) {
			// Fallback to direct logging if formatting fails
			const colors = this.colors.warn;
			__originalConsole.warn(`${colors.level}[WARN]${RESET}  ${message}`, ...args);
			__originalConsole.error('Error formatting log message:', err);
		}
	}

	/**
	 * Log an error message
	 *
	 * @param message - The message to log
	 * @param args - Additional arguments to log
	 */
	error(message: unknown, ...args: unknown[]): void {
		if (!this.shouldLog('error')) {
			return;
		}
		try {
			const colors = this.colors.error;
			const formattedMessage = formatMessage(this.formatContext, this.context, message, args);
			__originalConsole.error(
				`${colors.level}[ERROR]${RESET} ${colors.message}${formattedMessage}${RESET}`
			);
		} catch (err) {
			// Fallback to direct logging if formatting fails
			const colors = this.colors.error;
			__originalConsole.error(`${colors.level}[ERROR]${RESET} ${message}`, ...args);
			__originalConsole.error('Error formatting log message:', err);
		}
	}

	/**
	 * Log a fatal error message and exit the process
	 *
	 * @param message - The message to log
	 * @param args - Additional arguments to log
	 */
	fatal(message: unknown, ...args: unknown[]): never {
		this.error(message, ...args);
		process.exit(1);
	}

	/**
	 * Create a child logger with additional context
	 *
	 * @param opts - Additional context for the child logger
	 * @returns A new logger instance with the additional context
	 */
	child(opts: Record<string, unknown>): Logger {
		return new ConsoleLogger(
			{
				...this.context,
				...opts,
			},
			this.formatContext,
			this.logLevel
		);
	}
}
