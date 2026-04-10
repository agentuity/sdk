import { test, expect } from '@playwright/test';

test.describe('Next.js + Agentuity', () => {
	test('should load the home page', async ({ page }) => {
		page.on('console', (msg) => console.log('BROWSER LOG:', msg.text()));
		page.on('pageerror', (err) => console.error('PAGE ERROR:', err));

		await page.goto('/');

		await expect(page.locator('h1')).toBeVisible();
		await expect(page.locator('h1')).toContainText('Next.js on Agentuity');
	});

	test('health API should return ok', async ({ request }) => {
		const res = await request.get('/api/health');
		expect(res.ok()).toBe(true);
		const body = await res.json();
		expect(body.status).toBe('ok');
	});
});
