import { test, expect } from '@playwright/test';

test.describe('Workbench Dev Mode', () => {
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

	test('should invoke agent from workbench and get response', async ({ page }) => {
		page.on('console', (msg) => console.log('BROWSER LOG:', msg.text()));
		page.on('pageerror', (err) => console.error('PAGE ERROR:', err));

		await page.goto('/workbench');

		await expect(page.locator('h1')).toContainText('Workbench');

		const statusIndicator = page.locator('text=Connected');
		await expect(statusIndicator).toBeVisible({ timeout: 10000 });

		const agentSelector = page.locator('button:has-text("Select agent"), button:has-text("hello")');
		await expect(agentSelector).toBeVisible({ timeout: 10000 });
		await agentSelector.click();

		const helloAgentOption = page.locator('[role="option"]:has-text("hello")');
		await expect(helloAgentOption).toBeVisible({ timeout: 5000 });
		await helloAgentOption.click();

		await page.waitForTimeout(1000);

		const monacoEditor = page.locator('.monaco-editor');
		if (await monacoEditor.isVisible()) {
			await monacoEditor.click();
			await page.keyboard.type('{"name": "E2ETest"}');
		} else {
			const inputTextarea = page.locator('textarea[placeholder*="Enter"]');
			await expect(inputTextarea).toBeVisible({ timeout: 5000 });
			await inputTextarea.fill('{"name": "E2ETest"}');
		}

		const submitButton = page.locator('button[aria-label="Submit"]');
		await expect(submitButton).toBeVisible();
		await submitButton.click();

		const responseMessage = page.locator('text=Hello, E2ETest!');
		await expect(responseMessage).toBeVisible({ timeout: 15000 });
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
