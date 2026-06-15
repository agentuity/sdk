/**
 * Log level type
 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

/**
 * Interface for logging functionality
 */
export interface Logger {
	/**
	 * Log a trace message (most verbose)
	 *
	 * @param message - The message to log
	 * @param args - Additional arguments to log
	 */
	trace(message: unknown, ...args: unknown[]): void;

	/**
	 * Log a debug message
	 *
	 * @param message - The message to log
	 * @param args - Additional arguments to log
	 */
	debug(message: unknown, ...args: unknown[]): void;

	/**
	 * Log an info message
	 *
	 * @param message - The message to log
	 * @param args - Additional arguments to log
	 */
	info(message: unknown, ...args: unknown[]): void;

	/**
	 * Log a warning message
	 *
	 * @param message - The message to log
	 * @param args - Additional arguments to log
	 */
	warn(message: unknown, ...args: unknown[]): void;

	/**
	 * Log an error message
	 *
	 * @param message - The message to log
	 * @param args - Additional arguments to log
	 */
	error(message: unknown, ...args: unknown[]): void;

	/**
	 * Log a fatal error message and exit the process
	 *
	 * @param message - The message to log
	 * @param args - Additional arguments to log
	 */
	fatal(message: unknown, ...args: unknown[]): never;

	/**
	 * Create a child logger with additional context
	 *
	 * @param opts - Additional context for the child logger
	 * @returns A new logger instance with the additional context
	 */
	child(opts: Record<string, unknown>): Logger;
}
