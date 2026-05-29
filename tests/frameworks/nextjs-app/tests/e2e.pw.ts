import { expect, test } from '@playwright/test';

interface TranslationResponse {
	ok(): boolean;
	text(): Promise<string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

async function readTranslation(response: TranslationResponse): Promise<string> {
	const responseText = await response.text();
	expect(response.ok(), responseText).toBe(true);

	const body: unknown = JSON.parse(responseText);
	expect(isRecord(body)).toBe(true);
	if (!isRecord(body)) throw new Error('Translation response body was not an object');

	const translation = body.translation;
	expect(typeof translation).toBe('string');
	if (typeof translation !== 'string') throw new Error('Translation response was missing text');
	expect(translation.trim().length).toBeGreaterThan(0);

	return translation;
}

test.describe('Next.js + Agentuity', () => {
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

	test('should translate text via AI Gateway', async ({ request }) => {
		const response = await request.post('/api/translate', {
			data: {
				text: 'Hello from Playwright!',
				toLanguage: 'French',
				model: 'openai/gpt-4o-mini',
			},
			timeout: 60000,
		});
		await readTranslation(response);
	});

	test('should navigate to about page', async ({ page }) => {
		await page.goto('/about');

		await expect(page.locator('h1')).toContainText('About');
		await expect(page.locator('a[href="/"]')).toBeVisible();

		await page.locator('a[href="/"]').click();
		await expect(page).toHaveURL('/');
		await expect(page.locator('h1')).toContainText('Welcome to Agentuity');
	});

	test('health API should return ok', async ({ request }) => {
		const res = await request.get('/api/health');
		expect(res.ok()).toBe(true);
		const body = await res.json();
		expect(body.status).toBe('ok');
	});
});
