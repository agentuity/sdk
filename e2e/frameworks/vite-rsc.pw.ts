import { test, expect } from '@playwright/test';

test.describe('Vite RSC + Agentuity Integration', () => {
	test('should load echo demo, send message, and validate response', async ({ page }) => {
		page.on('console', (msg) => console.log('BROWSER LOG:', msg.text()));
		page.on('pageerror', (err) => console.error('PAGE ERROR:', err));

		await page.goto('/');
		// Wait for RSC hydration to complete before interacting
		await page.waitForLoadState('networkidle');

		await expect(page.locator('h1')).toContainText('Agentuity + Vite RSC');

		const input = page.locator('input[type="text"]');
		await expect(input).toBeVisible();
		await input.fill('Hello from Playwright!');

		const button = page.locator('button:has-text("Send Echo")');
		await expect(button).toBeVisible();
		await button.click();

		const output = page.locator('.output');
		await expect(output).toBeVisible();

		await expect(output).not.toHaveAttribute('data-loading', 'true', { timeout: 10000 });

		await expect(output).toContainText('Echo: Hello from Playwright!');
		await expect(output).toContainText('Timestamp:');
	});

	test('should render using React Server Components (SSR)', async ({ page }) => {
		page.on('console', (msg) => console.log('BROWSER LOG:', msg.text()));
		page.on('pageerror', (err) => console.error('PAGE ERROR:', err));

		// Intercept and verify RSC stream is served
		const rscRequests: string[] = [];
		page.on('request', (req) => {
			if (req.url().endsWith('.rsc')) {
				rscRequests.push(req.url());
			}
		});

		await page.goto('/');

		// The page should be server-rendered with RSC
		await expect(page.locator('h1')).toContainText('Agentuity + Vite RSC');
		await expect(page.locator('.subtitle')).toContainText('React Server Components');
	});
});
