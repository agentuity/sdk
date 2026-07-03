import { format } from 'node:util';
import { safeStringify, type LogLevel, type Logger } from '@agentuity/core';
import * as LogsAPI from '@opentelemetry/api-logs';
export type { Logger } from '@agentuity/core';
import ConsoleLogger from './logger/console';
import { getOriginalConsole } from './globals';

/**
 * Reference to the original console object before patching.
 * Prototypes from a process-global native snapshot so bun --hot module
 * re-evaluation does not capture an already-patched console and stack
 * log-level prefixes.
 */
export const __originalConsole: Console = Object.create(getOriginalConsole());

export class OtelLogger implements Logger {
	private readonly delegate: LogsAPI.Logger;
	private readonly context: Record<string, unknown> | undefined;
	private readonly logger: ConsoleLogger | undefined;
	private readonly logLevel: LogLevel;

	constructor(
		useConsole: boolean,
		delegate: LogsAPI.Logger,
		context?: Record<string, unknown> | undefined,
		logLevel?: LogLevel
	) {
		this.delegate = delegate;
		this.context = context;
		this.logLevel = logLevel ?? 'info';
		this.logger = useConsole ? new ConsoleLogger(context, false, this.logLevel) : undefined;
	}

	private formatMessage(message: unknown) {
		if (typeof message === 'string') {
			return message;
		}
		try {
			return safeStringify(message);
		} catch {
			// Handle circular references or other unknown stringification errors
			return String(message);
		}
	}

	private getAttributes(): Record<string, unknown> | undefined {
		return this.context;
	}

	private emit(severityNumber: LogsAPI.SeverityNumber, severityText: string, body: string) {
		const attributes = this.getAttributes();

		try {
			this.delegate.emit({
				severityNumber,
				severityText,
				body,
				attributes: attributes as LogsAPI.LogRecord['attributes'],
			});
		} catch (error) {
			// Log error to console if available, but don't fail the entire operation
			this.logger?.error('Failed to emit log to OTLP instance:', error);
		}
	}

	private shouldLog(level: LogsAPI.SeverityNumber): boolean {
		switch (this.logLevel) {
			case 'trace':
				return true;
			case 'debug':
				return (
					level === LogsAPI.SeverityNumber.DEBUG ||
					level === LogsAPI.SeverityNumber.INFO ||
					level === LogsAPI.SeverityNumber.WARN ||
					level === LogsAPI.SeverityNumber.ERROR
				);
			case 'info':
				return (
					level === LogsAPI.SeverityNumber.INFO ||
					level === LogsAPI.SeverityNumber.WARN ||
					level === LogsAPI.SeverityNumber.ERROR
				);
			case 'warn':
				return level === LogsAPI.SeverityNumber.WARN || level === LogsAPI.SeverityNumber.ERROR;
			case 'error':
				return level === LogsAPI.SeverityNumber.ERROR;
		}
		return false;
	}

	trace(message: unknown, ...args: unknown[]) {
		if (!this.shouldLog(LogsAPI.SeverityNumber.TRACE)) {
			return;
		}
		this.logger?.trace(message, ...args);
		let body: string;
		try {
			body = format(this.formatMessage(message), ...args);
		} catch {
			// Fallback if format causes recursion
			body = `${this.formatMessage(message)} ${args.map((arg) => String(arg)).join(' ')}`;
		}
		this.emit(LogsAPI.SeverityNumber.TRACE, 'TRACE', body);
	}
	debug(message: unknown, ...args: unknown[]) {
		if (!this.shouldLog(LogsAPI.SeverityNumber.DEBUG)) {
			return;
		}
		this.logger?.debug(message, ...args);
		let body: string;
		try {
			body = format(this.formatMessage(message), ...args);
		} catch {
			// Fallback if format causes recursion
			body = `${this.formatMessage(message)} ${args.map((arg) => String(arg)).join(' ')}`;
		}
		this.emit(LogsAPI.SeverityNumber.DEBUG, 'DEBUG', body);
	}
	info(message: unknown, ...args: unknown[]) {
		if (!this.shouldLog(LogsAPI.SeverityNumber.INFO)) {
			return;
		}
		this.logger?.info(message, ...args);
		let body: string;
		try {
			body = format(this.formatMessage(message), ...args);
		} catch {
			// Fallback if format causes recursion
			body = `${this.formatMessage(message)} ${args.map((arg) => String(arg)).join(' ')}`;
		}
		this.emit(LogsAPI.SeverityNumber.INFO, 'INFO', body);
	}
	warn(message: unknown, ...args: unknown[]) {
		if (!this.shouldLog(LogsAPI.SeverityNumber.WARN)) {
			return;
		}
		this.logger?.warn(message, ...args);
		let body: string;
		try {
			body = format(this.formatMessage(message), ...args);
		} catch {
			// Fallback if format causes recursion
			body = `${this.formatMessage(message)} ${args.map((arg) => String(arg)).join(' ')}`;
		}
		this.emit(LogsAPI.SeverityNumber.WARN, 'WARN', body);
	}
	error(message: unknown, ...args: unknown[]) {
		if (!this.shouldLog(LogsAPI.SeverityNumber.ERROR)) {
			return;
		}
		this.logger?.error(message, ...args);
		let body: string;
		try {
			body = format(this.formatMessage(message), ...args);
		} catch {
			// Fallback if format causes recursion
			body = `${this.formatMessage(message)} ${args.map((arg) => String(arg)).join(' ')}`;
		}
		this.emit(LogsAPI.SeverityNumber.ERROR, 'ERROR', body);
	}
	fatal(message: unknown, ...args: unknown[]): never {
		this.error(message, ...args);
		process.exit(1);
	}
	child(opts: Record<string, unknown>): Logger {
		return new OtelLogger(
			!!this.logger,
			this.delegate,
			{
				...(this.context ?? {}),
				...opts,
			},
			this.logLevel
		);
	}
}

