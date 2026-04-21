/**
 * Standalone run script for WebRTC demo
 *
 * Demonstrates: WebRTC signaling flow using the SDK room manager.
 *
 * Usage: bun run src/run/webrtc.ts '{}'
 */
import { WebRTCRoomManager, type WebSocketConnection } from '@agentuity/runtime';

try {
	const log: string[] = [];
	const sentMessages = new Map<string, string[]>();

	const manager = new WebRTCRoomManager({
		maxPeers: 2,
		callbacks: {
			onRoomCreated: (roomId) => log.push(`[Signal] Room "${roomId}" created`),
			onPeerJoin: (peerId, roomId) => log.push(`[Signal] ${peerId} joined "${roomId}"`),
			onPeerLeave: (peerId, roomId, reason) =>
				log.push(`[Signal] ${peerId} left "${roomId}" (${reason})`),
			onRoomDestroyed: (roomId) => log.push(`[Signal] Room "${roomId}" destroyed`),
			onMessage: (type, from, to, roomId) =>
				log.push(`[Signal] Relaying ${type} from ${from} to ${to ?? 'all'} in "${roomId}"`),
		},
	});

	function createMockSocket(name: string): WebSocketConnection {
		const messages: string[] = [];
		sentMessages.set(name, messages);

		return {
			onOpen() {},
			onMessage() {},
			onClose() {},
			send(data) {
				const text =
					typeof data === 'string' ? data : new TextDecoder().decode(data as Uint8Array);
				messages.push(text);
				const parsed = JSON.parse(text) as { t?: string; peerId?: string };
				log.push(
					`[${name}] Received ${parsed.t ?? 'message'}${parsed.peerId ? ` (peer ${parsed.peerId})` : ''}`
				);
			},
		};
	}

	const peerA = createMockSocket('Peer A');
	const peerB = createMockSocket('Peer B');

	console.log('---OUTPUT---');
	console.log('WebRTC Signaling Flow');
	console.log('=====================');
	console.log('');

	console.log('Step 1: Peer A joins room "demo-room"');
	manager.handleMessage(peerA, JSON.stringify({ t: 'join', roomId: 'demo-room' }));
	for (const message of log.splice(0)) console.log(`  ${message}`);
	console.log('');

	console.log('Step 2: Peer B joins room "demo-room"');
	manager.handleMessage(peerB, JSON.stringify({ t: 'join', roomId: 'demo-room' }));
	for (const message of log.splice(0)) console.log(`  ${message}`);
	console.log('');

	const peerAMessages = sentMessages.get('Peer A') ?? [];
	const peerBMessages = sentMessages.get('Peer B') ?? [];
	const peerAJoin = JSON.parse(peerAMessages[0] ?? '{}') as { peerId?: string };
	const peerBJoin = JSON.parse(peerBMessages[0] ?? '{}') as { peerId?: string };
	const peerAId = peerAJoin.peerId;
	const peerBId = peerBJoin.peerId;

	if (!peerAId || !peerBId) {
		throw new Error('Failed to capture assigned peer IDs');
	}

	console.log('Step 3: Peer B sends SDP offer to Peer A');
	manager.handleMessage(
		peerB,
		JSON.stringify({
			t: 'sdp',
			to: peerAId,
			description: { type: 'offer', sdp: 'v=0\\r\\no=- 123 1 IN IP4 0.0.0.0...' },
		})
	);
	for (const message of log.splice(0)) console.log(`  ${message}`);
	console.log('');

	console.log('Step 4: Peer A sends SDP answer to Peer B');
	manager.handleMessage(
		peerA,
		JSON.stringify({
			t: 'sdp',
			to: peerBId,
			description: { type: 'answer', sdp: 'v=0\\r\\no=- 456 1 IN IP4 0.0.0.0...' },
		})
	);
	for (const message of log.splice(0)) console.log(`  ${message}`);
	console.log('');

	console.log('Step 5: Both peers exchange ICE candidates');
	manager.handleMessage(
		peerB,
		JSON.stringify({
			t: 'ice',
			to: peerAId,
			candidate: {
				candidate: 'candidate:1 1 udp 2113937151 192.168.1.5 54321 typ host',
				sdpMid: '0',
			},
		})
	);
	manager.handleMessage(
		peerA,
		JSON.stringify({
			t: 'ice',
			to: peerBId,
			candidate: {
				candidate: 'candidate:2 1 udp 2113937151 192.168.1.10 54322 typ host',
				sdpMid: '0',
			},
		})
	);
	for (const message of log.splice(0)) console.log(`  ${message}`);
	console.log('');

	console.log('Step 6: Both peers disconnect');
	manager.handleDisconnect(peerB);
	manager.handleDisconnect(peerA);
	for (const message of log.splice(0)) console.log(`  ${message}`);
	console.log('');

	const stats = manager.getRoomStats();
	console.log(`Final state: ${stats.roomCount} rooms, ${stats.totalPeers} peers`);
	console.log('');
	console.log('This simulates the signaling manager behind the webrtc() route.');
	console.log('After that, media and data flow directly between browsers.');
	console.log('---OUTPUT---');
} catch (error) {
	console.log('---OUTPUT---');
	console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
	console.log('---OUTPUT---');
}
