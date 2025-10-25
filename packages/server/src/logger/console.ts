import { formatWithOptions, inspect } from 'node:util';
import { __originalConsole } from '../otel/logger';
import { safeStringify } from '../_util';
import type { Logger } from './logger';
import { buildContextString } from './util';

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
	 * Formats a log message with context
	 *
	 * @param message - The message to format
	 * @param args - Additional arguments for formatting
	 * @returns The formatted message with context
	 * @private
	 */
	private formatMessage(message: unknown, args: unknown[]): string {
		// Format the context string
		const contextStr = buildContextString(this.context);

		// Format the message based on its type
		let _message: string;
		if (typeof message === 'string') {
			_message = message;
		} else if (typeof message === 'number' || typeof message === 'boolean') {
			_message = String(message);
		} else if (message === null) {
			_message = 'null';
		} else if (message === undefined) {
			_message = 'undefined';
		} else {
			// Use inspect for objects for better formatting
			_message = inspect(message, { depth: null, colors: false });
		}

		// Format the message with args
		let formattedMessage: string;
		try {
			// Only use format if we have arguments
			if (args.length > 0) {
				formattedMessage = formatWithOptions({ depth: null }, _message, ...args);
			} else {
				formattedMessage = _message;
			}
		} catch {
			// If formatting fails, use a simple concatenation
			formattedMessage = `${_message} ${args
				.map((arg) => {
					try {
						return typeof arg === 'object' ? safeStringify(arg) : String(arg);
					} catch {
						return '[object Object]';
					}
				})
				.join(' ')}`;
		}

		// Combine message with context
		return `${formattedMessage}${contextStr ? ` [${contextStr}]` : ''}`;
	}

	/**
	 * Log a debug message
	 *
	 * @param message - The message to log
	 * @param args - Additional arguments to log
	 */
	debug(message: unknown, ...args: unknown[]): void {
		try {
			const formattedMessage = this.formatMessage(message, args);
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
			const formattedMessage = this.formatMessage(message, args);
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
			const formattedMessage = this.formatMessage(message, args);
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
			const formattedMessage = this.formatMessage(message, args);
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
