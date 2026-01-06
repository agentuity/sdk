import { describe, test, expect, beforeEach } from 'bun:test';
import { getServiceUrls, resolveRegion } from '../src/config';

describe('resolveRegion', () => {
	beforeEach(() => {
		delete process.env.AGENTUITY_REGION;
	});

	test('should return provided region', () => {
		expect(resolveRegion('us-east')).toBe('us-east');
	});

	test('should fall back to AGENTUITY_REGION env var', () => {
		process.env.AGENTUITY_REGION = 'eu-west';
		expect(resolveRegion()).toBe('eu-west');
	});

	test('should prefer provided region over env var', () => {
		process.env.AGENTUITY_REGION = 'eu-west';
		expect(resolveRegion('us-east')).toBe('us-east');
	});

	test('should throw error if no region available', () => {
		expect(() => resolveRegion()).toThrow(
			'Region is required but not provided. Set the AGENTUITY_REGION environment variable or pass region as a parameter.'
		);
	});
});

describe('getServiceUrls', () => {
	beforeEach(() => {
		delete process.env.AGENTUITY_REGION;
		delete process.env.AGENTUITY_TRANSPORT_URL;
		delete process.env.AGENTUITY_KEYVALUE_URL;
		delete process.env.AGENTUITY_SANDBOX_URL;
		delete process.env.AGENTUITY_OBJECTSTORE_URL;
		delete process.env.AGENTUITY_STREAM_URL;
		delete process.env.AGENTUITY_VECTOR_URL;
		delete process.env.AGENTUITY_CATALYST_URL;
		delete process.env.AGENTUITY_OTLP_URL;
	});

	test('should throw error if no region provided and AGENTUITY_REGION not set', () => {
		expect(() => getServiceUrls()).toThrow(
			'Region is required but not provided. Set the AGENTUITY_REGION environment variable or pass region as a parameter.'
		);
	});

	test('should use AGENTUITY_REGION env var when region not passed', () => {
		process.env.AGENTUITY_REGION = 'us-west';
		const urls = getServiceUrls();
		expect(urls.catalyst).toBe('https://catalyst-us-west.agentuity.cloud');
		expect(urls.stream).toBe('https://streams-us-west.agentuity.cloud');
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
