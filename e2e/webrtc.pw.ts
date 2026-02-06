import { test, expect, type Page, type BrowserContext, type Browser } from '@playwright/test';

async function waitForPageLoad(page: Page) {
	await expect(page.locator('h1')).toContainText('WebRTC', { timeout: 10000 });
}

async function createPeer(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
	const context = await browser.newContext({ permissions: ['camera', 'microphone'] });
	const page = await context.newPage();
	await page.addInitScript(() => {
		const mediaDevices = navigator.mediaDevices;
		if (!mediaDevices) return;
		if (!mediaDevices.getDisplayMedia) {
			mediaDevices.getDisplayMedia = async () =>
				mediaDevices.getUserMedia({ video: true, audio: false });
			return;
		}
		const original = mediaDevices.getDisplayMedia.bind(mediaDevices);
		mediaDevices.getDisplayMedia = async (constraints?: DisplayMediaStreamOptions) => {
			try {
				return await original(constraints);
			} catch {
				return mediaDevices.getUserMedia({ video: true, audio: false });
			}
		};
	});
	return { context, page };
}

async function connectPeer(
	page: Page,
	roomId: string,
	options?: { enableVideo?: boolean; enableAudio?: boolean; maxReconnectAttempts?: number; autoReconnect?: boolean }
): Promise<void> {
	await page.goto('/webrtc');
	await waitForPageLoad(page);
	await page.getByTestId('room-id-input').clear();
	await page.getByTestId('room-id-input').fill(roomId);
	if (options?.enableVideo) {
		await page.getByTestId('enable-video').check();
	}
	if (options?.enableAudio) {
		await page.getByTestId('enable-audio').check();
	}
	if (options?.autoReconnect !== undefined) {
		await page.getByTestId('auto-reconnect-toggle').setChecked(options.autoReconnect);
	}
	if (options?.maxReconnectAttempts !== undefined) {
		await page.getByTestId('max-reconnect-input').fill(String(options.maxReconnectAttempts));
	}
	await page.getByTestId('connect-btn').click();
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
			({ context: context1, page: page1 } = await createPeer(browser));
			({ context: context2, page: page2 } = await createPeer(browser));
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

test.describe('Multi-Peer Mesh', () => {
	test('should connect three peers in the same room', async ({ browser }) => {
		const roomId = `mesh-3-${Date.now()}`;
		const peers = await Promise.all([
			createPeer(browser),
			createPeer(browser),
			createPeer(browser),
		]);
		try {
			await Promise.all(peers.map((peer) => connectPeer(peer.page, roomId)));
			await Promise.all(
				peers.map((peer) =>
					expect(peer.page.getByTestId('connection-state')).toContainText('connected', {
						timeout: 15000,
					})
				)
			);
		} finally {
			await Promise.all(peers.map((peer) => peer.context.close()));
		}
	});

	test('should connect four peers in the same room', async ({ browser }) => {
		const roomId = `mesh-4-${Date.now()}`;
		const peers = await Promise.all([
			createPeer(browser),
			createPeer(browser),
			createPeer(browser),
			createPeer(browser),
		]);
		try {
			await Promise.all(peers.map((peer) => connectPeer(peer.page, roomId)));
			await Promise.all(
				peers.map((peer) =>
					expect(peer.page.getByTestId('connection-state')).toContainText('connected', {
						timeout: 15000,
					})
				)
			);
		} finally {
			await Promise.all(peers.map((peer) => peer.context.close()));
		}
	});

	test('should handle peer leave and rejoin with three peers', async ({ browser }) => {
		const roomId = `mesh-rejoin-${Date.now()}`;
		const peers = await Promise.all([
			createPeer(browser),
			createPeer(browser),
			createPeer(browser),
		]);
		try {
			await Promise.all(peers.map((peer) => connectPeer(peer.page, roomId)));
			await Promise.all(
				peers.map((peer) =>
					expect(peer.page.getByTestId('connection-state')).toContainText('connected', {
						timeout: 15000,
					})
				)
			);

			await peers[2]?.page.getByTestId('disconnect-btn').click();
			await expect(peers[2]?.page.getByTestId('connection-state')).toContainText('idle');

			await expect(peers[0]?.page.getByTestId('connection-state')).toContainText(
				'connected'
			);
			await expect(peers[1]?.page.getByTestId('connection-state')).toContainText(
				'connected'
			);

			await peers[2]?.page.getByTestId('connect-btn').click();
			await expect(peers[2]?.page.getByTestId('connection-state')).toContainText('connected', {
				timeout: 15000,
			});
		} finally {
			await Promise.all(peers.map((peer) => peer.context.close()));
		}
	});

	test('should send data channel messages with three peers', async ({ browser }) => {
		const roomId = `mesh-chat-${Date.now()}`;
		const peers = await Promise.all([
			createPeer(browser),
			createPeer(browser),
			createPeer(browser),
		]);
		try {
			await Promise.all(peers.map((peer) => connectPeer(peer.page, roomId)));
			await Promise.all(
				peers.map((peer) =>
					expect(peer.page.getByTestId('data-channel-state')).toContainText('Open', {
						timeout: 15000,
					})
				)
			);

			await peers[0]?.page.getByTestId('message-input').fill('Hello mesh peers');
			await peers[0]?.page.getByTestId('send-btn').click();

			await expect(peers[1]?.page.getByTestId('messages')).toContainText('Hello mesh peers');
			await expect(peers[2]?.page.getByTestId('messages')).toContainText('Hello mesh peers');
		} finally {
			await Promise.all(peers.map((peer) => peer.context.close()));
		}
	});
});

test.describe('Screen Sharing', () => {
	test('should start and stop screen sharing locally', async ({ browser }) => {
		const { context, page } = await createPeer(browser);
		const roomId = `screen-local-${Date.now()}`;
		try {
			await connectPeer(page, roomId, { enableVideo: true });
			await expect(page.getByTestId('connection-state')).toContainText('signaling', {
				timeout: 5000,
			});

			await page.getByTestId('start-screen-share-btn').click();
			await expect(page.getByTestId('screen-share-state')).toContainText('On');

			await page.getByTestId('stop-screen-share-btn').click();
			await expect(page.getByTestId('screen-share-state')).toContainText('Off');
		} finally {
			await context.close();
		}
	});

	test('should notify remote peers on screen share', async ({ browser }) => {
		const roomId = `screen-remote-${Date.now()}`;
		const peer1 = await createPeer(browser);
		const peer2 = await createPeer(browser);
		try {
			await Promise.all([
				connectPeer(peer1.page, roomId, { enableVideo: true }),
				connectPeer(peer2.page, roomId, { enableVideo: true }),
			]);
			await expect(peer1.page.getByTestId('connection-state')).toContainText('connected', {
				timeout: 15000,
			});
			await expect(peer2.page.getByTestId('connection-state')).toContainText('connected', {
				timeout: 15000,
			});

			await peer1.page.getByTestId('start-screen-share-btn').click();
			await expect(peer1.page.getByTestId('screen-share-state')).toContainText('On');
			await expect(peer2.page.getByTestId('messages')).toContainText('screen-share');

			await peer1.page.getByTestId('stop-screen-share-btn').click();
			await expect(peer1.page.getByTestId('screen-share-state')).toContainText('Off');
			await expect(peer2.page.getByTestId('messages')).toContainText('active":false');
		} finally {
			await Promise.all([peer1.context.close(), peer2.context.close()]);
		}
	});
});

test.describe('Recording', () => {
	test('should record local stream and produce a blob', async ({ browser }) => {
		const { context, page } = await createPeer(browser);
		const roomId = `recording-${Date.now()}`;
		try {
			await connectPeer(page, roomId, { enableVideo: true, enableAudio: true });
			await expect(page.getByTestId('connection-state')).toContainText('signaling', {
				timeout: 5000,
			});

			await page.getByTestId('start-recording-btn').click();
			await page.waitForTimeout(1500);
			await page.getByTestId('stop-recording-btn').click();

			await expect(page.getByTestId('recording-state')).toContainText('inactive');
			const sizeText = await page.getByTestId('recording-size').innerText();
			const sizeMatch = sizeText.match(/(\d+) bytes/);
			expect(sizeMatch ? Number(sizeMatch[1]) : 0).toBeGreaterThan(0);
		} finally {
			await context.close();
		}
	});
});

test.describe('Reconnection', () => {
	test('should reconnect after WebSocket disconnect', async ({ browser }) => {
		const roomId = `reconnect-${Date.now()}`;
		const peer1 = await createPeer(browser);
		const peer2 = await createPeer(browser);
		try {
			await Promise.all([
				connectPeer(peer1.page, roomId),
				connectPeer(peer2.page, roomId),
			]);
			await expect(peer1.page.getByTestId('connection-state')).toContainText('connected', {
				timeout: 15000,
			});
			await expect(peer2.page.getByTestId('connection-state')).toContainText('connected', {
				timeout: 15000,
			});

			await peer1.page.getByTestId('force-ws-close-btn').click();
			await expect(peer1.page.getByTestId('reconnect-status')).toContainText('reconnecting', {
				timeout: 15000,
			});

			await expect(peer1.page.getByTestId('connection-state')).toContainText('connected', {
				timeout: 20000,
			});
			await expect(peer1.page.getByTestId('reconnect-status')).toContainText('reconnected');
			await expect(peer1.page.getByTestId('data-channel-state')).toContainText('Open', {
				timeout: 15000,
			});
		} finally {
			await Promise.all([peer1.context.close(), peer2.context.close()]);
		}
	});

	test('should stop after max reconnect attempts', async ({ browser }) => {
		const { context, page } = await createPeer(browser);
		const roomId = `reconnect-fail-${Date.now()}`;
		try {
			await connectPeer(page, roomId, { autoReconnect: true, maxReconnectAttempts: 1 });
			await expect(page.getByTestId('connection-state')).toContainText('signaling', {
				timeout: 5000,
			});

			await page.route('**/api/webrtc/signal', (route) => route.abort());
			await page.getByTestId('force-ws-close-btn').click();

			await expect(page.getByTestId('reconnect-status')).toContainText('failed', {
				timeout: 20000,
			});
		} finally {
			await context.close();
		}
	});
});
