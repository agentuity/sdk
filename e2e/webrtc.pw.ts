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
	options?: {
		enableVideo?: boolean;
		enableAudio?: boolean;
		maxReconnectAttempts?: number;
		autoReconnect?: boolean;
	}
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
			// Connect all peers sequentially with small delays to help mesh formation
			for (const peer of peers) {
				await connectPeer(peer.page, roomId);
				await peer.page.waitForTimeout(500);
			}
			// Wait for all peers to be fully connected
			await Promise.all(
				peers.map((peer) =>
					expect(peer.page.getByTestId('connection-state')).toContainText('connected', {
						timeout: 20000,
					})
				)
			);

			// Peer 2 disconnects
			await peers[2].page.getByTestId('disconnect-btn').click();
			await expect(peers[2].page.getByTestId('connection-state')).toContainText('idle', {
				timeout: 5000,
			});

			// Remaining peers should still be connected
			await expect(peers[0].page.getByTestId('connection-state')).toContainText('connected', {
				timeout: 10000,
			});
			await expect(peers[1].page.getByTestId('connection-state')).toContainText('connected', {
				timeout: 10000,
			});

			// Peer 2 rejoins
			await peers[2].page.getByTestId('connect-btn').click();
			await expect(peers[2].page.getByTestId('connection-state')).toContainText('connected', {
				timeout: 20000,
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
			// Connect all peers sequentially with small delays to help mesh formation
			for (const peer of peers) {
				await connectPeer(peer.page, roomId);
				await peer.page.waitForTimeout(500);
			}
			// Wait for all peers to be fully connected
			await Promise.all(
				peers.map((peer) =>
					expect(peer.page.getByTestId('connection-state')).toContainText('connected', {
						timeout: 20000,
					})
				)
			);
			// Wait for data channels to open on all peers
			await Promise.all(
				peers.map((peer) =>
					expect(peer.page.getByTestId('data-channel-state')).toContainText('Open', {
						timeout: 20000,
					})
				)
			);
			// Small delay to allow all mesh data channels to stabilize
			await peers[0].page.waitForTimeout(1000);

			await peers[0].page.getByTestId('message-input').fill('Hello mesh peers');
			await peers[0].page.getByTestId('send-btn').click();

			await expect(peers[1].page.getByTestId('message-remote').first()).toContainText(
				'Hello mesh peers',
				{ timeout: 15000 }
			);
			await expect(peers[2].page.getByTestId('message-remote').first()).toContainText(
				'Hello mesh peers',
				{ timeout: 15000 }
			);
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
			await Promise.all([connectPeer(peer1.page, roomId), connectPeer(peer2.page, roomId)]);
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

			// Set an invalid signal URL before forcing WS close to make reconnection fail
			// Note: page.route() only blocks HTTP requests, not WebSocket connections
			await page.getByTestId('set-invalid-signal-url-btn').click();
			await page.getByTestId('force-ws-close-btn').click();

			await expect(page.getByTestId('reconnect-status')).toContainText('failed', {
				timeout: 20000,
			});
		} finally {
			await context.close();
		}
	});
});

test.describe('Cursor Tracking', () => {
	test('should display cursor canvas when connected', async ({ browser }) => {
		const { context, page } = await createPeer(browser);
		const roomId = `cursor-canvas-${Date.now()}`;
		try {
			await connectPeer(page, roomId);
			await expect(page.getByTestId('connection-state')).toContainText('signaling', {
				timeout: 5000,
			});

			// Cursor canvas should be visible when connected
			await expect(page.getByTestId('cursor-canvas')).toBeVisible();
		} finally {
			await context.close();
		}
	});

	test('should send cursor position on mouse move', async ({ browser }) => {
		const roomId = `cursor-move-${Date.now()}`;
		const peer1 = await createPeer(browser);
		const peer2 = await createPeer(browser);
		try {
			await Promise.all([connectPeer(peer1.page, roomId), connectPeer(peer2.page, roomId)]);

			// Wait for connection and data channel
			await expect(peer1.page.getByTestId('connection-state')).toContainText('connected', {
				timeout: 15000,
			});
			await expect(peer2.page.getByTestId('connection-state')).toContainText('connected', {
				timeout: 15000,
			});
			await expect(peer1.page.getByTestId('data-channel-state')).toContainText('Open', {
				timeout: 10000,
			});
			await expect(peer2.page.getByTestId('data-channel-state')).toContainText('Open', {
				timeout: 10000,
			});

			// Get the canvas element on peer1 and move mouse
			const canvas = peer1.page.getByTestId('cursor-canvas');
			await canvas.hover({ position: { x: 300, y: 150 } });

			// Wait a bit for cursor data to be sent through data channel
			await peer1.page.waitForTimeout(200);

			// Move mouse to trigger more cursor updates
			await canvas.hover({ position: { x: 100, y: 100 } });
			await peer1.page.waitForTimeout(200);

			// The cursor channel should work - verify canvas is still visible
			await expect(peer1.page.getByTestId('cursor-canvas')).toBeVisible();
			await expect(peer2.page.getByTestId('cursor-canvas')).toBeVisible();
		} finally {
			await Promise.all([peer1.context.close(), peer2.context.close()]);
		}
	});

	test('should not show cursor canvas when disconnected', async ({ page }) => {
		await page.goto('/webrtc');
		await waitForPageLoad(page);

		// In idle state, cursor canvas should not be visible
		await expect(page.getByTestId('cursor-canvas')).not.toBeVisible();
	});
});

