import { test, expect } from '@playwright/test';

test.describe('TanStack Start + Agentuity', () => {
	test('should load the home page with translation UI', async ({ page }) => {
		page.on('console', (msg) => console.log('BROWSER LOG:', msg.text()));
		page.on('pageerror', (err) => console.error('PAGE ERROR:', err));

		await page.goto('/');

		await expect(page.locator('h1')).toBeVisible();
		await expect(page.locator('h1')).toContainText('AI Translation Demo');

		// Verify the translate form is rendered
		await expect(page.locator('#text-input')).toBeVisible();
		await expect(page.locator('#language-select')).toBeVisible();
		await expect(page.locator('button:has-text("Translate")')).toBeVisible();
	});

	test('should translate text via AI Gateway', async ({ page }) => {
		page.on('console', (msg) => console.log('BROWSER LOG:', msg.text()));
		page.on('pageerror', (err) => console.error('PAGE ERROR:', err));

		await page.goto('/');

		// Fill in text
		const input = page.locator('#text-input');
		await input.clear();
		await input.fill('Hello from Playwright!');

		// Select language
		await page.locator('#language-select').selectOption('French');

		// Click translate
		await page.locator('button:has-text("Translate")').click();

		// Wait for result
		const output = page.locator('.output');
		await expect(output).toBeVisible({ timeout: 30000 });

		// Verify translation result has content
		await expect(output).toContainText('Model:');
		await expect(output).toContainText('Tokens:');
	});

	test('should navigate to about page', async ({ page }) => {
		await page.goto('/');

		const aboutLink = page.locator('a[href="/about"]').first();
		await expect(aboutLink).toBeVisible();
		await aboutLink.click();

		await expect(page).toHaveURL('/about');
	});
});
