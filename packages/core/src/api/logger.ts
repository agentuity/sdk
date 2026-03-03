import type { Logger } from '../logger.ts';

/**
 * Create a minimal logger that works in any environment (browser + server).
 * Used as default when no logger is provided.
 */
export function createMinimalLogger(): Logger {
	const noop = () => {};
	const logger: Logger = {
		trace: noop,
		debug: noop,
		info: console.log.bind(console),
		warn: console.warn.bind(console),
		error: console.error.bind(console),
		fatal(...args: unknown[]): never {
			console.error(...args);
			throw new Error(String(args[0] ?? 'fatal'));
		},
		child() {
			return createMinimalLogger();
		},
	};
	return logger;
}