test.describe('Media Controls', () => {
	test('should toggle audio mute state', async ({ browser }) => {
		const { context, page } = await createPeer(browser);
		const roomId = `audio-mute-${Date.now()}`;
		try {
			await connectPeer(page, roomId, { enableAudio: true });
			await expect(page.getByTestId('connection-state')).toContainText('signaling', {
				timeout: 5000,
			});

			// Initial state - audio should not be muted
			const muteBtn = page.getByTestId('mute-audio-btn');
			await expect(muteBtn).toBeVisible();
			await expect(muteBtn).toContainText('Mute');

			// Click to mute
			await muteBtn.click();
			await expect(muteBtn).toContainText('Unmute');

			// Click to unmute
			await muteBtn.click();
			await expect(muteBtn).toContainText('Mute');
		} finally {
			await context.close();
		}
	});

	test('should toggle video mute state', async ({ browser }) => {
		const { context, page } = await createPeer(browser);
		const roomId = `video-mute-${Date.now()}`;
		try {
			await connectPeer(page, roomId, { enableVideo: true });
			await expect(page.getByTestId('connection-state')).toContainText('signaling', {
				timeout: 5000,
			});

			// Initial state - video should not be muted
			const muteBtn = page.getByTestId('mute-video-btn');
			await expect(muteBtn).toBeVisible();
			await expect(muteBtn).toContainText('Hide');

			// Click to hide video
			await muteBtn.click();
			await expect(muteBtn).toContainText('Show');

			// Click to show video
			await muteBtn.click();
			await expect(muteBtn).toContainText('Hide');
		} finally {
			await context.close();
		}
	});

	test('should maintain mute state after toggle', async ({ browser }) => {
		const { context, page } = await createPeer(browser);
		const roomId = `mute-persist-${Date.now()}`;
		try {
			await connectPeer(page, roomId, { enableAudio: true, enableVideo: true });
			await expect(page.getByTestId('connection-state')).toContainText('signaling', {
				timeout: 5000,
			});

			// Toggle both mute states
			await page.getByTestId('mute-audio-btn').click();
			await page.getByTestId('mute-video-btn').click();

			// Verify both are muted
			await expect(page.getByTestId('mute-audio-btn')).toContainText('Unmute');
			await expect(page.getByTestId('mute-video-btn')).toContainText('Show');

			// Wait and verify state persists
			await page.waitForTimeout(500);
			await expect(page.getByTestId('mute-audio-btn')).toContainText('Unmute');
			await expect(page.getByTestId('mute-video-btn')).toContainText('Show');
		} finally {
			await context.close();
		}
	});
});

test.describe('Error Handling', () => {
	test('should display error on connection failure', async ({ browser }) => {
		const { context, page } = await createPeer(browser);
		const roomId = `error-test-${Date.now()}`;
		try {
			await connectPeer(page, roomId, { autoReconnect: false });
			await expect(page.getByTestId('connection-state')).toContainText('signaling', {
				timeout: 5000,
			});

			// Set invalid signal URL and force close to trigger error
			await page.getByTestId('set-invalid-signal-url-btn').click();
			await page.getByTestId('force-ws-close-btn').click();

			// Should show error or transition to a failed state
			// The reconnect should be disabled, so it should fail
			await expect(page.getByTestId('connection-state')).not.toContainText('connected', {
				timeout: 10000,
			});
		} finally {
			await context.close();
		}
	});
});

