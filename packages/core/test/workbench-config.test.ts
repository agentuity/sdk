import { describe, test, expect } from 'bun:test';
import {
	encodeWorkbenchConfig,
	decodeWorkbenchConfig,
	getWorkbenchConfig,
	WorkbenchConfigError,
	WorkbenchNotFoundError,
	type WorkbenchConfig,
} from '../src/workbench-config';

describe('encodeWorkbenchConfig', () => {
	test('should encode a simple config', () => {
		const config: WorkbenchConfig = {
			route: '/api/test',
			port: 3000,
		};
		const encoded = encodeWorkbenchConfig(config);
		expect(encoded).toBe(Buffer.from(JSON.stringify(config)).toString('base64'));
	});

	test('should encode config with all fields', () => {
		const config: WorkbenchConfig = {
			route: '/api/agent',
			headers: {
				'X-Custom': 'value',
				Authorization: 'Bearer token',
			},
			port: 8080,
			apiKey: 'test-key-123',
		};
		const encoded = encodeWorkbenchConfig(config);
		const decoded = JSON.parse(Buffer.from(encoded, 'base64').toString());
		expect(decoded).toEqual(config);
	});

	test('should encode empty config', () => {
		const config: WorkbenchConfig = {};
		const encoded = encodeWorkbenchConfig(config);
		expect(encoded).toBe(Buffer.from('{}').toString('base64'));
	});

	test('should encode config with only route', () => {
		const config: WorkbenchConfig = { route: '/test' };
		const encoded = encodeWorkbenchConfig(config);
		const decoded = JSON.parse(Buffer.from(encoded, 'base64').toString());
		expect(decoded).toEqual(config);
	});

	test('should encode config with only headers', () => {
		const config: WorkbenchConfig = {
			headers: { 'X-Test': 'value' },
		};
		const encoded = encodeWorkbenchConfig(config);
		const decoded = JSON.parse(Buffer.from(encoded, 'base64').toString());
		expect(decoded).toEqual(config);
	});

	test('should handle special characters in values', () => {
		const config: WorkbenchConfig = {
			route: '/api/test?query=value&other=123',
			headers: {
				'X-Special': 'value with spaces & symbols!@#',
			},
			apiKey: 'key-with-dashes_and_underscores',
		};
		const encoded = encodeWorkbenchConfig(config);
		const decoded = JSON.parse(Buffer.from(encoded, 'base64').toString());
		expect(decoded).toEqual(config);
	});
});

describe('decodeWorkbenchConfig', () => {
	test('should decode a simple config', () => {
		const config: WorkbenchConfig = {
			route: '/api/test',
			port: 3000,
		};
		const encoded = Buffer.from(JSON.stringify(config)).toString('base64');
		const decoded = decodeWorkbenchConfig(encoded);
		expect(decoded).toEqual(config);
	});

	test('should decode config with all fields', () => {
		const config: WorkbenchConfig = {
			route: '/api/agent',
			headers: {
				'X-Custom': 'value',
				Authorization: 'Bearer token',
			},
			port: 8080,
			apiKey: 'test-key-123',
		};
		const encoded = Buffer.from(JSON.stringify(config)).toString('base64');
		const decoded = decodeWorkbenchConfig(encoded);
		expect(decoded).toEqual(config);
	});

	test('should decode empty config', () => {
		const encoded = Buffer.from('{}').toString('base64');
		const decoded = decodeWorkbenchConfig(encoded);
		expect(decoded).toEqual({});
	});

	test('should throw WorkbenchConfigError for invalid base64', () => {
		expect(() => decodeWorkbenchConfig('not-valid-base64!!!')).toThrow(WorkbenchConfigError);
	});

	test('should throw WorkbenchConfigError for invalid JSON', () => {
		const invalidJson = Buffer.from('not valid json').toString('base64');
		expect(() => decodeWorkbenchConfig(invalidJson)).toThrow(WorkbenchConfigError);
	});

	test('should decode non-object JSON without validation', () => {
		// Note: decodeWorkbenchConfig doesn't validate the shape, just decodes
		const arrayJson = Buffer.from('[1, 2, 3]').toString('base64');
		const result = decodeWorkbenchConfig(arrayJson) as unknown;
		expect(result).toEqual([1, 2, 3]);
	});

	test('should decode null JSON', () => {
		const nullJson = Buffer.from('null').toString('base64');
		const result = decodeWorkbenchConfig(nullJson) as unknown;
		expect(result).toBeNull();
	});

	test('should decode string JSON', () => {
		const stringJson = Buffer.from('"just a string"').toString('base64');
		const result = decodeWorkbenchConfig(stringJson) as unknown;
		expect(result).toBe('just a string');
	});

	test('should round-trip encode/decode', () => {
		const configs: WorkbenchConfig[] = [
			{ route: '/test' },
			{ port: 3000 },
			{ apiKey: 'key123' },
			{ headers: { 'X-Test': 'value' } },
			{
				route: '/api/agent',
				headers: { 'X-Custom': 'value' },
				port: 8080,
				apiKey: 'test-key',
			},
		];

		configs.forEach((config) => {
			const encoded = encodeWorkbenchConfig(config);
			const decoded = decodeWorkbenchConfig(encoded);
			expect(decoded).toEqual(config);
		});
	});
});

describe('getWorkbenchConfig', () => {
	test('should throw WorkbenchNotFoundError when AGENTUITY_WORKBENCH_CONFIG_INLINE is not defined', () => {
		// Note: getWorkbenchConfig relies on AGENTUITY_WORKBENCH_CONFIG_INLINE being replaced at build time
		// In tests, this variable is not defined, so it should always throw
		expect(() => getWorkbenchConfig()).toThrow(WorkbenchNotFoundError);
	});
});

describe('WorkbenchConfigError', () => {
	test('should create error', () => {
		const error = new WorkbenchConfigError();
		expect(error.name).toBe('WorkbenchConfigError');
		expect(error instanceof Error).toBe(true);
	});

	test('should be instance of Error', () => {
		const error = new WorkbenchConfigError();
		expect(error instanceof Error).toBe(true);
	});
});

describe('WorkbenchNotFoundError', () => {
	test('should create error', () => {
		const error = new WorkbenchNotFoundError();
		expect(error.name).toBe('WorkbenchNotFoundError');
		expect(error instanceof Error).toBe(true);
	});

	test('should be instance of Error', () => {
		const error = new WorkbenchNotFoundError();
		expect(error instanceof Error).toBe(true);
	});
});
