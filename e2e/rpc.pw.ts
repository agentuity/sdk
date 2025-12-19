import { test, expect } from '@playwright/test';

test.describe('RPC Client', () => {
	test('should test API endpoint with .run()', async ({ page }) => {
		page.on('console', (msg) => console.log('BROWSER LOG:', msg.text()));
		page.on('pageerror', (err) => console.error('PAGE ERROR:', err));

		await page.goto('/rpc-test');

		const input = page.getByTestId('name-input');
		await input.fill('APITest');

		await page.getByTestId('api-button').click();

		const result = page.getByTestId('api-result');
		await expect(result).toContainText('Hello, APITest!', { timeout: 5000 });
	});

	test('should test WebSocket endpoint with .websocket()', async ({ page }) => {
		page.on('console', (msg) => console.log('BROWSER LOG:', msg.text()));
		page.on('pageerror', (err) => console.error('PAGE ERROR:', err));

		await page.goto('/rpc-test');

		const input = page.getByTestId('name-input');
		await input.fill('WSTest');

		await page.getByTestId('ws-button').click();

		const messages = page.getByTestId('ws-messages');
		await expect(messages).toContainText('Connected', { timeout: 5000 });
		await expect(messages).toContainText('Received:', { timeout: 5000 });
		await expect(messages).toContainText('echo', { timeout: 5000 });
	});

	test('should test SSE endpoint with .eventstream()', async ({ page }) => {
		page.on('console', (msg) => console.log('BROWSER LOG:', msg.text()));
		page.on('pageerror', (err) => console.error('PAGE ERROR:', err));

		await page.goto('/rpc-test');

		await page.getByTestId('sse-button').click();

		const events = page.getByTestId('sse-events');
		await expect(events).toContainText('event', { timeout: 5000 });
		await expect(events).toContainText('tick', { timeout: 5000 });
	});

	test('should navigate to RPC page from home', async ({ page }) => {
		await page.goto('/');

		const rpcLink = page.locator('a:has-text("RPC Client")');
		await expect(rpcLink).toBeVisible();
		await rpcLink.click();

		await expect(page).toHaveURL('/rpc');
		await expect(page.locator('h1')).toContainText('RPC Client Test');
	});
});
