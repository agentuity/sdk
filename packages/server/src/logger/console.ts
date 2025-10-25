import { __originalConsole } from '../otel/logger';
import type { Logger } from './logger';
import { formatMessage } from './util';

const yellow = '\x1b[33m';
const green = '\x1b[32m';
const red = '\x1b[31m';
const black = '\x1b[1;30m';
const reset = '\x1b[0m';

/**
 * Console implementation of the Logger interface
 */
export default class ConsoleLogger implements Logger {
	private context: Record<string, unknown>;

	/**
	 * Creates a new console logger
	 *
	 * @param context - Initial context for the logger
	 */
	constructor(context: Record<string, unknown> = {}) {
		this.context = context;
	}

	/**
	 * Log a debug message
	 *
	 * @param message - The message to log
	 * @param args - Additional arguments to log
	 */
	debug(message: unknown, ...args: unknown[]): void {
		try {
			const formattedMessage = formatMessage(this.context, message, args);
			__originalConsole.debug(`${black}[DEBUG]${reset} ${formattedMessage}`);
		} catch (err) {
			// Fallback to direct logging if formatting fails
			__originalConsole.debug(`${black}[DEBUG]${reset} ${message}`, ...args);
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
		try {
			const formattedMessage = formatMessage(this.context, message, args);
			__originalConsole.info(`${green}[INFO]${reset}  ${formattedMessage}`);
		} catch (err) {
			// Fallback to direct logging if formatting fails
			__originalConsole.info(`${green}[INFO]${reset}  ${message}`, ...args);
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
		try {
			const formattedMessage = formatMessage(this.context, message, args);
			__originalConsole.warn(`${yellow}[WARN]${reset}  ${formattedMessage}`);
		} catch (err) {
			// Fallback to direct logging if formatting fails
			__originalConsole.warn(`${yellow}[WARN]${reset}  ${message}`, ...args);
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
		try {
			const formattedMessage = formatMessage(this.context, message, args);
			__originalConsole.error(`${red}[ERROR]${reset} ${formattedMessage}`);
		} catch (err) {
			// Fallback to direct logging if formatting fails
			__originalConsole.error(`${red}[ERROR]${reset} ${message}`, ...args);
			__originalConsole.error('Error formatting log message:', err);
		}
	}

	/**
	 * Create a child logger with additional context
	 *
	 * @param opts - Additional context for the child logger
	 * @returns A new logger instance with the additional context
	 */
	child(opts: Record<string, unknown>): Logger {
		return new ConsoleLogger({
			...this.context,
			...opts,
		});
	}
}
