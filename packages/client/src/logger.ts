import type { Logger } from '@agentuity/adapter';

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
			const first = args[0];
			if (first instanceof Error) {
				throw first;
			}
			throw new Error(String(first ?? 'fatal'));
		},
		child() {
			return createMinimalLogger();
		},
	};
	return logger;
}
