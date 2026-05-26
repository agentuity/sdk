/**
 * WebRTC Route - lightweight signaling for the SDK Explorer demo.
 *
 * GET /          - Returns route info and feature list
 * WS /signal     - Relays WebRTC offer/answer/candidate messages between two peers
 */
import { Hono } from 'hono';
import { upgradeWebSocket } from 'hono/bun';

interface LoggerLike {
	info(message: string, data?: unknown): void;
}

interface RouteEnv {
	Variables: {
		logger?: LoggerLike;
	};
}

interface PeerSocket {
	send(data: string): void;
}

interface Peer {
	readonly id: string;
	readonly ws: PeerSocket;
}

interface SignalMessage {
	readonly type: 'signal';
	readonly data: unknown;
}

const rooms = new Map<string, Map<string, Peer>>();
const MAX_PEERS_PER_ROOM = 2;

function createPeerId(): string {
	return crypto.randomUUID().slice(0, 8);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function parseClientMessage(data: unknown): SignalMessage | null {
	if (typeof data !== 'string') {
		return null;
	}

	try {
		const parsed: unknown = JSON.parse(data);
		if (!isRecord(parsed) || parsed.type !== 'signal') {
			return null;
		}

		return {
			type: 'signal',
			data: parsed.data,
		};
	} catch {
		return null;
	}
}

function sendJson(ws: PeerSocket, value: unknown): void {
	ws.send(JSON.stringify(value));
}

function broadcast(room: Map<string, Peer>, fromPeerId: string, value: unknown): void {
	for (const peer of room.values()) {
		if (peer.id === fromPeerId) {
			continue;
		}

		try {
			sendJson(peer.ws, value);
		} catch {
			room.delete(peer.id);
		}
	}
}

function getOrCreateRoom(roomId: string): Map<string, Peer> {
	const existing = rooms.get(roomId);
	if (existing) {
		return existing;
	}

	const room = new Map<string, Peer>();
	rooms.set(roomId, room);
	return room;
}

const router = new Hono<RouteEnv>()
	.get('/', (c) => {
		return c.json({
			name: 'WebRTC Signaling',
			description: 'Connect to /api/webrtc/signal?room=<room-id> to relay WebRTC signaling',
			features: ['Two-peer room joining', 'SDP offer/answer relay', 'ICE candidate relay'],
		});
	})
	.get(
		'/signal',
		upgradeWebSocket((c) => {
			const roomId = c.req.query('room')?.trim() || 'default';
			const room = getOrCreateRoom(roomId);
			const peerId = createPeerId();
			let peer: Peer | undefined;
			let joined = false;

			return {
				onOpen(_event, ws) {
					if (room.size >= MAX_PEERS_PER_ROOM) {
						sendJson(ws, {
							type: 'room-full',
							message: 'This demo room already has two peers.',
						});
						return;
					}

					peer = { id: peerId, ws };
					const firstPeer = room.size === 0;
					room.set(peerId, peer);
					joined = true;

					c.var.logger?.info('WebRTC peer joined', {
						roomId,
						peerId,
						peerCount: room.size,
					});

					sendJson(ws, {
						type: 'joined',
						roomId,
						peerId,
						waiting: firstPeer,
					});

					if (!firstPeer) {
						broadcast(room, peerId, {
							type: 'peer-joined',
							peerId,
							initiator: true,
						});
					}
				},

				onMessage(event, ws) {
					if (!joined || !peer) {
						return;
					}

					const message = parseClientMessage(event.data);
					if (!message) {
						sendJson(ws, {
							type: 'error',
							message: 'Expected a WebRTC signal message.',
						});
						return;
					}

					broadcast(room, peerId, {
						type: 'signal',
						from: peerId,
						data: message.data,
					});
				},

				onClose() {
					if (!joined) {
						return;
					}

					room.delete(peerId);
					if (room.size === 0) {
						rooms.delete(roomId);
					} else {
						broadcast(room, peerId, {
							type: 'peer-left',
							peerId,
						});
					}

					c.var.logger?.info('WebRTC peer left', {
						roomId,
						peerId,
						peerCount: room.size,
					});
				},
			};
		})
	);

export default router;
