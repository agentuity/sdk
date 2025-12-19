import { test, expect } from '@playwright/test';

test.describe('WebSocket & EventStream', () => {
	test('should connect to WebSocket and echo messages', async ({ page }) => {
		// Set up console logging
		const errors: string[] = [];
		page.on('console', (msg) => console.log('BROWSER LOG:', msg.text()));
		page.on('pageerror', (err) => {
			console.error('PAGE ERROR:', err);
			errors.push(err.message);
		});

		// Navigate to streams page
		await page.goto('/streams');

		// Wait for page load
		await expect(page.locator('h1')).toContainText('WebSocket & EventStream Tests');

		// Wait for WebSocket to connect
		const wsStatus = page.locator('[data-testid="ws-status"]');
		await expect(wsStatus).toContainText('Connected', { timeout: 10000 });

		// Send a message via WebSocket
		const input = page.locator('[data-testid="ws-input"]');
		await input.fill('Hello WebSocket');

		const sendButton = page.locator('[data-testid="ws-send"]');
		await sendButton.click();

		// Verify echo response appears in messages
		const messages = page.locator('[data-testid="ws-messages"]');
		await expect(messages).toContainText('Hello WebSocket', { timeout: 5000 });

		// Verify timestamp is displayed (validates structure)
		await expect(messages.locator('span').nth(1)).toContainText('(');

		// Send another message
		await input.fill('Second message');
		await sendButton.click();

		// Verify both messages are displayed
		await expect(messages).toContainText('Second message', { timeout: 5000 });

		// Verify we have exactly 2 message entries
		const messageCount = await messages.locator('div').count();
		expect(messageCount).toBe(2);

		// Verify no page errors occurred
		expect(errors).toHaveLength(0);
	});

	test('should receive Server-Sent Events', async ({ page }) => {
		// Set up console logging
		const errors: string[] = [];
		page.on('console', (msg) => console.log('BROWSER LOG:', msg.text()));
		page.on('pageerror', (err) => {
			console.error('PAGE ERROR:', err);
			errors.push(err.message);
		});

		// Navigate to streams page
		await page.goto('/streams');

		// Wait for EventStream to connect
		const sseStatus = page.locator('[data-testid="sse-status"]');
		await expect(sseStatus).toContainText('Connected', { timeout: 10000 });

		// Wait for first event
		const sseData = page.locator('[data-testid="sse-data"]');
		await expect(sseData).toContainText('tick', { timeout: 5000 });
		await expect(sseData).toContainText('Count: 1');

		// Wait for count to increment through all 5 events
		await expect(sseData).toContainText('Count: 2', { timeout: 2000 });
		await expect(sseData).toContainText('Count: 3', { timeout: 2000 });
		await expect(sseData).toContainText('Count: 4', { timeout: 2000 });
		await expect(sseData).toContainText('Count: 5', { timeout: 2000 });

		// Verify the event type is always 'tick'
		const eventText = await sseData.locator('span').first().textContent();
		expect(eventText).toBe('tick');

		// Verify no page errors occurred
		expect(errors).toHaveLength(0);
	});
});
