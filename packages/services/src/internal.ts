/**
 * Internal logger for SDK diagnostics
 * Simple console logger with optional debug mode
 */

const debug = process.env.AGENTUITY_SDK_LOG_LEVEL === 'debug';

export const internal = {
	debug: (message: unknown, ...args: unknown[]) =>
		debug && console.debug('[SDK]', message, ...args),
	info: (message: unknown, ...args: unknown[]) => debug && console.info('[SDK]', message, ...args),
	warn: (message: unknown, ...args: unknown[]) => debug && console.warn('[SDK]', message, ...args),
	error: (message: unknown, ...args: unknown[]) => console.error('[SDK]', message, ...args),
};
