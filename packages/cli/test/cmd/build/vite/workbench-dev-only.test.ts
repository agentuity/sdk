/**
 * Test that workbench is excluded from production builds
 * and uses implicit enablement (presence = enabled, absence = disabled)
 */
import { test, expect, describe } from 'bun:test';
import { getWorkbenchConfig } from '../../../../src/cmd/build/vite/config-loader';
import type { AgentuityConfig } from '../../../../src/types';

describe('Workbench Implicit Enablement', () => {
	test('workbench is enabled in dev mode when config.workbench is present', () => {
		const config: AgentuityConfig = {
			workbench: {
				route: '/workbench',
			},
		};

		const result = getWorkbenchConfig(config, true); // dev = true

		expect(result.enabled).toBe(true);
		expect(result.route).toBe('/workbench');
	});

	test('workbench is disabled in production even when config.workbench is present', () => {
		const config: AgentuityConfig = {
			workbench: {
				route: '/workbench',
			},
		};

		const result = getWorkbenchConfig(config, false); // dev = false (production)

		expect(result.enabled).toBe(false); // CRITICAL: must be false in production
	});

	test('workbench is enabled in dev when config.workbench is empty object', () => {
		const config: AgentuityConfig = {
			workbench: {}, // Empty object still counts as "present"
		};

		const devResult = getWorkbenchConfig(config, true);
		const prodResult = getWorkbenchConfig(config, false);

		expect(devResult.enabled).toBe(true); // Enabled in dev because workbench object exists
		expect(prodResult.enabled).toBe(false); // Never in production
	});

	test('workbench is disabled when config.workbench is omitted', () => {
		const config: AgentuityConfig = {
			// No workbench config
		};

		const devResult = getWorkbenchConfig(config, true);
		const prodResult = getWorkbenchConfig(config, false);

		// Disabled in both because workbench config is absent
		expect(devResult.enabled).toBe(false);
		expect(prodResult.enabled).toBe(false);
	});

	test('workbench is disabled when config is null', () => {
		const devResult = getWorkbenchConfig(null, true);
		const prodResult = getWorkbenchConfig(null, false);

		expect(devResult.enabled).toBe(false);
		expect(prodResult.enabled).toBe(false);
	});

	test('workbench uses default route when not specified', () => {
		const config: AgentuityConfig = {
			workbench: {}, // No route specified
		};

		const result = getWorkbenchConfig(config, true);

		expect(result.enabled).toBe(true); // Enabled because workbench present
		expect(result.route).toBe('/workbench'); // Default route
	});

	test('workbench respects custom route', () => {
		const config: AgentuityConfig = {
			workbench: {
				route: '/custom-workbench',
			},
		};

		const result = getWorkbenchConfig(config, true);

		expect(result.enabled).toBe(true);
		expect(result.route).toBe('/custom-workbench');
	});

	test('workbench respects custom headers', () => {
		const config: AgentuityConfig = {
			workbench: {
				headers: {
					'X-Custom-Header': 'value',
				},
			},
		};

		const result = getWorkbenchConfig(config, true);

		expect(result.enabled).toBe(true);
		expect(result.headers).toEqual({ 'X-Custom-Header': 'value' });
	});
});
