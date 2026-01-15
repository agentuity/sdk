import { test, expect } from '@playwright/test';

test.describe('Analytics Beacon', () => {
	test('analytics scripts are injected into HTML', async ({ page }) => {
		await page.goto('/');

		// Verify analytics config script is present
		const configScript = await page.evaluate(() => {
			return typeof window.__AGENTUITY_ANALYTICS__ !== 'undefined';
		});
		expect(configScript).toBe(true);

		// Verify config has expected properties
		const config = await page.evaluate(() => window.__AGENTUITY_ANALYTICS__);
		expect(config).toBeDefined();
		expect(config!.enabled).toBe(true);
		expect(typeof config!.trackClicks).toBe('boolean');
		expect(typeof config!.isDevmode).toBe('boolean');
	});

	test('beacon script tag exists in page', async ({ page }) => {
		await page.goto('/');

		// Get all script tags and check for analytics-related ones
		const scripts = await page.evaluate(() => {
			const scriptTags = Array.from(document.querySelectorAll('script'));
			return scriptTags.map((s) => ({
				src: s.getAttribute('src'),
				hasBeaconMarker: s.hasAttribute('data-agentuity-beacon'),
			}));
		});

		// In dev mode: /_agentuity/webanalytics/analytics.js
		// In prod mode: data-agentuity-beacon attribute with CDN URL
		const hasDevBeacon = scripts.some((s) => s.src?.includes('analytics.js'));
		const hasProdBeacon = scripts.some((s) => s.hasBeaconMarker);

		expect(hasDevBeacon || hasProdBeacon).toBe(true);
	});

	test('session script is loaded async', async ({ page }) => {
		await page.goto('/');

		// Verify session.js script exists and has async attribute
		const sessionScript = await page.evaluate(() => {
			const scripts = Array.from(document.querySelectorAll('script'));
			const script = scripts.find((s) => s.getAttribute('src')?.includes('session.js'));
			if (!script) return null;
			return {
				exists: true,
				async: script.async === true || script.hasAttribute('async'),
			};
		});

		expect(sessionScript).not.toBeNull();
		expect(sessionScript?.async).toBe(true);
	});

	test('analytics test page loads and runs tests', async ({ page }) => {
		// Navigate to the dedicated analytics test page
		await page.goto('/analytics');

		// Wait for test results to appear
		await page.waitForSelector('text=Test Results', { timeout: 5000 });

		// Wait for tests to complete (they auto-run after 1 second + execution time)
		await page.waitForTimeout(3000);

		// Get test results - look for the summary counts
		const summary = await page.evaluate(() => {
			const text = document.body.innerText;
			const passMatch = text.match(/(\d+) passed/);
			const failMatch = text.match(/(\d+) failed/);
			return {
				passed: passMatch ? parseInt(passMatch[1]) : 0,
				failed: failMatch ? parseInt(failMatch[1]) : 0,
			};
		});

		// At minimum, config injection and enabled checks should pass
		expect(summary.passed).toBeGreaterThanOrEqual(3);

		// Log results for debugging
		console.log(`Analytics test page results: ${summary.passed} passed, ${summary.failed} failed`);
	});
});

// TypeScript declarations for window globals
declare global {
	interface Window {
		__AGENTUITY_ANALYTICS__?: {
			enabled: boolean;
			trackClicks: boolean;
			trackScroll: boolean;
			trackWebVitals: boolean;
			trackErrors: boolean;
			trackSPANavigation: boolean;
			orgId?: string;
			projectId?: string;
			isDevmode?: boolean;
		};
		agentuityAnalytics?: {
			track: (event: string, properties?: Record<string, unknown>) => void;
			flush: () => void;
		};
	}
}
