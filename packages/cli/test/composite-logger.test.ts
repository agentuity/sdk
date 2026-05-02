import type { Logger } from '@agentuity/core';
import { afterEach, describe, expect, test } from 'bun:test';
import { createCompositeLogger } from '../src/composite-logger';
import { ErrorCode, getExitCode } from '../src/errors';

const ORIGINAL_EXIT = process.exit;

function makeLogger(messages: string[]): Logger {
	const logger = {
		trace() {},
		debug() {},
		info() {},
		warn() {},
		error(message: unknown, ...args: unknown[]) {
			messages.push([message, ...args].map(String).join(' '));
		},
		fatal() {
			throw new Error('unexpected fatal call');
		},
		child() {
			return logger;
		},
	} as Logger;

	return logger;
}

describe('CompositeLogger', () => {
	afterEach(() => {
		process.exit = ORIGINAL_EXIT;
	});

	test('uses ErrorCode arguments for exit status without printing them', () => {
		const messages: string[] = [];
		let exitCode: number | undefined;
		const logger = createCompositeLogger(makeLogger(messages), makeLogger(messages));

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
		expect(messages).toEqual([message, message]);
		expect(messages.join('\n')).not.toContain('INVALID_ARGUMENT');
	});
});
