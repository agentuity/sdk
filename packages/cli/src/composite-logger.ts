/**
 * Composite Logger
 *
 * Combines multiple loggers to write to all of them simultaneously.
 * Used to send logs to both the console (respecting user log level)
 * and the internal trace logger (always at trace level for debugging).
 */

import type { Logger } from '@agentuity/core/index.ts';

/**
 * A logger that delegates to multiple child loggers
 */
export class CompositeLogger implements Logger {
	constructor(private loggers: Logger[]) {}

	trace(message: unknown, ...args: unknown[]): void {
		for (const logger of this.loggers) {
			logger.trace(message, ...args);
		}
	}

	debug(message: unknown, ...args: unknown[]): void {
		for (const logger of this.loggers) {
			logger.debug(message, ...args);
		}
	}

	info(message: unknown, ...args: unknown[]): void {
		for (const logger of this.loggers) {
			logger.info(message, ...args);
		}
	}

	warn(message: unknown, ...args: unknown[]): void {
		for (const logger of this.loggers) {
			logger.warn(message, ...args);
		}
	}

	error(message: unknown, ...args: unknown[]): void {
		for (const logger of this.loggers) {
			logger.error(message, ...args);
		}
	}

	fatal(message: unknown, ...args: unknown[]): never {
		// Call fatal on all loggers, but only the first one will exit
		for (const logger of this.loggers) {
			try {
				logger.fatal(message, ...args);
			} catch {
				// Ignore - the logger will exit the process
			}
		}
		// Fallback exit if none of the loggers exit
		process.exit(1);
	}

	child(opts: Record<string, unknown>): Logger {
		// Create child loggers for all delegates
		const childLoggers = this.loggers.map((logger) => logger.child(opts));
		return new CompositeLogger(childLoggers);
	}

	/**
	 * Add a logger to the composite
	 */
	addLogger(logger: Logger): void {
		this.loggers.push(logger);
	}

	/**
	 * Get all loggers in the composite
	 */
	getLoggers(): Logger[] {
		return [...this.loggers];
	}
}

/**
 * Create a composite logger from multiple loggers
 */
export function createCompositeLogger(...loggers: Logger[]): CompositeLogger {
	return new CompositeLogger(loggers);
}
