/**
 * Standalone run script for WebRTC demo
 *
 * Demonstrates: WebRTC signaling protocol using WebRTCRoomManager
 * Walks through the signaling flow step-by-step with educational output.
 *
 * Usage: bun run src/run/webrtc.ts
 */
import { WebRTCRoomManager } from '@agentuity/runtime';

try {
	const log: string[] = [];
	const sentMessages = new Map<string, string[]>();

	// Create room manager with logging callbacks
	const manager = new WebRTCRoomManager({
		maxPeers: 2,
		callbacks: {
			onRoomCreated: (roomId) => log.push(`  [Signal] Room "${roomId}" created`),
			onPeerJoin: (peerId, roomId) => log.push(`  [Signal] ${peerId} joined room "${roomId}"`),
			onPeerLeave: (peerId, roomId, reason) =>
				log.push(`  [Signal] ${peerId} left room "${roomId}" (${reason})`),
			onRoomDestroyed: (roomId) => log.push(`  [Signal] Room "${roomId}" destroyed`),
			onMessage: (type, from, to, roomId) =>
				log.push(`  [Signal] Relaying ${type} from ${from} to ${to ?? 'all'} in "${roomId}"`),
		},
	});

	// Create mock WebSocket connections
	function createMockWS(name: string) {
		const msgs: string[] = [];
		sentMessages.set(name, msgs);
		return {
			onOpen: () => {},
			onMessage: () => {},
			onClose: () => {},
			send: (data: string | ArrayBuffer | Uint8Array) => {
				const str = typeof data === 'string' ? data : new TextDecoder().decode(data as Uint8Array);
				msgs.push(str);
				const parsed = JSON.parse(str);
				log.push(`  [${name}] Received: ${parsed.t}${parsed.peerId ? ` (assigned ${parsed.peerId})` : ''}`);
			},
		};
	}

	const peerA = createMockWS('Peer A');
	const peerB = createMockWS('Peer B');

	console.log('---OUTPUT---');
	console.log('WebRTC Signaling Flow');
	console.log('=====================');
	console.log('');

	// Step 1: Peer A joins room
	console.log('Step 1: Peer A joins room "demo-room"');
	manager.handleMessage(peerA, JSON.stringify({ t: 'join', roomId: 'demo-room' }));
	for (const msg of log.splice(0)) console.log(msg);
	console.log('');

	// Step 2: Peer B joins room
	console.log('Step 2: Peer B joins room "demo-room"');
	manager.handleMessage(peerB, JSON.stringify({ t: 'join', roomId: 'demo-room' }));
	for (const msg of log.splice(0)) console.log(msg);
	console.log('');

	// Get peer IDs from the join responses
	const peerAMsgs = sentMessages.get('Peer A') ?? [];
	const peerBMsgs = sentMessages.get('Peer B') ?? [];
	const peerAJoined = JSON.parse(peerAMsgs[0]!);
	const peerBJoined = JSON.parse(peerBMsgs[0]!);
	const peerAId = peerAJoined.peerId;
	const peerBId = peerBJoined.peerId;

	// Step 3: Peer B sends SDP offer to Peer A
	console.log('Step 3: Peer B sends SDP offer to Peer A');
	console.log('  (The late joiner initiates the offer)');
	manager.handleMessage(
		peerB,
		JSON.stringify({
			t: 'sdp',
			to: peerAId,
			description: { type: 'offer', sdp: 'v=0\\r\\no=- 123 1 IN IP4 0.0.0.0...' },
		})
	);
	for (const msg of log.splice(0)) console.log(msg);
	console.log('');

	// Step 4: Peer A sends SDP answer to Peer B
	console.log('Step 4: Peer A sends SDP answer to Peer B');
	manager.handleMessage(
		peerA,
		JSON.stringify({
			t: 'sdp',
			to: peerBId,
			description: { type: 'answer', sdp: 'v=0\\r\\no=- 456 1 IN IP4 0.0.0.0...' },
		})
	);
	for (const msg of log.splice(0)) console.log(msg);
	console.log('');

	// Step 5: Exchange ICE candidates
	console.log('Step 5: Peers exchange ICE candidates');
	console.log('  (Network path discovery for direct connection)');
	manager.handleMessage(
		peerB,
		JSON.stringify({
			t: 'ice',
			to: peerAId,
			candidate: { candidate: 'candidate:1 1 udp 2113937151 192.168.1.5 54321 typ host', sdpMid: '0' },
		})
	);
	manager.handleMessage(
		peerA,
		JSON.stringify({
			t: 'ice',
			to: peerBId,
			candidate: { candidate: 'candidate:2 1 udp 2113937151 192.168.1.10 54322 typ host', sdpMid: '0' },
		})
	);
	for (const msg of log.splice(0)) console.log(msg);
	console.log('');

	// Step 6: Disconnect
	console.log('Step 6: Both peers disconnect, room is destroyed');
	manager.handleDisconnect(peerB);
	manager.handleDisconnect(peerA);
	for (const msg of log.splice(0)) console.log(msg);
	console.log('');

	// Summary
	const stats = manager.getRoomStats();
	console.log(`Final state: ${stats.roomCount} rooms, ${stats.totalPeers} peers`);
	console.log('');
	console.log('The signaling server only relays discovery messages.');
	console.log('Once connected, audio/video/data flows directly between peers.');
} catch (error) {
	console.log('---OUTPUT---');
	console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
}
