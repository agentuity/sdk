import { test, expect } from '@playwright/test';

test.describe('Basic Web UI', () => {
	test('should load homepage, enter text, click button, and validate output', async ({
		page,
	}) => {
		// Set up console logging
		page.on('console', (msg) => console.log('BROWSER LOG:', msg.text()));
		page.on('pageerror', (err) => console.error('PAGE ERROR:', err));

		// Navigate to the application
		await page.goto('/');

		// Wait for the page to load
		await expect(page.locator('h1')).toContainText('Welcome to Agentuity');

		// Find the input field and enter text
		const input = page.locator('input[type="text"]');
		await expect(input).toBeVisible();
		await input.fill('Playwright');

		// Find and click the "Say Hello" button
		const button = page.locator('button:has-text("Say Hello")');
		await expect(button).toBeVisible();
		await button.click();

		// Wait for the output to appear and update
		const output = page.locator('.output');
		await expect(output).toBeVisible();

		// Wait for the loading state to complete
		await expect(output).not.toHaveAttribute('data-loading', 'true', { timeout: 10000 });

		// Validate the output contains the expected greeting
		await expect(output).toContainText('Hello, Playwright!');

		// Ensure the output is not in loading state
		await expect(output).toHaveAttribute('data-loading', 'false');
	});
});
