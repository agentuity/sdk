import { createMockLogger, createMockLoggerWithCapture } from '@agentuity/test-utils';
import { afterEach, describe, expect, test } from 'bun:test';
import { createCompositeLogger } from '../src/composite-logger';
import { ErrorCode, getExitCode } from '../src/errors';

const ORIGINAL_EXIT = process.exit;

describe('CompositeLogger', () => {
	afterEach(() => {
		process.exit = ORIGINAL_EXIT;
	});

	test('uses ErrorCode arguments for exit status without printing them', () => {
		const first = createMockLoggerWithCapture();
		const second = createMockLoggerWithCapture();
		let exitCode: number | undefined;
		const logger = createCompositeLogger(first.logger, second.logger);

		process.exit = ((code?: number) => {
			exitCode = code;
			throw new Error('__EXIT__');
		}) as typeof process.exit;

		const message =
			'No public key provided. Use --file to specify a file or pipe the key via stdin.\n\n' +
			'Generate a key with:\n' +
			'  openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -pkeyopt ec_param_enc:named_curve -out private.pem\n' +
			'  openssl pkey -in private.pem -pubout -out public.pem';

		expect(() => logger.fatal(message, ErrorCode.INVALID_ARGUMENT)).toThrow('__EXIT__');

		expect(exitCode).toBe(getExitCode(ErrorCode.INVALID_ARGUMENT));
		const messages = [...first.logs, ...second.logs];
		expect(messages).toEqual([message, message]);
		expect(messages.join('\n')).not.toContain('INVALID_ARGUMENT');
	});

	test('uses formatting arguments before trailing ErrorCode', () => {
		const first = createMockLoggerWithCapture();
		const second = createMockLoggerWithCapture();
		let exitCode: number | undefined;
		const logger = createCompositeLogger(first.logger, second.logger);

		process.exit = ((code?: number) => {
			exitCode = code;
			throw new Error('__EXIT__');
		}) as typeof process.exit;

		expect(() =>
			logger.fatal('No public key: %s', 'missing value', ErrorCode.INVALID_ARGUMENT)
		).toThrow('__EXIT__');

		const messages = [...first.logs, ...second.logs];
		expect(exitCode).toBe(getExitCode(ErrorCode.INVALID_ARGUMENT));
		expect(messages).toEqual(['No public key: missing value', 'No public key: missing value']);
		expect(messages.join('\n')).not.toContain('INVALID_ARGUMENT');
	});

	test('exits after ErrorCode fatal even when a delegate throws', () => {
		const throwingLogger = createMockLogger();
		const { logger: captureLogger, logs } = createMockLoggerWithCapture();
		let exitCode: number | undefined;
		const logger = createCompositeLogger(throwingLogger, captureLogger);

		throwingLogger.error = () => {
			throw new Error('delegate failed');
		};
		process.exit = ((code?: number) => {
			exitCode = code;
			throw new Error('__EXIT__');
		}) as typeof process.exit;

		expect(() => logger.fatal('No public key', ErrorCode.INVALID_ARGUMENT)).toThrow('__EXIT__');

		expect(exitCode).toBe(getExitCode(ErrorCode.INVALID_ARGUMENT));
		expect(logs).toEqual(['No public key']);
	});
});
