import { test, expect } from '@playwright/test';

test.describe('TanStack Start + Agentuity', () => {
	test('should load the home page', async ({ page }) => {
		page.on('console', (msg) => console.log('BROWSER LOG:', msg.text()));
		page.on('pageerror', (err) => console.error('PAGE ERROR:', err));

		await page.goto('/');

		await expect(page.locator('h1')).toBeVisible();
		await expect(page.locator('h1')).toContainText('Start simple');
	});

	test('should navigate to about page', async ({ page }) => {
		await page.goto('/');

		const aboutLink = page.locator('a[href="/about"]').first();
		await expect(aboutLink).toBeVisible();
		await aboutLink.click();

		await expect(page).toHaveURL('/about');
	});
});
