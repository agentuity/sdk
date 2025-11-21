import type { Logger, GlobalOptions } from './types';
import { exitWithError, type StructuredError, ErrorCode, createError, getExitCode } from './errors';

/**
 * Enhanced logger wrapper that supports structured errors
 */
export class CLILogger implements Logger {
	constructor(
		private logger: Logger,
		private options: GlobalOptions
	) {}

	/**
	 * Exit with a structured error (supports --error-format=json)
	 */
	fatalWithError(error: StructuredError): never {
		const errorFormat = this.options.errorFormat ?? 'text';
		return exitWithError(error, this.logger, errorFormat);
	}

	// Delegate all other logger methods
	trace(message: string, ...args: unknown[]): void {
		this.logger.trace(message, ...args);
	}

	debug(message: string, ...args: unknown[]): void {
		this.logger.debug(message, ...args);
	}

	info(message: string, ...args: unknown[]): void {
		this.logger.info(message, ...args);
	}

	warn(message: string, ...args: unknown[]): void {
		this.logger.warn(message, ...args);
	}

	error(message: string, ...args: unknown[]): void {
		this.logger.error(message, ...args);
	}

	fatal(message: string, errorCode?: ErrorCode, ...args: unknown[]): never {
		if (errorCode) {
			// Use structured error with proper exit code
			const formattedMessage = args.length > 0 ? this.formatMessage(message, ...args) : message;
			const error = createError(errorCode, formattedMessage);
			const exitCode = getExitCode(errorCode);

			if (this.options.errorFormat === 'json') {
				exitWithError(error, this.logger, 'json');
			} else {
				this.logger.error(formattedMessage);
				process.exit(exitCode);
			}
		} else {
			// Fallback to default behavior (exit code 1)
			this.logger.fatal(message, ...args);
		}
	}

	private formatMessage(message: string, ...args: unknown[]): string {
		// Simple sprintf-style formatting
		let formatted = message;
		for (const arg of args) {
			formatted = formatted.replace(/%[sd]/, String(arg));
		}
		return formatted;
	}

	child(opts: Record<string, unknown>): Logger {
		return this.logger.child(opts);
	}
}

/**
 * Wrap a logger with CLI error handling capabilities
 */
export function wrapLogger(logger: Logger, options: GlobalOptions): CLILogger {
	return new CLILogger(logger, options);
}