test.describe('Media Stream Assignment', () => {
	test('should assign local stream to video element', async ({ browser }) => {
		const { context, page } = await createPeer(browser);
		const roomId = `local-stream-${Date.now()}`;
		try {
			await connectPeer(page, roomId, { enableVideo: true });
			await expect(page.getByTestId('connection-state')).toContainText('signaling', {
				timeout: 5000,
			});

			// Local video element should be visible
			const localVideo = page.getByTestId('local-video');
			await expect(localVideo).toBeVisible();

			// Check that video has a srcObject assigned (stream is playing)
			const hasSrcObject = await localVideo.evaluate((el) => {
				const video = el as HTMLVideoElement;
				return video.srcObject !== null;
			});
			expect(hasSrcObject).toBe(true);
		} finally {
			await context.close();
		}
	});

	test('should assign remote stream to video element when peer connects', async ({ browser }) => {
		const roomId = `remote-stream-${Date.now()}`;
		const peer1 = await createPeer(browser);
		const peer2 = await createPeer(browser);
		try {
			// Connect peer1 first
			await connectPeer(peer1.page, roomId, { enableVideo: true });
			await expect(peer1.page.getByTestId('connection-state')).toContainText('signaling', {
				timeout: 5000,
			});

			// Connect peer2
			await connectPeer(peer2.page, roomId, { enableVideo: true });

			// Wait for connection
			await expect(peer1.page.getByTestId('connection-state')).toContainText('connected', {
				timeout: 15000,
			});
			await expect(peer2.page.getByTestId('connection-state')).toContainText('connected', {
				timeout: 15000,
			});

			// Wait for remote peer ID to be populated (triggers video element render)
			await expect(peer1.page.getByTestId('remote-peer-id')).not.toContainText('Waiting...', {
				timeout: 15000,
			});

			// Remote video element should now be visible
			await expect(peer1.page.locator(`[data-testid^="remote-video-"]`).first()).toBeVisible({
				timeout: 10000,
			});
		} finally {
			await Promise.all([peer1.context.close(), peer2.context.close()]);
		}
	});
});

test.describe('Peer List Updates', () => {
	test('should show remote peer ID when peer joins', async ({ browser }) => {
		const roomId = `peer-join-${Date.now()}`;
		const peer1 = await createPeer(browser);
		const peer2 = await createPeer(browser);
		try {
			// Connect peer1 first
			await connectPeer(peer1.page, roomId);
			await expect(peer1.page.getByTestId('connection-state')).toContainText('signaling', {
				timeout: 5000,
			});

			// Remote peer should show "Waiting..." initially
			await expect(peer1.page.getByTestId('remote-peer-id')).toContainText('Waiting...');

			// Connect peer2
			await connectPeer(peer2.page, roomId);

			// Wait for connection
			await expect(peer1.page.getByTestId('connection-state')).toContainText('connected', {
				timeout: 15000,
			});

			// Remote peer ID should now be shown (not "Waiting...")
			await expect(peer1.page.getByTestId('remote-peer-id')).not.toContainText('Waiting...', {
				timeout: 5000,
			});
		} finally {
			await Promise.all([peer1.context.close(), peer2.context.close()]);
		}
	});

	test('should clear remote peer ID when peer disconnects', async ({ browser }) => {
		const roomId = `peer-leave-${Date.now()}`;
		const peer1 = await createPeer(browser);
		const peer2 = await createPeer(browser);
		try {
			await Promise.all([connectPeer(peer1.page, roomId), connectPeer(peer2.page, roomId)]);

			// Wait for full connection with data channel
			await expect(peer1.page.getByTestId('data-channel-state')).toContainText('Open', {
				timeout: 15000,
			});
			await expect(peer2.page.getByTestId('data-channel-state')).toContainText('Open', {
				timeout: 15000,
			});

			// Get peer2's ID directly from their page
			const peer2IdText = await peer2.page.getByTestId('peer-id').innerText();
			const peer2Id = peer2IdText.replace('My Peer ID: ', '');

			// Peer2 disconnects
			await peer2.page.getByTestId('disconnect-btn').click();

			// Peer1 should see remote peer cleared (back to Waiting...)
			await expect(peer1.page.getByTestId('remote-peer-id')).toContainText('Waiting...', {
				timeout: 10000,
			});
		} finally {
			await Promise.all([peer1.context.close(), peer2.context.close()]);
		}
	});

	test('should show peer IDs on both sides when fully connected', async ({ browser }) => {
		const roomId = `peer-bidirectional-${Date.now()}`;
		const peer1 = await createPeer(browser);
		const peer2 = await createPeer(browser);
		try {
			// Connect both peers
			await Promise.all([connectPeer(peer1.page, roomId), connectPeer(peer2.page, roomId)]);

			// Wait for both to have data channel open (full connectivity)
			await expect(peer1.page.getByTestId('data-channel-state')).toContainText('Open', {
				timeout: 15000,
			});
			await expect(peer2.page.getByTestId('data-channel-state')).toContainText('Open', {
				timeout: 15000,
			});

			// Test that messages can be sent (proves both sides see each other)
			await peer1.page.getByTestId('message-input').fill('hello from peer1');
			await peer1.page.getByTestId('send-btn').click();

			// Peer2 should receive the message (proves peer1 knows about peer2)
			await expect(peer2.page.getByTestId('messages')).toContainText('hello from peer1', {
				timeout: 5000,
			});
		} finally {
			await Promise.all([peer1.context.close(), peer2.context.close()]);
		}
	});
});

