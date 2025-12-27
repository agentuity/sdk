import { describe, test, expect, beforeEach } from 'bun:test';
import { getServiceUrls } from '../src/config';

describe('getServiceUrls', () => {
	beforeEach(() => {
		delete process.env.AGENTUITY_TRANSPORT_URL;
		delete process.env.AGENTUITY_KEYVALUE_URL;
		delete process.env.AGENTUITY_SANDBOX_URL;
		delete process.env.AGENTUITY_OBJECTSTORE_URL;
		delete process.env.AGENTUITY_STREAM_URL;
		delete process.env.AGENTUITY_VECTOR_URL;
	});

	test('should build URLs for us-east region', () => {
		const urls = getServiceUrls('us-east');
		expect(urls.catalyst).toBe('https://catalyst-us-east.agentuity.cloud');
		expect(urls.keyvalue).toBe('https://catalyst-us-east.agentuity.cloud');
		expect(urls.stream).toBe('https://streams-us-east.agentuity.cloud');
	});

	test('should use agentuity.io for local region', () => {
		const urls = getServiceUrls('local');
		expect(urls.catalyst).toBe('https://catalyst.agentuity.io');
		expect(urls.stream).toBe('https://streams.agentuity.io');
	});

	test('should override with AGENTUITY_TRANSPORT_URL', () => {
		process.env.AGENTUITY_TRANSPORT_URL = 'https://custom-transport.example.com';
		const urls = getServiceUrls('us-east');

		expect(urls.catalyst).toBe('https://custom-transport.example.com');
		expect(urls.keyvalue).toBe('https://custom-transport.example.com');
	});

	test('should override individual service URLs', () => {
		process.env.AGENTUITY_SANDBOX_URL = 'https://custom-sandbox.example.com';
		process.env.AGENTUITY_KEYVALUE_URL = 'https://custom-kv.example.com';
		const urls = getServiceUrls('us-east');

		expect(urls.keyvalue).toBe('https://custom-kv.example.com');
		expect(urls.catalyst).toBe('https://catalyst-us-east.agentuity.cloud');
		expect(urls.sandbox).toBe('https://custom-sandbox.example.com');
	});
});
