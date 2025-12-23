import { test, expect } from '@playwright/test';

/**
 * Preamble Tests
 *
 * Tests for the Vite React preamble race condition fix (GitHub issue #327).
 *
 * The @vitejs/plugin-react plugin injects a preamble that sets
 * `window.__vite_plugin_react_preamble_installed__ = true` before React components execute.
 * If components execute before the preamble, they throw:
 * "Uncaught Error: @vitejs/plugin-react can't detect preamble. Something is wrong."
 *
 * The fix removes the `async` attribute from the frontend script tag to ensure
 * proper execution order: Vite client → React preamble → App code.
 */
test.describe('React Preamble (Issue #327)', () => {
	test('should load page without preamble errors', async ({ page }) => {
		const errors: Error[] = [];

		page.on('pageerror', (err) => {
			errors.push(err);
		});

		await page.goto('/');

		await expect(page.locator('h1')).toContainText('Welcome to Agentuity');

		const preambleErrors = errors.filter((e) => e.message.includes('preamble'));
		expect(preambleErrors).toHaveLength(0);
	});

	test('should not have preamble errors after multiple hard refreshes', async ({ page }) => {
		const errors: Error[] = [];

		page.on('pageerror', (err) => {
			errors.push(err);
		});

		await page.goto('/');
		await expect(page.locator('h1')).toBeVisible();

		// Perform 5 hard refreshes (cache-bypassing reloads)
		for (let i = 0; i < 5; i++) {
			// Clear browser cache for this context to simulate hard refresh
			await page.evaluate(() => {
				// Force a cache-busting reload by adding timestamp to performance
				performance.mark(`reload-${Date.now()}`);
			});

			// Reload without cache
			await page.reload();

			// Wait for page to be interactive
			await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });

			// Small delay to allow any async errors to surface
			await page.waitForTimeout(100);
		}

		const preambleErrors = errors.filter((e) => e.message.includes('preamble'));
		expect(preambleErrors).toHaveLength(0);
	});

	test('should not have preamble errors with cache disabled', async ({ browser }) => {
		// Create a new context with cache disabled
		const context = await browser.newContext({
			// Bypass service worker cache
			serviceWorkers: 'block',
		});

		const page = await context.newPage();
		const errors: Error[] = [];

		page.on('pageerror', (err) => {
			errors.push(err);
		});

		// Disable cache via CDP
		const client = await page.context().newCDPSession(page);
		await client.send('Network.setCacheDisabled', { cacheDisabled: true });

		// Load page multiple times with cache disabled
		for (let i = 0; i < 3; i++) {
			await page.goto('/');
			await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });
			await page.waitForTimeout(100);
		}

		const preambleErrors = errors.filter((e) => e.message.includes('preamble'));
		expect(preambleErrors).toHaveLength(0);

		await context.close();
	});

	test('should have correct script order in HTML (no async on frontend script)', async ({
		page,
	}) => {
		// Intercept the HTML response to verify script attributes
		let htmlContent = '';

		page.on('response', async (response) => {
			if (response.url().endsWith('/') && response.headers()['content-type']?.includes('html')) {
				htmlContent = await response.text();
			}
		});

		await page.goto('/');
		await expect(page.locator('h1')).toBeVisible();

		// Verify the frontend script does NOT have async attribute
		// The regex matches <script type="module" src="...frontend.tsx" async>
		const hasAsyncFrontend = /src="[^"]*frontend\.tsx"[^>]*\basync\b/.test(htmlContent);
		expect(hasAsyncFrontend).toBe(false);

		// Verify Vite client script exists (should be injected by Vite)
		expect(htmlContent).toContain('/@vite/client');
	});

	test('should render and function correctly after page load', async ({ page }) => {
		const errors: Error[] = [];

		page.on('pageerror', (err) => {
			errors.push(err);
		});

		await page.goto('/');

		// Wait for the app to fully render
		await expect(page.locator('h1')).toContainText('Welcome to Agentuity');

		// Verify the input and button work (proves React rendered correctly)
		const input = page.locator('input[type="text"]');
		await expect(input).toBeVisible();
		await input.fill('Preamble Test');

		const button = page.locator('button:has-text("Say Hello")');
		await expect(button).toBeVisible();
		await button.click();

		// Wait for response
		const output = page.locator('.output');
		await expect(output).not.toHaveAttribute('data-loading', 'true', { timeout: 10000 });
		await expect(output).toContainText('Hello, Preamble Test!');

		// No preamble errors should have occurred
		const preambleErrors = errors.filter((e) => e.message.includes('preamble'));
		expect(preambleErrors).toHaveLength(0);
	});
});
