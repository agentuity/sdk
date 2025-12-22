import { describe, test, expect, beforeEach } from 'bun:test';
import {
	WebRTCRoomManager,
	type SignalMsg,
	type SDPDescription,
	type ICECandidate,
	type WebRTCSignalingCallbacks,
} from '../src/webrtc-signaling';
import type { WebSocketConnection } from '../src/router';

// Mock WebSocket connection
function createMockWs(): WebSocketConnection & { messages: string[] } {
	const messages: string[] = [];
	return {
		messages,
		onOpen: () => {},
		onMessage: () => {},
		onClose: () => {},
		send: (data: string | ArrayBuffer | Uint8Array) => {
			messages.push(typeof data === 'string' ? data : data.toString());
		},
	};
}

function parseMessage(ws: { messages: string[] }, index = -1): SignalMsg {
	const idx = index < 0 ? ws.messages.length + index : index;
	return JSON.parse(ws.messages[idx]);
}

describe('WebRTCRoomManager', () => {
	let roomManager: WebRTCRoomManager;

	beforeEach(() => {
		roomManager = new WebRTCRoomManager({ maxPeers: 2 });
	});

	describe('handleJoin', () => {
		test('should assign peerId and send joined message', () => {
			const ws = createMockWs();
			roomManager.handleJoin(ws, 'room-1');

			expect(ws.messages.length).toBe(1);
			const msg = parseMessage(ws);
			expect(msg.t).toBe('joined');
			if (msg.t === 'joined') {
				expect(msg.peerId).toMatch(/^peer-/);
				expect(msg.roomId).toBe('room-1');
				expect(msg.peers).toEqual([]);
			}
		});

		test('should include existing peers in joined message', () => {
			const ws1 = createMockWs();
			const ws2 = createMockWs();

			roomManager.handleJoin(ws1, 'room-1');
			const msg1 = parseMessage(ws1);
			const peer1Id = msg1.t === 'joined' ? msg1.peerId : '';

			roomManager.handleJoin(ws2, 'room-1');
			const msg2 = parseMessage(ws2);

			expect(msg2.t).toBe('joined');
			if (msg2.t === 'joined') {
				expect(msg2.peers).toContain(peer1Id);
			}
		});

		test('should notify existing peers when new peer joins', () => {
			const ws1 = createMockWs();
			const ws2 = createMockWs();

			roomManager.handleJoin(ws1, 'room-1');
			roomManager.handleJoin(ws2, 'room-1');

			// ws1 should receive peer-joined notification
			expect(ws1.messages.length).toBe(2);
			const notification = parseMessage(ws1);
			expect(notification.t).toBe('peer-joined');
		});

		test('should reject peer when room is full', () => {
			const ws1 = createMockWs();
			const ws2 = createMockWs();
			const ws3 = createMockWs();

			roomManager.handleJoin(ws1, 'room-1');
			roomManager.handleJoin(ws2, 'room-1');
			roomManager.handleJoin(ws3, 'room-1');

			const msg = parseMessage(ws3);
			expect(msg.t).toBe('error');
			if (msg.t === 'error') {
				expect(msg.message).toContain('full');
			}
		});

		test('should allow joining different rooms', () => {
			const ws1 = createMockWs();
			const ws2 = createMockWs();
			const ws3 = createMockWs();

			roomManager.handleJoin(ws1, 'room-1');
			roomManager.handleJoin(ws2, 'room-1');
			roomManager.handleJoin(ws3, 'room-2');

			// ws3 should successfully join room-2
			const msg = parseMessage(ws3);
			expect(msg.t).toBe('joined');
		});
	});

	describe('handleDisconnect', () => {
		test('should remove peer from room and notify others', () => {
			const ws1 = createMockWs();
			const ws2 = createMockWs();

			roomManager.handleJoin(ws1, 'room-1');
			const msg1 = parseMessage(ws1);
			const peer1Id = msg1.t === 'joined' ? msg1.peerId : '';

			roomManager.handleJoin(ws2, 'room-1');
			ws1.messages.length = 0; // Clear in-place

			roomManager.handleDisconnect(ws1);

			// ws2 should receive peer-left notification
			const notification = parseMessage(ws2);
			expect(notification.t).toBe('peer-left');
			if (notification.t === 'peer-left') {
				expect(notification.peerId).toBe(peer1Id);
			}
		});

		test('should allow new peer after disconnect', () => {
			const ws1 = createMockWs();
			const ws2 = createMockWs();
			const ws3 = createMockWs();

			roomManager.handleJoin(ws1, 'room-1');
			roomManager.handleJoin(ws2, 'room-1');
			roomManager.handleDisconnect(ws1);
			roomManager.handleJoin(ws3, 'room-1');

			// ws3 should successfully join
			const msg = parseMessage(ws3);
			expect(msg.t).toBe('joined');
		});

		test('should clean up empty rooms', () => {
			const ws1 = createMockWs();
			roomManager.handleJoin(ws1, 'room-1');
			roomManager.handleDisconnect(ws1);

			const stats = roomManager.getRoomStats();
			expect(stats.roomCount).toBe(0);
			expect(stats.totalPeers).toBe(0);
		});
	});

	describe('handleSDP', () => {
		test('should relay SDP to target peer', () => {
			const ws1 = createMockWs();
			const ws2 = createMockWs();

			roomManager.handleJoin(ws1, 'room-1');
			roomManager.handleJoin(ws2, 'room-1');

			const msg2 = parseMessage(ws2);
			const peer2Id = msg2.t === 'joined' ? msg2.peerId : '';

			ws2.messages.length = 0; // Clear in-place

			const sdp: SDPDescription = { type: 'offer', sdp: 'test-sdp' };
			roomManager.handleSDP(ws1, peer2Id, sdp);

			const relayed = parseMessage(ws2);
			expect(relayed.t).toBe('sdp');
			if (relayed.t === 'sdp') {
				expect(relayed.description).toEqual(sdp);
				expect(relayed.from).toMatch(/^peer-/); // Server-injected from
			}
		});

		test('should broadcast SDP to all peers if no target', () => {
			const ws1 = createMockWs();
			const ws2 = createMockWs();

			roomManager.handleJoin(ws1, 'room-1');
			roomManager.handleJoin(ws2, 'room-1');

			ws2.messages.length = 0; // Clear in-place

			const sdp: SDPDescription = { type: 'offer', sdp: 'test-sdp' };
			roomManager.handleSDP(ws1, undefined, sdp);

			const relayed = parseMessage(ws2);
			expect(relayed.t).toBe('sdp');
		});

		test('should return error if not in a room', () => {
			const ws = createMockWs();
			const sdp: SDPDescription = { type: 'offer', sdp: 'test-sdp' };
			roomManager.handleSDP(ws, undefined, sdp);

			const msg = parseMessage(ws);
			expect(msg.t).toBe('error');
		});
	});

	describe('handleICE', () => {
		test('should relay ICE candidate to target peer', () => {
			const ws1 = createMockWs();
			const ws2 = createMockWs();

			roomManager.handleJoin(ws1, 'room-1');
			roomManager.handleJoin(ws2, 'room-1');

			const msg2 = parseMessage(ws2);
			const peer2Id = msg2.t === 'joined' ? msg2.peerId : '';

			ws2.messages.length = 0; // Clear in-place

			const candidate: ICECandidate = { candidate: 'test-candidate', sdpMid: '0' };
			roomManager.handleICE(ws1, peer2Id, candidate);

			const relayed = parseMessage(ws2);
			expect(relayed.t).toBe('ice');
			if (relayed.t === 'ice') {
				expect(relayed.candidate).toEqual(candidate);
				expect(relayed.from).toMatch(/^peer-/);
			}
		});
	});

	describe('handleMessage', () => {
		test('should parse and route join messages', () => {
			const ws = createMockWs();
			roomManager.handleMessage(ws, JSON.stringify({ t: 'join', roomId: 'room-1' }));

			const msg = parseMessage(ws);
			expect(msg.t).toBe('joined');
		});

		test('should parse and route sdp messages', () => {
			const ws1 = createMockWs();
			const ws2 = createMockWs();

			roomManager.handleJoin(ws1, 'room-1');
			roomManager.handleJoin(ws2, 'room-1');

			ws2.messages.length = 0; // Clear in-place

			const sdpMsg = {
				t: 'sdp',
				from: 'ignored', // Server should override this
				description: { type: 'offer', sdp: 'test' },
			};
			roomManager.handleMessage(ws1, JSON.stringify(sdpMsg));

			const relayed = parseMessage(ws2);
			expect(relayed.t).toBe('sdp');
		});

		test('should return error for invalid JSON', () => {
			const ws = createMockWs();
			roomManager.handleMessage(ws, 'not-json');

			const msg = parseMessage(ws);
			expect(msg.t).toBe('error');
			if (msg.t === 'error') {
				expect(msg.message).toContain('Invalid JSON');
			}
		});

		test('should return error for unknown message type', () => {
			const ws = createMockWs();
			roomManager.handleMessage(ws, JSON.stringify({ t: 'unknown' }));

			const msg = parseMessage(ws);
			expect(msg.t).toBe('error');
			if (msg.t === 'error') {
				expect(msg.message).toContain('Unknown message type');
			}
		});
	});

	describe('getRoomStats', () => {
		test('should return correct room and peer counts', () => {
			const ws1 = createMockWs();
			const ws2 = createMockWs();
			const ws3 = createMockWs();

			roomManager.handleJoin(ws1, 'room-1');
			roomManager.handleJoin(ws2, 'room-1');
			roomManager.handleJoin(ws3, 'room-2');

			const stats = roomManager.getRoomStats();
			expect(stats.roomCount).toBe(2);
			expect(stats.totalPeers).toBe(3);
		});
	});

	describe('maxPeers configuration', () => {
		test('should respect custom maxPeers limit', () => {
			const manager = new WebRTCRoomManager({ maxPeers: 3 });
			const ws1 = createMockWs();
			const ws2 = createMockWs();
			const ws3 = createMockWs();
			const ws4 = createMockWs();

			manager.handleJoin(ws1, 'room-1');
			manager.handleJoin(ws2, 'room-1');
			manager.handleJoin(ws3, 'room-1');
			manager.handleJoin(ws4, 'room-1');

			// ws4 should be rejected
			const msg = parseMessage(ws4);
			expect(msg.t).toBe('error');

			const stats = manager.getRoomStats();
			expect(stats.totalPeers).toBe(3);
		});
	});

	describe('callbacks', () => {
		test('should call onRoomCreated when first peer joins', () => {
			const events: string[] = [];
			const callbacks: WebRTCSignalingCallbacks = {
				onRoomCreated: (roomId) => events.push(`room-created:${roomId}`),
			};
			const manager = new WebRTCRoomManager({ callbacks });
			const ws = createMockWs();

			manager.handleJoin(ws, 'room-1');

			expect(events).toContain('room-created:room-1');
		});

		test('should call onPeerJoin when peer joins', () => {
			const events: string[] = [];
			const callbacks: WebRTCSignalingCallbacks = {
				onPeerJoin: (peerId, roomId) => events.push(`peer-join:${peerId}:${roomId}`),
			};
			const manager = new WebRTCRoomManager({ callbacks });
			const ws = createMockWs();

			manager.handleJoin(ws, 'room-1');

			expect(events.length).toBe(1);
			expect(events[0]).toMatch(/^peer-join:peer-.*:room-1$/);
		});

		test('should call onPeerLeave when peer disconnects', () => {
			const events: string[] = [];
			const callbacks: WebRTCSignalingCallbacks = {
				onPeerLeave: (peerId, roomId, reason) => events.push(`peer-leave:${peerId}:${roomId}:${reason}`),
			};
			const manager = new WebRTCRoomManager({ callbacks });
			const ws = createMockWs();

			manager.handleJoin(ws, 'room-1');
			manager.handleDisconnect(ws);

			expect(events.length).toBe(1);
			expect(events[0]).toMatch(/^peer-leave:peer-.*:room-1:disconnect$/);
		});

		test('should call onRoomDestroyed when last peer leaves', () => {
			const events: string[] = [];
			const callbacks: WebRTCSignalingCallbacks = {
				onRoomDestroyed: (roomId) => events.push(`room-destroyed:${roomId}`),
			};
			const manager = new WebRTCRoomManager({ callbacks });
			const ws = createMockWs();

			manager.handleJoin(ws, 'room-1');
			manager.handleDisconnect(ws);

			expect(events).toContain('room-destroyed:room-1');
		});

		test('should call onMessage for SDP messages', () => {
			const events: string[] = [];
			const callbacks: WebRTCSignalingCallbacks = {
				onMessage: (type, from, to, roomId) => events.push(`message:${type}:${from}:${to}:${roomId}`),
			};
			const manager = new WebRTCRoomManager({ callbacks });
			const ws1 = createMockWs();
			const ws2 = createMockWs();

			manager.handleJoin(ws1, 'room-1');
			manager.handleJoin(ws2, 'room-1');

			const sdp: SDPDescription = { type: 'offer', sdp: 'test-sdp' };
			manager.handleSDP(ws1, undefined, sdp);

			expect(events.length).toBe(1);
			expect(events[0]).toMatch(/^message:sdp:peer-.*:undefined:room-1$/);
		});

		test('should call onMessage for ICE messages', () => {
			const events: string[] = [];
			const callbacks: WebRTCSignalingCallbacks = {
				onMessage: (type, from, to, roomId) => events.push(`message:${type}:${from}:${to}:${roomId}`),
			};
			const manager = new WebRTCRoomManager({ callbacks });
			const ws1 = createMockWs();
			const ws2 = createMockWs();

			manager.handleJoin(ws1, 'room-1');
			manager.handleJoin(ws2, 'room-1');

			const candidate: ICECandidate = { candidate: 'test-candidate' };
			manager.handleICE(ws1, undefined, candidate);

			expect(events.length).toBe(1);
			expect(events[0]).toMatch(/^message:ice:peer-.*:undefined:room-1$/);
		});

		test('should call onError for room full errors', () => {
			const errors: Error[] = [];
			const callbacks: WebRTCSignalingCallbacks = {
				onError: (error) => errors.push(error),
			};
			const manager = new WebRTCRoomManager({ maxPeers: 1, callbacks });
			const ws1 = createMockWs();
			const ws2 = createMockWs();

			manager.handleJoin(ws1, 'room-1');
			manager.handleJoin(ws2, 'room-1');

			expect(errors.length).toBe(1);
			expect(errors[0].message).toContain('full');
		});
	});
});
