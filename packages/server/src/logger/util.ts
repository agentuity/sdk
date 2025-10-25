import { formatWithOptions, inspect } from 'node:util';
import { safeStringify } from '../_util';

export function buildContextString(context?: Record<string, unknown>): string {
	if (context) {
		const contextStr =
			context && Object.keys(context).length > 0
				? Object.entries(context)
						.map(([key, value]) => {
							try {
								return `${key}=${typeof value === 'object' ? safeStringify(value) : value}`;
							} catch {
								return `${key}=[object Object]`;
							}
						})
						.join(' ')
				: '';

		return contextStr;
	}
	return '';
}

/**
 * Formats a log message with context
 *
 * @param message - The message to format
 * @param args - Additional arguments for formatting
 * @returns The formatted message with context
 * @private
 */
export function formatMessage(
	context: Record<string, unknown> | undefined,
	message: unknown,
	args: unknown[]
): string {
	// Format the context string
	const contextStr = buildContextString(context);

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
