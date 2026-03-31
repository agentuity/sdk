import { describe, expect, test } from 'bun:test';
import { sanitizeCliCommandForLogging } from '../src/internal-logger';

describe('internal logger command sanitization', () => {
	test('redacts coder config positional API keys from logged command metadata', () => {
		const sanitized = sanitizeCliCommandForLogging('coder config set apikey agc_secret_value', [
			'--profile',
			'production',
		]);

		expect(sanitized.command).toBe('coder config set apikey ***MASKED***');
		expect(sanitized.args).toEqual(['--profile', 'production']);
	});

	test('redacts sensitive flag values from logged args', () => {
		const sanitized = sanitizeCliCommandForLogging('coder start', [
			'--api-key',
			'agc_secret_value',
			'--token=secret_token',
			'--hub-url',
			'https://hub.example.com',
		]);

		expect(sanitized.command).toBe('coder start');
		expect(sanitized.args).toEqual([
			'--api-key',
			'***MASKED***',
			'--token=***MASKED***',
			'--hub-url',
			'https://hub.example.com',
		]);
	});

	test('reprocesses sensitive flags that appear where a masked value was expected', () => {
		const sanitized = sanitizeCliCommandForLogging('coder start', [
			'--api-key',
			'--token',
			'secret_token',
			'--hub-url',
			'https://hub.example.com',
		]);

		expect(sanitized.command).toBe('coder start');
		expect(sanitized.args).toEqual([
			'--api-key',
			'***MASKED***',
			'--token',
			'***MASKED***',
			'--hub-url',
			'https://hub.example.com',
		]);
	});
});