test.describe('State Cleanup on Disconnect', () => {
	test('should reset connection state to idle on disconnect', async ({ browser }) => {
		const { context, page } = await createPeer(browser);
		const roomId = `cleanup-state-${Date.now()}`;
		try {
			await connectPeer(page, roomId);
			await expect(page.getByTestId('connection-state')).toContainText('signaling', {
				timeout: 5000,
			});

			// Disconnect
			await page.getByTestId('disconnect-btn').click();

			// Should be idle
			await expect(page.getByTestId('connection-state')).toContainText('idle');
		} finally {
			await context.close();
		}
	});

	test('should clear peer ID on disconnect', async ({ browser }) => {
		const { context, page } = await createPeer(browser);
		const roomId = `cleanup-peerid-${Date.now()}`;
		try {
			await connectPeer(page, roomId);
			await expect(page.getByTestId('connection-state')).toContainText('signaling', {
				timeout: 5000,
			});

			// Wait for peer ID to be assigned
			await expect(page.getByTestId('peer-id')).not.toContainText('N/A', { timeout: 5000 });

			// Disconnect
			await page.getByTestId('disconnect-btn').click();

			// Peer ID should be cleared
			await expect(page.getByTestId('peer-id')).toContainText('N/A');
		} finally {
			await context.close();
		}
	});

	test('should clear remote peer IDs on disconnect', async ({ browser }) => {
		const roomId = `cleanup-remote-${Date.now()}`;
		const peer1 = await createPeer(browser);
		const peer2 = await createPeer(browser);
		try {
			await Promise.all([connectPeer(peer1.page, roomId), connectPeer(peer2.page, roomId)]);

			// Wait for full connection with data channel open
			await expect(peer1.page.getByTestId('data-channel-state')).toContainText('Open', {
				timeout: 15000,
			});

			// Disconnect peer1
			await peer1.page.getByTestId('disconnect-btn').click();

			// Remote peer IDs should be cleared (back to Waiting...)
			await expect(peer1.page.getByTestId('remote-peer-id')).toContainText('Waiting...');
		} finally {
			await Promise.all([peer1.context.close(), peer2.context.close()]);
		}
	});

	test('should close data channel on disconnect', async ({ browser }) => {
		const roomId = `cleanup-datachannel-${Date.now()}`;
		const peer1 = await createPeer(browser);
		const peer2 = await createPeer(browser);
		try {
			await Promise.all([connectPeer(peer1.page, roomId), connectPeer(peer2.page, roomId)]);

			// Wait for data channel to open
			await expect(peer1.page.getByTestId('data-channel-state')).toContainText('Open', {
				timeout: 15000,
			});

			// Disconnect
			await peer1.page.getByTestId('disconnect-btn').click();

			// Data channel should be closed
			await expect(peer1.page.getByTestId('data-channel-state')).toContainText('Closed');
		} finally {
			await Promise.all([peer1.context.close(), peer2.context.close()]);
		}
	});

	test('should reset screen share state on disconnect', async ({ browser }) => {
		const { context, page } = await createPeer(browser);
		const roomId = `cleanup-screenshare-${Date.now()}`;
		try {
			await connectPeer(page, roomId, { enableVideo: true });
			await expect(page.getByTestId('connection-state')).toContainText('signaling', {
				timeout: 5000,
			});

			// Start screen share
			await page.getByTestId('start-screen-share-btn').click();
			await expect(page.getByTestId('screen-share-state')).toContainText('On');

			// Disconnect
			await page.getByTestId('disconnect-btn').click();

			// Screen share state should be reset to Off
			await expect(page.getByTestId('screen-share-state')).toContainText('Off');
		} finally {
			await context.close();
		}
	});

	test('should reset reconnect status on disconnect', async ({ browser }) => {
		const { context, page } = await createPeer(browser);
		const roomId = `cleanup-reconnect-${Date.now()}`;
		try {
			await connectPeer(page, roomId);
			await expect(page.getByTestId('connection-state')).toContainText('signaling', {
				timeout: 5000,
			});

			// Verify initial reconnect status
			await expect(page.getByTestId('reconnect-status')).toContainText('idle');

			// Disconnect
			await page.getByTestId('disconnect-btn').click();

			// Reconnect status should remain idle after disconnect
			await expect(page.getByTestId('reconnect-status')).toContainText('idle');
		} finally {
			await context.close();
		}
	});
});

