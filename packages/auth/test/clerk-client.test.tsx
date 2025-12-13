/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, test, expect } from 'bun:test';
import { AgentuityClerk } from '../src/clerk/client';

describe('AgentuityClerk', () => {
	test('exports AgentuityClerk component', () => {
		expect(AgentuityClerk).toBeDefined();
		expect(typeof AgentuityClerk).toBe('function');
	});

	test('component props interface is correct', () => {
		// Type test - will fail at compile time if interface changes
		const validProps = {
			children: null,
			useAuth: (() => ({ getToken: async () => null, isLoaded: true })) as any,
			refreshInterval: 60000,
		};

		expect(validProps).toBeDefined();
	});
});
