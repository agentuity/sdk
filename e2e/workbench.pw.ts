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

		// The agent selector button shows either "Select agent" or a previously selected agent name
		const agentSelector = page.locator(
			'button:has-text("Select agent"), button:has-text("hello"), button:has-text("counter")'
		);
		await expect(agentSelector).toBeVisible({ timeout: 10000 });

		await agentSelector.click();

		// Wait for the dropdown to be fully opened - cmdk uses data-state attribute
		await page.waitForSelector('[cmdk-list]', { timeout: 5000 });
		// Give animation time to settle
		await page.waitForTimeout(300);

		// Click with force to bypass animation stability checks
		const helloAgentOption = page.locator('[role="option"]:has-text("hello")');
		await expect(helloAgentOption).toBeVisible({ timeout: 5000 });
		await helloAgentOption.click({ force: true });

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

	test('should persist thread state across agent executions', async ({ page }) => {
		page.on('console', (msg) => console.log('BROWSER LOG:', msg.text()));
		page.on('pageerror', (err) => console.error('PAGE ERROR:', err));

		await page.goto('/workbench');

		await expect(page.locator('h1')).toContainText('Workbench');

		// Select the counter agent
		const agentSelector = page.locator(
			'button:has-text("Select agent"), button:has-text("counter"), button:has-text("hello")'
		);
		await expect(agentSelector).toBeVisible({ timeout: 10000 });
		await agentSelector.click();

		const counterAgentOption = page.locator('[role="option"]:has-text("counter")');
		await expect(counterAgentOption).toBeVisible({ timeout: 5000 });
		await counterAgentOption.click();

		await expect(page.locator('button:has-text("counter")')).toBeVisible();

		// Wait for the workbench to fetch agent metadata and render the input UI
		// Monaco editor needs schema data to render, which may take time in CI
		await page.waitForTimeout(2000);

		// Debug: Fetch metadata endpoint directly to see what's returned
		const metadataResponse = await page.evaluate(async () => {
			const res = await fetch('/_agentuity/workbench/metadata.json');
			return res.json();
		});
		console.log('DEBUG: Metadata response:', JSON.stringify(metadataResponse, null, 2));

		// Debug: Log what input UI is shown
		const hasMonaco = await page.locator('.monaco-editor').count();
		const hasNoInputSchema = await page.locator('text=This agent has no input schema').count();
		const hasTextarea = await page.locator('textarea').count();
		console.log(
			`DEBUG: Monaco count=${hasMonaco}, NoInputSchema count=${hasNoInputSchema}, Textarea count=${hasTextarea}`
		);

		// Take a screenshot for debugging
		await page.screenshot({ path: 'test-results/debug-before-monaco.png' });

		// Clear any existing thread state first
		const clearButton = page.locator('button:has-text("Clear Thread")');
		if (await clearButton.isVisible({ timeout: 2000 }).catch(() => false)) {
			await clearButton.click();
			await page.waitForTimeout(500);
		}

		// Wait for Monaco editor to load (has a specific class structure)
		// Increase timeout for CI environments where Monaco may be slower to initialize
		const monacoEditor = page.locator('.monaco-editor');
		await expect(monacoEditor).toBeVisible({ timeout: 20000 });

		// Helper function to type JSON into Monaco editor
		const typeInMonaco = async (json: string) => {
			// Click into the Monaco editor to focus it
			await monacoEditor.click();
			// Select all and delete existing content (use ControlOrMeta for cross-platform)
			await page.keyboard.press('ControlOrMeta+A');
			await page.keyboard.press('Backspace');
			// Type the new content
			await page.keyboard.type(json);
		};

		// Enter increment action and submit
		await typeInMonaco('{"action": "increment"}');

		// Submit the first request
		const submitButton = page.locator('button[aria-label="Submit"]');
		await expect(submitButton).toBeEnabled({ timeout: 5000 });
		await submitButton.click();

		// Wait for response - look for "count": 1 in the output section
		// Use first() to handle cases where text appears in multiple places
		await expect(page.getByText('"count": 1').first()).toBeVisible({ timeout: 15000 });

		// Enter increment action again
		await typeInMonaco('{"action": "increment"}');
		await expect(submitButton).toBeEnabled({ timeout: 5000 });
		await submitButton.click();

		// Wait for response - should now be count: 2 (state persisted)
		await expect(page.getByText('"count": 2').first()).toBeVisible({ timeout: 15000 });

		// Increment one more time to confirm
		await typeInMonaco('{"action": "increment"}');
		await expect(submitButton).toBeEnabled({ timeout: 5000 });
		await submitButton.click();

		// Should now be count: 3
		await expect(page.getByText('"count": 3').first()).toBeVisible({ timeout: 15000 });

		// Now test the Clear Thread functionality
		// Click the Clear Thread button to reset the agent's thread state
		await expect(clearButton).toBeVisible({ timeout: 5000 });
		await clearButton.click();

		// Wait for the clear to complete and UI to update
		await page.waitForTimeout(1000);

		// Increment again - should start fresh at count: 1
		await typeInMonaco('{"action": "increment"}');
		await expect(submitButton).toBeEnabled({ timeout: 5000 });
		await submitButton.click();

		// After clearing, the count should reset to 1
		// Wait for any visible element with "count": 1
		await page.waitForSelector('text="count": 1', { state: 'visible', timeout: 15000 });
	});
});