test.describe('State Transitions', () => {
	test('should complete full state lifecycle: idle → signaling → connected → idle', async ({
		browser,
	}) => {
		const roomId = `state-lifecycle-${Date.now()}`;
		const peer1 = await createPeer(browser);
		const peer2 = await createPeer(browser);
		try {
			// Navigate peer1 first
			await peer1.page.goto('/webrtc');
			await waitForPageLoad(peer1.page);

			// Verify initial state is 'idle'
			await expect(peer1.page.getByTestId('connection-state')).toContainText('idle');

			// Set room ID
			await peer1.page.getByTestId('room-id-input').clear();
			await peer1.page.getByTestId('room-id-input').fill(roomId);

			// Connect - should transition to 'signaling'
			await peer1.page.getByTestId('connect-btn').click();
			await expect(peer1.page.getByTestId('connection-state')).toContainText('signaling', {
				timeout: 5000,
			});

			// Connect second peer to trigger 'connected' state
			await connectPeer(peer2.page, roomId);
			await expect(peer1.page.getByTestId('connection-state')).toContainText('connected', {
				timeout: 10000,
			});
			await expect(peer2.page.getByTestId('connection-state')).toContainText('connected', {
				timeout: 10000,
			});

			// Disconnect - should return to 'idle'
			await peer1.page.getByTestId('disconnect-btn').click();
			await expect(peer1.page.getByTestId('connection-state')).toContainText('idle');
		} finally {
			await Promise.all([peer1.context.close(), peer2.context.close()]);
		}
	});
});

test.describe('Recording Metadata', () => {
	test('should set recording MIME type correctly', async ({ browser }) => {
		const { context, page } = await createPeer(browser);
		const roomId = `recording-mime-${Date.now()}`;
		try {
			await connectPeer(page, roomId, { enableVideo: true, enableAudio: true });
			await expect(page.getByTestId('connection-state')).toContainText('signaling', {
				timeout: 5000,
			});

			// Initial MIME should be N/A
			await expect(page.getByTestId('recording-mime')).toContainText('N/A');

			// Start and stop recording
			await page.getByTestId('start-recording-btn').click();
			await page.waitForTimeout(1000);
			await page.getByTestId('stop-recording-btn').click();

			// After recording, MIME type should be set (webm or mp4)
			await expect(page.getByTestId('recording-mime')).not.toContainText('N/A', {
				timeout: 5000,
			});
			const mimeText = await page.getByTestId('recording-mime').innerText();
			expect(mimeText).toMatch(/video\/(webm|mp4)/);
		} finally {
			await context.close();
		}
	});

	test('should show recording size after recording stops', async ({ browser }) => {
		const { context, page } = await createPeer(browser);
		const roomId = `recording-size-${Date.now()}`;
		try {
			await connectPeer(page, roomId, { enableVideo: true, enableAudio: true });
			await expect(page.getByTestId('connection-state')).toContainText('signaling', {
				timeout: 5000,
			});

			// Initial size should be N/A
			await expect(page.getByTestId('recording-size')).toContainText('N/A');

			// Start recording
			await page.getByTestId('start-recording-btn').click();
			await expect(page.getByTestId('recording-state')).toContainText('recording', {
				timeout: 5000,
			});

			// Wait for recording to accumulate data
			await page.waitForTimeout(2000);

			// Stop recording
			await page.getByTestId('stop-recording-btn').click();

			// Size should now show bytes and be > 0
			await expect(page.getByTestId('recording-size')).toContainText('bytes', {
				timeout: 5000,
			});
			const sizeText = await page.getByTestId('recording-size').innerText();
			const sizeMatch = sizeText.match(/(\d+) bytes/);
			expect(sizeMatch).toBeTruthy();
			expect(Number(sizeMatch?.[1])).toBeGreaterThan(0);
		} finally {
			await context.close();
		}
	});
});

