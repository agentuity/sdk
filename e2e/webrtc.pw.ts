import { test, expect, type Page, type BrowserContext } from '@playwright/test';

async function waitForPageLoad(page: Page) {
	await expect(page.locator('h1')).toContainText('WebRTC', { timeout: 10000 });
}

test.describe('WebRTC Data Channels', () => {
	test.describe('Single Peer', () => {
		test('should connect to signaling server and reach signaling state', async ({ page }) => {
			await page.goto('/webrtc');
			await waitForPageLoad(page);

			// Verify initial state
			await expect(page.getByTestId('connection-state')).toContainText('idle');

			// Connect
			await page.getByTestId('connect-btn').click();

			// Should transition to signaling (waiting for peer)
			await expect(page.getByTestId('connection-state')).toContainText('signaling', {
				timeout: 5000,
			});

			// Should have peer ID assigned
			await expect(page.getByTestId('peer-id')).not.toContainText('N/A', { timeout: 5000 });
		});

		test('should disconnect cleanly', async ({ page }) => {
			await page.goto('/webrtc');
			await waitForPageLoad(page);

			// Connect
			await page.getByTestId('connect-btn').click();
			await expect(page.getByTestId('connection-state')).toContainText('signaling', {
				timeout: 5000,
			});

			// Disconnect
			await page.getByTestId('disconnect-btn').click();

			// Should return to idle
			await expect(page.getByTestId('connection-state')).toContainText('idle');
			await expect(page.getByTestId('peer-id')).toContainText('N/A');
		});

		test('should join custom room', async ({ page }) => {
			await page.goto('/webrtc');
			await waitForPageLoad(page);

			// Set custom room ID
			const roomInput = page.getByTestId('room-id-input');
			await roomInput.clear();
			await roomInput.fill('custom-room-123');

			// Connect
			await page.getByTestId('connect-btn').click();

			// Should connect successfully
			await expect(page.getByTestId('connection-state')).toContainText('signaling', {
				timeout: 5000,
			});
		});
	});

	test.describe('Two Peers', () => {
		let context1: BrowserContext;
		let context2: BrowserContext;
		let page1: Page;
		let page2: Page;

		test.beforeEach(async ({ browser }) => {
			// Create two separate browser contexts for two peers
			context1 = await browser.newContext();
			context2 = await browser.newContext();
			page1 = await context1.newPage();
			page2 = await context2.newPage();
		});

		test.afterEach(async () => {
			await context1.close();
			await context2.close();
		});

		test('should establish peer connection between two browsers', async () => {
			const roomId = `test-room-${Date.now()}`;

			// Navigate both pages
			await Promise.all([page1.goto('/webrtc'), page2.goto('/webrtc')]);
			await Promise.all([waitForPageLoad(page1), waitForPageLoad(page2)]);

			// Set same room ID for both
			await page1.getByTestId('room-id-input').clear();
			await page1.getByTestId('room-id-input').fill(roomId);
			await page2.getByTestId('room-id-input').clear();
			await page2.getByTestId('room-id-input').fill(roomId);

			// Connect first peer
			await page1.getByTestId('connect-btn').click();
			await expect(page1.getByTestId('connection-state')).toContainText('signaling', {
				timeout: 5000,
			});

			// Connect second peer
			await page2.getByTestId('connect-btn').click();

			// Both should eventually reach connected state
			await expect(page1.getByTestId('connection-state')).toContainText('connected', {
				timeout: 10000,
			});
			await expect(page2.getByTestId('connection-state')).toContainText('connected', {
				timeout: 10000,
			});

			// Both should have peer IDs assigned
			await expect(page1.getByTestId('peer-id')).not.toContainText('N/A', {
				timeout: 5000,
			});
			await expect(page2.getByTestId('peer-id')).not.toContainText('N/A', {
				timeout: 5000,
			});
		});

		test('should open data channel between peers', async () => {
			const roomId = `data-channel-${Date.now()}`;

			await Promise.all([page1.goto('/webrtc'), page2.goto('/webrtc')]);
			await Promise.all([waitForPageLoad(page1), waitForPageLoad(page2)]);

			// Set same room ID
			await page1.getByTestId('room-id-input').clear();
			await page1.getByTestId('room-id-input').fill(roomId);
			await page2.getByTestId('room-id-input').clear();
			await page2.getByTestId('room-id-input').fill(roomId);

			// Connect both peers
			await page1.getByTestId('connect-btn').click();
			await page2.getByTestId('connect-btn').click();

			// Wait for connection
			await expect(page1.getByTestId('connection-state')).toContainText('connected', {
				timeout: 10000,
			});
			await expect(page2.getByTestId('connection-state')).toContainText('connected', {
				timeout: 10000,
			});

			// Data channel should be open on both
			await expect(page1.getByTestId('data-channel-state')).toContainText('Open', {
				timeout: 5000,
			});
			await expect(page2.getByTestId('data-channel-state')).toContainText('Open', {
				timeout: 5000,
			});
		});

		test('should send and receive string messages', async () => {
			const roomId = `messaging-${Date.now()}`;

			await Promise.all([page1.goto('/webrtc'), page2.goto('/webrtc')]);
			await Promise.all([waitForPageLoad(page1), waitForPageLoad(page2)]);

			// Set same room ID and connect
			await page1.getByTestId('room-id-input').clear();
			await page1.getByTestId('room-id-input').fill(roomId);
			await page2.getByTestId('room-id-input').clear();
			await page2.getByTestId('room-id-input').fill(roomId);

			await page1.getByTestId('connect-btn').click();
			await page2.getByTestId('connect-btn').click();

			// Wait for data channel to open
			await expect(page1.getByTestId('data-channel-state')).toContainText('Open', {
				timeout: 10000,
			});
			await expect(page2.getByTestId('data-channel-state')).toContainText('Open', {
				timeout: 10000,
			});

			// Send message from peer 1 to peer 2
			await page1.getByTestId('message-input').fill('Hello from peer 1!');
			await page1.getByTestId('send-btn').click();

			// Peer 2 should receive the message
			await expect(page2.getByTestId('message-remote').first()).toContainText(
				'Hello from peer 1!',
				{ timeout: 5000 }
			);

			// Peer 1 should see their own message as local
			await expect(page1.getByTestId('message-local').first()).toContainText(
				'Hello from peer 1!'
			);

			// Send message from peer 2 to peer 1
			await page2.getByTestId('message-input').fill('Hello from peer 2!');
			await page2.getByTestId('send-btn').click();

			// Peer 1 should receive the message
			await expect(page1.getByTestId('message-remote').first()).toContainText(
				'Hello from peer 2!',
				{ timeout: 5000 }
			);
		});

		test('should send and receive JSON messages', async () => {
			const roomId = `json-test-${Date.now()}`;

			await Promise.all([page1.goto('/webrtc'), page2.goto('/webrtc')]);
			await Promise.all([waitForPageLoad(page1), waitForPageLoad(page2)]);

			await page1.getByTestId('room-id-input').clear();
			await page1.getByTestId('room-id-input').fill(roomId);
			await page2.getByTestId('room-id-input').clear();
			await page2.getByTestId('room-id-input').fill(roomId);

			await page1.getByTestId('connect-btn').click();
			await page2.getByTestId('connect-btn').click();

			// Wait for data channel
			await expect(page1.getByTestId('data-channel-state')).toContainText('Open', {
				timeout: 10000,
			});
			await expect(page2.getByTestId('data-channel-state')).toContainText('Open', {
				timeout: 10000,
			});

			// Send JSON from peer 1
			await page1.getByTestId('send-json-btn').click();

			// Peer 2 should receive JSON with ping type
			await expect(page2.getByTestId('message-remote').first()).toContainText('ping', {
				timeout: 5000,
			});
		});

		test('should handle peer disconnect gracefully', async () => {
			const roomId = `disconnect-${Date.now()}`;

			await Promise.all([page1.goto('/webrtc'), page2.goto('/webrtc')]);
			await Promise.all([waitForPageLoad(page1), waitForPageLoad(page2)]);

			await page1.getByTestId('room-id-input').clear();
			await page1.getByTestId('room-id-input').fill(roomId);
			await page2.getByTestId('room-id-input').clear();
			await page2.getByTestId('room-id-input').fill(roomId);

			await page1.getByTestId('connect-btn').click();
			await page2.getByTestId('connect-btn').click();

			// Wait for connection
			await expect(page1.getByTestId('connection-state')).toContainText('connected', {
				timeout: 10000,
			});
			await expect(page2.getByTestId('connection-state')).toContainText('connected', {
				timeout: 10000,
			});

			// Peer 2 disconnects
			await page2.getByTestId('disconnect-btn').click();

			// Peer 1 should detect the disconnect and go back to signaling
			await expect(page1.getByTestId('connection-state')).toContainText('signaling', {
				timeout: 5000,
			});

			// Peer 1's remote peer ID should be cleared or show waiting
			await expect(page1.getByTestId('data-channel-state')).toContainText('Closed', {
				timeout: 5000,
			});
		});

		test('should handle room rejoin after disconnect', async () => {
			const roomId = `rejoin-${Date.now()}`;

			await Promise.all([page1.goto('/webrtc'), page2.goto('/webrtc')]);
			await Promise.all([waitForPageLoad(page1), waitForPageLoad(page2)]);

			await page1.getByTestId('room-id-input').clear();
			await page1.getByTestId('room-id-input').fill(roomId);
			await page2.getByTestId('room-id-input').clear();
			await page2.getByTestId('room-id-input').fill(roomId);

			// First connection
			await page1.getByTestId('connect-btn').click();
			await page2.getByTestId('connect-btn').click();

			await expect(page1.getByTestId('connection-state')).toContainText('connected', {
				timeout: 10000,
			});

			// Peer 2 disconnects
			await page2.getByTestId('disconnect-btn').click();
			await expect(page2.getByTestId('connection-state')).toContainText('idle');

			// Peer 2 rejoins
			await page2.getByTestId('connect-btn').click();

			// Both should reconnect
			await expect(page1.getByTestId('connection-state')).toContainText('connected', {
				timeout: 10000,
			});
			await expect(page2.getByTestId('connection-state')).toContainText('connected', {
				timeout: 10000,
			});

			// Data channel should work again
			await expect(page1.getByTestId('data-channel-state')).toContainText('Open', {
				timeout: 5000,
			});
			await expect(page2.getByTestId('data-channel-state')).toContainText('Open', {
				timeout: 5000,
			});
		});
	});
});
