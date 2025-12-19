import { describe, test, expect } from 'bun:test';
import { setGlobalBaseUrl, getGlobalBaseUrl } from '../src/client';

describe('React createClient', () => {
	describe('Global baseUrl helpers', () => {
		test('should set and get global baseUrl', () => {
			setGlobalBaseUrl('https://test.example.com');
			expect(getGlobalBaseUrl()).toBe('https://test.example.com');
		});

		test('should fallback to window.location.origin when not set', () => {
			setGlobalBaseUrl('');
			const result = getGlobalBaseUrl();
			expect(result).toBeDefined();
		});

		test('should update when set multiple times', () => {
			setGlobalBaseUrl('https://v1.example.com');
			expect(getGlobalBaseUrl()).toBe('https://v1.example.com');

			setGlobalBaseUrl('https://v2.example.com');
			expect(getGlobalBaseUrl()).toBe('https://v2.example.com');
		});
	});
});
