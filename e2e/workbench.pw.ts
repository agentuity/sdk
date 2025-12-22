import { test, expect } from '@playwright/test';

// Configure workbench tests to run serially and with longer timeout for stability
test.describe.configure({ mode: 'serial', timeout: 60000 });

test.describe('Workbench Dev Mode', () => {
	// Wait for server stability before running workbench tests
	test.beforeAll(async ({ browser }) => {
		// Quick health check to ensure server is ready
		const context = await browser.newContext();
		const page = await context.newPage();
		let retries = 5;
		while (retries > 0) {
			try {
				const response = await page.goto('http://localhost:3500/', { timeout: 5000 });
				if (response?.ok()) break;
			} catch {
				// Server might not be ready yet
			}
			await page.waitForTimeout(1000);
			retries--;
		}
		await context.close();
	});

	test('should load workbench page and render correctly', async ({ page }) => {
		page.on('console', (msg) => console.log('BROWSER LOG:', msg.text()));
		page.on('pageerror', (err) => console.error('PAGE ERROR:', err));

		await page.goto('/workbench');

		await expect(page.locator('h1')).toContainText('Workbench');

		const statusIndicator = page.locator('text=Connected');
		await expect(statusIndicator).toBeVisible({ timeout: 10000 });
	});

	test('should show agent selector with hello agent', async ({ page }) => {
		page.on('console', (msg) => console.log('BROWSER LOG:', msg.text()));
		page.on('pageerror', (err) => console.error('PAGE ERROR:', err));

		await page.goto('/workbench');

		await expect(page.locator('h1')).toContainText('Workbench');

		const agentSelector = page.locator('button:has-text("Select agent"), button:has-text("hello")');
		await expect(agentSelector).toBeVisible({ timeout: 10000 });

		await agentSelector.click();

		const helloAgentOption = page.locator('[role="option"]:has-text("hello")');
		await expect(helloAgentOption).toBeVisible({ timeout: 5000 });

		await helloAgentOption.click();

		await expect(page.locator('button:has-text("hello")')).toBeVisible();
	});

	test('should toggle schema panel', async ({ page }) => {
		page.on('console', (msg) => console.log('BROWSER LOG:', msg.text()));
		page.on('pageerror', (err) => console.error('PAGE ERROR:', err));

		await page.goto('/workbench');

		await expect(page.locator('h1')).toContainText('Workbench');

		const schemaButton = page.locator('button:has-text("Schema")');
		await expect(schemaButton).toBeVisible({ timeout: 10000 });

		await schemaButton.click();

		const schemaPanel = page.locator('h2:has-text("Schema")');
		await expect(schemaPanel).toBeVisible({ timeout: 5000 });

		const closeButton = page.locator('button:has(svg.lucide-x)');
		await closeButton.click();

		await expect(schemaPanel).not.toBeVisible({ timeout: 5000 });
	});
});
