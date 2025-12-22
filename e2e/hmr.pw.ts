import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const APP_PATH = join(process.cwd(), 'apps/testing/e2e-web');
const APP_TSX_PATH = join(APP_PATH, 'src/web/App.tsx');

test.describe('Hot Module Replacement (HMR)', () => {
	let originalAppTsx: string;

	test.beforeAll(async () => {
		originalAppTsx = await readFile(APP_TSX_PATH, 'utf-8');
	});

	test.afterEach(async () => {
		await writeFile(APP_TSX_PATH, originalAppTsx);
	});

	test.afterAll(async () => {
		await writeFile(APP_TSX_PATH, originalAppTsx);
	});

	test('should support HMR for frontend changes', async ({ page }) => {
		page.on('console', (msg) => console.log('BROWSER:', msg.text()));
		page.on('pageerror', (err) => console.error('PAGE ERROR:', err));

		await page.goto('/');
		await expect(page.locator('h1')).toContainText('Welcome to Agentuity');

		// Give initial page time to fully load
		await page.waitForTimeout(500);

		// Step 1: Make first title change
		console.log('Step 1: Changing title to "HMR Test v1"');
		let content = await readFile(APP_TSX_PATH, 'utf-8');
		content = content.replace('Welcome to Agentuity', 'HMR Test v1');
		await writeFile(APP_TSX_PATH, content);

		// Wait for HMR to apply
		await page.waitForTimeout(1000);
		await expect(page.locator('h1')).toContainText('HMR Test v1', { timeout: 5000 });
		console.log('✓ Title changed to v1 via HMR');

		// Step 2: Make second title change
		console.log('Step 2: Changing title to "HMR Test v2"');
		content = await readFile(APP_TSX_PATH, 'utf-8');
		content = content.replace('HMR Test v1', 'HMR Test v2');
		await writeFile(APP_TSX_PATH, content);

		await page.waitForTimeout(1000);
		await expect(page.locator('h1')).toContainText('HMR Test v2', { timeout: 5000 });
		console.log('✓ Title changed to v2 via HMR');

		// Step 3: Test API functionality before change
		console.log('Step 3: Testing API before change');
		const input = page.locator('input[type="text"]');
		await input.fill('Alice');
		const button = page.locator('button:has-text("Say Hello")');
		await button.click();

		const output = page.locator('.output');
		await expect(output).not.toHaveAttribute('data-loading', 'true', { timeout: 5000 });
		await expect(output).toContainText('Hello, Alice!');
		console.log('✓ API works before change');

		// Step 4: Make third title change
		console.log('Step 4: Changing title to "HMR Test v3"');
		content = await readFile(APP_TSX_PATH, 'utf-8');
		content = content.replace('HMR Test v2', 'HMR Test v3');
		await writeFile(APP_TSX_PATH, content);

		await page.waitForTimeout(1000);
		await expect(page.locator('h1')).toContainText('HMR Test v3', { timeout: 5000 });
		console.log('✓ Title changed to v3 via HMR');

		// Step 5: Verify original API still works after multiple HMR updates
		console.log('Step 5: Verifying API still works after HMR');
		await input.fill('Charlie');
		await button.click();

		await expect(output).not.toHaveAttribute('data-loading', 'true', { timeout: 5000 });
		await expect(output).toContainText('Hello, Charlie!');
		console.log('✓ Full HMR cycle complete - frontend HMR works correctly');
	});
});