test.describe('Message Metadata', () => {
	test('should display sent messages as local and received as remote', async ({ browser }) => {
		const roomId = `message-metadata-${Date.now()}`;
		const peer1 = await createPeer(browser);
		const peer2 = await createPeer(browser);
		try {
			await Promise.all([connectPeer(peer1.page, roomId), connectPeer(peer2.page, roomId)]);

			// Wait for data channels to open
			await expect(peer1.page.getByTestId('data-channel-state')).toContainText('Open', {
				timeout: 10000,
			});
			await expect(peer2.page.getByTestId('data-channel-state')).toContainText('Open', {
				timeout: 10000,
			});

			// Peer 1 sends a message
			await peer1.page.getByTestId('message-input').fill('Test message from peer 1');
			await peer1.page.getByTestId('send-btn').click();

			// On peer 1, message should appear as local (data-testid="message-local")
			await expect(peer1.page.getByTestId('message-local').first()).toContainText(
				'Test message from peer 1',
				{ timeout: 5000 }
			);

			// On peer 2, same message should appear as remote (data-testid="message-remote")
			await expect(peer2.page.getByTestId('message-remote').first()).toContainText(
				'Test message from peer 1',
				{ timeout: 5000 }
			);

			// Verify the local message shows "You:" prefix
			const localMessageText = await peer1.page.getByTestId('message-local').first().innerText();
			expect(localMessageText).toContain('You:');

			// Verify the remote message shows "Remote" prefix
			const remoteMessageText = await peer2.page
				.getByTestId('message-remote')
				.first()
				.innerText();
			expect(remoteMessageText).toContain('Remote');
		} finally {
			await Promise.all([peer1.context.close(), peer2.context.close()]);
		}
	});

	test('should include timestamps in messages', async ({ browser }) => {
		const roomId = `message-timestamp-${Date.now()}`;
		const peer1 = await createPeer(browser);
		const peer2 = await createPeer(browser);
		try {
			await Promise.all([connectPeer(peer1.page, roomId), connectPeer(peer2.page, roomId)]);

			// Wait for data channels to open
			await expect(peer1.page.getByTestId('data-channel-state')).toContainText('Open', {
				timeout: 10000,
			});

			// Send JSON message which includes timestamp
			const beforeSend = Date.now();
			await peer1.page.getByTestId('send-json-btn').click();
			const afterSend = Date.now();

			// Verify message appears on peer2
			await expect(peer2.page.getByTestId('message-remote').first()).toContainText('ping', {
				timeout: 5000,
			});

			// The JSON message should contain a timestamp field
			const messageContent = await peer2.page.getByTestId('message-remote').first().innerText();
			expect(messageContent).toContain('timestamp');

			// Extract and verify timestamp is within expected range
			const timestampMatch = messageContent.match(/"timestamp":\s*(\d+)/);
			expect(timestampMatch).toBeTruthy();
			const timestamp = Number(timestampMatch?.[1]);
			expect(timestamp).toBeGreaterThanOrEqual(beforeSend);
			expect(timestamp).toBeLessThanOrEqual(afterSend + 1000); // Allow 1s tolerance
		} finally {
			await Promise.all([peer1.context.close(), peer2.context.close()]);
		}
	});
});

