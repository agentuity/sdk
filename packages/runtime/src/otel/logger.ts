import { format } from 'node:util';
import { safeStringify } from '@agentuity/core';
import * as LogsAPI from '@opentelemetry/api-logs';
import type { Logger } from '../logger';
import ConsoleLogger from '../logger/console';
import { getAgentContext } from '../_context';

/**
 * Reference to the original console object before patching
 */
export const __originalConsole = Object.create(console); // save the original console before we patch it

export class OtelLogger implements Logger {
	private readonly delegates: LogsAPI.Logger[];
	private readonly context: Record<string, unknown> | undefined;
	private readonly logger: ConsoleLogger | undefined;

	constructor(
		useConsole: boolean,
		delegates: LogsAPI.Logger | LogsAPI.Logger[],
		context?: Record<string, unknown> | undefined
	) {
		this.delegates = Array.isArray(delegates) ? delegates : [delegates];
		this.context = context;
		this.logger = useConsole ? new ConsoleLogger(context, false) : undefined;
	}

	addDelegate(delegate: LogsAPI.Logger) {
		this.delegates.push(delegate);
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
		try {
			const actx = getAgentContext();
			const current = actx.current?.metadata;
			if (current) {
				const result: Record<string, unknown> = {
					...(this.context ?? {}),
				};
				for (const [key, value] of Object.entries(current)) {
					if (value !== null && value !== undefined) {
						result[`@agentuity/${key}`] = value as unknown;
					}
				}
				return result;
			}
		} catch {
			/* fall through */
		}
		return this.context;
	}

	private emitToAll(severityNumber: LogsAPI.SeverityNumber, severityText: string, body: string) {
		const attributes = this.getAttributes();

		this.delegates.forEach((delegate) => {
			try {
				delegate.emit({
					severityNumber,
					severityText,
					body,
					attributes: attributes as LogsAPI.LogRecord['attributes'],
				});
			} catch (error) {
				// Log error to console if available, but don't fail the entire operation
				this.logger?.error('Failed to emit log to OTLP instance:', error);
			}
		});
	}

	trace(message: unknown, ...args: unknown[]) {
		this.logger?.trace(message, ...args);
		let body: string;
		try {
			body = format(this.formatMessage(message), ...args);
		} catch {
			// Fallback if format causes recursion
			body = `${this.formatMessage(message)} ${args.map((arg) => String(arg)).join(' ')}`;
		}
		this.emitToAll(LogsAPI.SeverityNumber.TRACE, 'TRACE', body);
	}
	debug(message: unknown, ...args: unknown[]) {
		this.logger?.debug(message, ...args);
		let body: string;
		try {
			body = format(this.formatMessage(message), ...args);
		} catch {
			// Fallback if format causes recursion
			body = `${this.formatMessage(message)} ${args.map((arg) => String(arg)).join(' ')}`;
		}
		this.emitToAll(LogsAPI.SeverityNumber.DEBUG, 'DEBUG', body);
	}
	info(message: unknown, ...args: unknown[]) {
		this.logger?.info(message, ...args);
		let body: string;
		try {
			body = format(this.formatMessage(message), ...args);
		} catch {
			// Fallback if format causes recursion
			body = `${this.formatMessage(message)} ${args.map((arg) => String(arg)).join(' ')}`;
		}
		this.emitToAll(LogsAPI.SeverityNumber.INFO, 'INFO', body);
	}
	warn(message: unknown, ...args: unknown[]) {
		this.logger?.warn(message, ...args);
		let body: string;
		try {
			body = format(this.formatMessage(message), ...args);
		} catch {
			// Fallback if format causes recursion
			body = `${this.formatMessage(message)} ${args.map((arg) => String(arg)).join(' ')}`;
		}
		this.emitToAll(LogsAPI.SeverityNumber.WARN, 'WARN', body);
	}
	error(message: unknown, ...args: unknown[]) {
		this.logger?.error(message, ...args);
		let body: string;
		try {
			body = format(this.formatMessage(message), ...args);
		} catch {
			// Fallback if format causes recursion
			body = `${this.formatMessage(message)} ${args.map((arg) => String(arg)).join(' ')}`;
		}
		this.emitToAll(LogsAPI.SeverityNumber.ERROR, 'ERROR', body);
	}
	fatal(message: unknown, ...args: unknown[]): never {
		this.error(message, ...args);
		process.exit(1);
	}
	child(opts: Record<string, unknown>): Logger {
		return new OtelLogger(!!this.logger, this.delegates, {
			...(this.context ?? {}),
			...opts,
		});
	}
}

/**
 * Creates a logger that integrates with OpenTelemetry
 *
 * @param useConsole - Whether to also log to the console
 * @param context - Additional context to include with log records
 * @returns A logger instance
 */
export function createLogger(useConsole: boolean, context?: Record<string, unknown>): Logger {
	const delegate = LogsAPI.logs.getLogger('default', undefined, {
		scopeAttributes: context as LogsAPI.LoggerOptions['scopeAttributes'],
	});
	return new OtelLogger(useConsole, [delegate], context);
}

/**
 * Patches the global console object to integrate with OpenTelemetry logging
 *
 * @param attributes - Attributes to include with all console log records
 */
export function patchConsole(enabled: boolean, attributes: Record<string, unknown>) {
	if (!enabled) {
		return;
	}
	const _patch = { ...__originalConsole };
	const delegate = createLogger(true, attributes);

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

	// eslint-disable-next-line no-global-assign
	console = globalThis.console = _patch;
}
