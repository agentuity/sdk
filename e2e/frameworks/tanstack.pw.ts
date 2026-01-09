import { test, expect } from '@playwright/test';

test.describe('TanStack Start + Agentuity Integration', () => {
	test('should load echo demo, send message, and validate response', async ({ page }) => {
		page.on('console', (msg) => console.log('BROWSER LOG:', msg.text()));
		page.on('pageerror', (err) => console.error('PAGE ERROR:', err));

		await page.goto('/');

		await expect(page.locator('h1')).toContainText('Agentuity + TanStack');

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
});