/**
 * Creates a logger that integrates with OpenTelemetry
 *
 * @param useConsole - Whether to also log to the console
 * @param context - Additional context to include with log records
 * @returns A logger instance
 */
export function createLogger(
	useConsole: boolean,
	context?: Record<string, unknown>,
	logLevel?: LogLevel
): Logger {
	const delegate = LogsAPI.logs.getLogger('default', undefined, {
		scopeAttributes: context as LogsAPI.LoggerOptions['scopeAttributes'],
	});
	return new OtelLogger(useConsole, delegate, context, logLevel);
}

/**
 * Patches the global console object to integrate with OpenTelemetry logging.
 *
 * Safe to call across bun --hot reloads: always chains from the process-global
 * native console snapshot, never from a previous patch.
 *
 * @param attributes - Attributes to include with all console log records
 */
export function patchConsole(
	enabled: boolean,
	attributes: Record<string, unknown>,
	logLevel: LogLevel
) {
	if (!enabled) {
		return;
	}
	const original = getOriginalConsole();
	// Prototype falls through to the native console for unpatched methods.
	// Do not spread `globalThis.console` — after the first patch it is ours.
	const _patch = Object.create(original) as Console;
	const delegate = createLogger(true, attributes, logLevel);

	// Patch individual console methods instead of reassigning the whole object
	_patch.log = (...args: unknown[]) => {
		delegate.info(args[0] as string, ...args.slice(1));
	};
	_patch.error = (...args: unknown[]) => {
		delegate.error(args[0] as string, ...args.slice(1));
	};
	_patch.warn = (...args: unknown[]) => {
		delegate.warn(args[0] as string, ...args.slice(1));
	};
	_patch.debug = (...args: unknown[]) => {
		delegate.debug(args[0] as string, ...args.slice(1));
	};
	_patch.info = (...args: unknown[]) => {
		delegate.info(args[0] as string, ...args.slice(1));
	};
	_patch.dir = (...args: unknown[]) => {
		let msg = '';
		if (args.length === 1) {
			msg = format(args[0]);
		} else if (args.length >= 2) {
			msg = format(args[0], args[1]);
		} else {
			msg = safeStringify(args);
		}
		delegate.debug(msg);
	};
	_patch.dirxml = (...args: unknown[]) => {
		delegate.debug('dirxml:', ...args);
	};
	_patch.table = (...args: unknown[]) => {
		delegate.debug('table:', ...args);
	};
	_patch.trace = (...args: unknown[]) => {
		delegate.debug(args[0] as string, ...args.slice(1));
	};
	_patch.group = (...args: unknown[]) => {
		delegate.debug('group:', ...args);
	};
	_patch.groupCollapsed = (...args: unknown[]) => {
		delegate.debug('groupCollapsed:', ...args);
	};
	_patch.groupEnd = () => {
		delegate.debug('groupEnd');
	};
	_patch.clear = () => {
		/* no-op */
	};
	_patch.count = (...args: unknown[]) => {
		delegate.debug('count:', ...args);
	};
	_patch.countReset = (...args: unknown[]) => {
		delegate.debug('countReset:', ...args);
	};
	_patch.assert = (condition?: boolean, ...args: unknown[]) => {
		if (!condition) {
			delegate.error('assertion failed:', ...args);
		}
	};
	_patch.time = (...args: unknown[]) => {
		delegate.debug('time:', ...args);
	};
	_patch.timeLog = (...args: unknown[]) => {
		delegate.debug('timeLog:', ...args);
	};
	_patch.timeEnd = (...args: unknown[]) => {
		delegate.debug('timeEnd:', ...args);
	};
	_patch.profile = (...args: unknown[]) => {
		delegate.debug('profile:', ...args);
	};
	_patch.profileEnd = (...args: unknown[]) => {
		delegate.debug('profileEnd:', ...args);
	};

	// biome-ignore lint/suspicious/noGlobalAssign: intentionally replacing console with instrumented version
	console = globalThis.console = _patch;
}

/**
 * Restore `globalThis.console` to the native snapshot captured before patching.
 * Used when re-registering telemetry so callers never observe a patch chain.
 */
export function restoreConsole(): void {
	globalThis.console = getOriginalConsole();
	// biome-ignore lint/suspicious/noGlobalAssign: restore module console binding too
	console = globalThis.console;
}
