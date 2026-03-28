/**
 * Test that workbench is excluded from production builds
 * and uses config from createApp() in app.ts (v2 approach)
 */
import { test, expect, describe } from 'bun:test';
import { getWorkbenchConfig } from '../../../../src/cmd/build/vite/config-loader';
import type { ExtractedAppConfig } from '../../../../src/cmd/build/app-config-extractor';

describe('Workbench Config (v2)', () => {
	test('workbench is enabled in dev mode when workbench is in createApp()', () => {
		const runtimeConfig: ExtractedAppConfig = {
			workbench: {
				route: '/workbench',
			},
		};

		const result = getWorkbenchConfig(true, runtimeConfig); // dev = true

		expect(result.enabled).toBe(true);
		expect(result.route).toBe('/workbench');
	});

	test('workbench is disabled in production even when workbench is in createApp()', () => {
		const runtimeConfig: ExtractedAppConfig = {
			workbench: {
				route: '/workbench',
			},
		};

		const result = getWorkbenchConfig(false, runtimeConfig); // dev = false (production)

		expect(result.enabled).toBe(false); // CRITICAL: must be false in production
	});

	test('workbench is enabled in dev when workbench is boolean true', () => {
		const runtimeConfig: ExtractedAppConfig = {
			workbench: true,
		};

		const devResult = getWorkbenchConfig(true, runtimeConfig);
		const prodResult = getWorkbenchConfig(false, runtimeConfig);

		expect(devResult.enabled).toBe(true);
		expect(prodResult.enabled).toBe(false);
	});

	test('workbench is enabled in dev when workbench is string route', () => {
		const runtimeConfig: ExtractedAppConfig = {
			workbench: '/custom-workbench',
		};

		const result = getWorkbenchConfig(true, runtimeConfig);

		expect(result.enabled).toBe(true);
		expect(result.route).toBe('/custom-workbench');
	});

	test('workbench is disabled when not in createApp()', () => {
		const runtimeConfig: ExtractedAppConfig = {
			// No workbench config
		};

		const devResult = getWorkbenchConfig(true, runtimeConfig);
		const prodResult = getWorkbenchConfig(false, runtimeConfig);

		// Disabled in both because workbench config is absent
		expect(devResult.enabled).toBe(false);
		expect(prodResult.enabled).toBe(false);
	});

	test('workbench is disabled when runtimeConfig is undefined', () => {
		const devResult = getWorkbenchConfig(true, undefined);
		const prodResult = getWorkbenchConfig(false, undefined);

		expect(devResult.enabled).toBe(false);
		expect(prodResult.enabled).toBe(false);
	});

	test('workbench uses default route when workbench is empty object', () => {
		const runtimeConfig: ExtractedAppConfig = {
			workbench: {}, // No route specified
		};

		const result = getWorkbenchConfig(true, runtimeConfig);

		expect(result.enabled).toBe(true);
		expect(result.route).toBe('/workbench'); // Default route
	});

	test('workbench respects custom route in object', () => {
		const runtimeConfig: ExtractedAppConfig = {
			workbench: {
				route: '/custom-workbench',
			},
		};

		const result = getWorkbenchConfig(true, runtimeConfig);

		expect(result.enabled).toBe(true);
		expect(result.route).toBe('/custom-workbench');
	});

	test('workbench respects custom headers', () => {
		const runtimeConfig: ExtractedAppConfig = {
			workbench: {
				headers: {
					'X-Custom-Header': 'value',
				},
			},
		};

		const result = getWorkbenchConfig(true, runtimeConfig);

		expect(result.enabled).toBe(true);
		expect(result.headers).toEqual({ 'X-Custom-Header': 'value' });
	});
});
