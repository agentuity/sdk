import { mock } from 'bun:test';
import type { Logger } from '@agentuity/core';

/**
 * Create a mock logger for testing that silently captures all log calls
 *
 * @returns Mock Logger instance with all methods mocked
 *
 * @example
 * ```ts
 * const logger = createMockLogger();
 * someFunction(logger);
 * expect(logger.info).toHaveBeenCalled();
 * ```
 */
export function createMockLogger(): Logger {
	return {
		trace: mock(() => {}),
		debug: mock(() => {}),
		info: mock(() => {}),
		warn: mock(() => {}),
		error: mock(() => {}),
		fatal: (() => {
			throw new Error('Fatal error');
		}) as never,
		child: (_opts: Record<string, unknown>) => createMockLogger(),
	};
}

/**
 * Create a mock logger that captures log messages in an array
 *
 * @returns Object with logger and captured logs array
 *
 * @example
 * ```ts
 * const { logger, logs } = createMockLoggerWithCapture();
 * logger.info('test message');
 * expect(logs).toContain('test message');
 * ```
 */
export function createMockLoggerWithCapture(): { logger: Logger; logs: string[] } {
	const logs: string[] = [];
	const logger: Logger = {
		trace: (msg: string) => logs.push(msg),
		debug: (msg: string) => logs.push(msg),
		info: (msg: string) => logs.push(msg),
		warn: (msg: string) => logs.push(msg),
		error: (msg: string) => logs.push(msg),
		fatal: ((msg: string) => {
			logs.push(msg);
			throw new Error(msg);
		}) as Logger['fatal'],
		child: () => logger,
	};
	return { logger, logs };
}
