import { describe, test, expect } from 'bun:test';
import type { Logger, LogLevel } from '../src/logger';

describe('Logger interface', () => {
	test('should define correct log levels', () => {
		const levels: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error'];
		expect(levels).toHaveLength(5);
		expect(levels).toContain('trace');
		expect(levels).toContain('debug');
		expect(levels).toContain('info');
		expect(levels).toContain('warn');
		expect(levels).toContain('error');
	});

	test('should implement Logger interface', () => {
		const mockLogger: Logger = {
			trace: (_message: unknown, ..._args: unknown[]) => {},
			debug: (_message: unknown, ..._args: unknown[]) => {},
			info: (_message: unknown, ..._args: unknown[]) => {},
			warn: (_message: unknown, ..._args: unknown[]) => {},
			error: (_message: unknown, ..._args: unknown[]) => {},
			fatal: (_message: unknown, ..._args: unknown[]): never => {
				throw new Error('Fatal error');
			},
			child: (_opts: Record<string, unknown>): Logger => mockLogger,
		};

		expect(typeof mockLogger.trace).toBe('function');
		expect(typeof mockLogger.debug).toBe('function');
		expect(typeof mockLogger.info).toBe('function');
		expect(typeof mockLogger.warn).toBe('function');
		expect(typeof mockLogger.error).toBe('function');
		expect(typeof mockLogger.fatal).toBe('function');
		expect(typeof mockLogger.child).toBe('function');
	});

	test('should support child logger creation', () => {
		const parentLogger: Logger = {
			trace: () => {},
			debug: () => {},
			info: () => {},
			warn: () => {},
			error: () => {},
			fatal: (): never => {
				throw new Error('Fatal');
			},
			child: (opts: Record<string, unknown>): Logger => {
				return {
					...parentLogger,
					// Child can augment context
					context: opts,
				} as Logger & { context: Record<string, unknown> };
			},
		};

		const child = parentLogger.child({ requestId: '123' });
		expect(child).toBeDefined();
		expect(typeof child.trace).toBe('function');
	});
});
