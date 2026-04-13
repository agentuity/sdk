import { test, expect } from '@playwright/test';

test.describe('TanStack Start + Agentuity', () => {
	test('should load the home page with translation UI', async ({ page }) => {
		page.on('console', (msg) => console.log('BROWSER LOG:', msg.text()));
		page.on('pageerror', (err) => console.error('PAGE ERROR:', err));

		await page.goto('/');

		await expect(page.locator('h1')).toBeVisible();
		await expect(page.locator('h1')).toContainText('Welcome to Agentuity');

		// Verify the translate form is rendered
		await expect(page.locator('textarea')).toBeVisible();
		await expect(page.locator('select').first()).toBeVisible();
		await expect(page.locator('button:has-text("Translate")')).toBeVisible();
	});

	test('should translate text via AI Gateway', async ({ page }) => {
		page.on('console', (msg) => console.log('BROWSER LOG:', msg.text()));
		page.on('pageerror', (err) => console.error('PAGE ERROR:', err));

		await page.goto('/');

		// Fill in text
		const input = page.locator('textarea');
		await input.clear();
		await input.fill('Hello from Playwright!');

		// Select language
		await page.locator('select').first().selectOption('French');

		// Click translate
		await page.locator('button:has-text("Translate")').click();

		// Wait for result — the output div with translation text
		const output = page.locator('.output');
		await expect(output).toBeVisible({ timeout: 30000 });

		// Verify translation result has content (tokens/model info shown below)
		await expect(page.locator('text=Model')).toBeVisible({ timeout: 30000 });
		await expect(page.locator('text=Language')).toBeVisible();
	});

	test('should navigate to about page', async ({ page }) => {
		await page.goto('/about');

		await expect(page.locator('h1')).toContainText('About');
		await expect(page.locator('a[href="/"]')).toBeVisible();

		await page.locator('a[href="/"]').click();
		await expect(page).toHaveURL('/');
		await expect(page.locator('h1')).toContainText('Welcome to Agentuity');
	});
});