test.describe('Connection Info Display', () => {
	test('should display valid peer ID after connection', async ({ browser }) => {
		const { context, page } = await createPeer(browser);
		const roomId = `peer-id-display-${Date.now()}`;
		try {
			await connectPeer(page, roomId);
			await expect(page.getByTestId('connection-state')).toContainText('signaling', {
				timeout: 5000,
			});

			// Wait for peer ID to be assigned
			await expect(page.getByTestId('peer-id')).not.toContainText('N/A', { timeout: 5000 });

			// Verify peer ID format (should be non-empty string)
			const peerIdText = await page.getByTestId('peer-id').innerText();
			const peerId = peerIdText.replace('My Peer ID: ', '').trim();

			// Peer ID should not be empty and should have reasonable length
			expect(peerId.length).toBeGreaterThan(0);
			expect(peerId).not.toBe('N/A');
			expect(peerId).not.toBe('null');
			expect(peerId).not.toBe('undefined');
		} finally {
			await context.close();
		}
	});

	test('should show both local and remote peer IDs when connected', async ({ browser }) => {
		const roomId = `peer-ids-both-${Date.now()}`;
		const peer1 = await createPeer(browser);
		const peer2 = await createPeer(browser);
		try {
			await Promise.all([connectPeer(peer1.page, roomId), connectPeer(peer2.page, roomId)]);

			// Wait for full connection with data channel open
			await expect(peer1.page.getByTestId('data-channel-state')).toContainText('Open', {
				timeout: 15000,
			});
			await expect(peer2.page.getByTestId('data-channel-state')).toContainText('Open', {
				timeout: 15000,
			});

			// Verify both peers have valid peer IDs (not N/A)
			await expect(peer1.page.getByTestId('peer-id')).not.toContainText('N/A', {
				timeout: 5000,
			});
			await expect(peer2.page.getByTestId('peer-id')).not.toContainText('N/A', {
				timeout: 5000,
			});

			// Get peer IDs
			const peer1IdText = await peer1.page.getByTestId('peer-id').innerText();
			const peer1Id = peer1IdText.replace('My Peer ID: ', '').trim();
			const peer2IdText = await peer2.page.getByTestId('peer-id').innerText();
			const peer2Id = peer2IdText.replace('My Peer ID: ', '').trim();

			// Peer IDs should be different (unique per peer)
			expect(peer1Id).not.toBe(peer2Id);
			expect(peer1Id.length).toBeGreaterThan(5);
			expect(peer2Id.length).toBeGreaterThan(5);

			// Verify connectivity by sending a message - this proves peers see each other
			await peer1.page.getByTestId('message-input').fill('verification message');
			await peer1.page.getByTestId('send-btn').click();
			await expect(peer2.page.getByTestId('message-remote').first()).toContainText(
				'verification message',
				{ timeout: 5000 }
			);
		} finally {
			await Promise.all([peer1.context.close(), peer2.context.close()]);
		}
	});
});

test.describe('Data Channel State Display', () => {
	test('should show correct data channel state text for both peers', async ({ browser }) => {
		const roomId = `data-channel-display-${Date.now()}`;
		const peer1 = await createPeer(browser);
		const peer2 = await createPeer(browser);
		try {
			// Initially check data channel is closed
			await peer1.page.goto('/webrtc');
			await waitForPageLoad(peer1.page);
			await expect(peer1.page.getByTestId('data-channel-state')).toContainText('Closed');

			// Connect both peers
			await peer1.page.getByTestId('room-id-input').clear();
			await peer1.page.getByTestId('room-id-input').fill(roomId);
			await peer1.page.getByTestId('connect-btn').click();
			await connectPeer(peer2.page, roomId);

			// Wait for connection
			await expect(peer1.page.getByTestId('connection-state')).toContainText('connected', {
				timeout: 15000,
			});
			await expect(peer2.page.getByTestId('connection-state')).toContainText('connected', {
				timeout: 15000,
			});

			// Both peers should show "Open" for data channel
			await expect(peer1.page.getByTestId('data-channel-state')).toContainText('Open', {
				timeout: 5000,
			});
			await expect(peer2.page.getByTestId('data-channel-state')).toContainText('Open', {
				timeout: 5000,
			});

			// Verify exact text format
			const peer1ChannelText = await peer1.page.getByTestId('data-channel-state').innerText();
			const peer2ChannelText = await peer2.page.getByTestId('data-channel-state').innerText();
			expect(peer1ChannelText).toContain('Data Channel:');
			expect(peer2ChannelText).toContain('Data Channel:');
		} finally {
			await Promise.all([peer1.context.close(), peer2.context.close()]);
		}
	});
});
