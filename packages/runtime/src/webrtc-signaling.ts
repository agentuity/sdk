import type { WebSocketConnection } from './router';
import type {
	SDPDescription,
	ICECandidate,
	SignalMessage,
	WebRTCSignalingCallbacks,
} from '@agentuity/core';

export type { SDPDescription, ICECandidate, SignalMessage, WebRTCSignalingCallbacks };

/**
 * @deprecated Use `SignalMessage` instead. Alias for backwards compatibility.
 */
export type SignalMsg = SignalMessage;

/**
 * Configuration options for WebRTC signaling.
 */
export interface WebRTCOptions {
	/** Maximum number of peers per room (default: 2) */
	maxPeers?: number;
	/** Callbacks for signaling events */
	callbacks?: WebRTCSignalingCallbacks;
}

interface PeerConnection {
	ws: WebSocketConnection;
	roomId: string;
}

/**
 * In-memory room manager for WebRTC signaling.
 * Tracks rooms and their connected peers.
 *
 * @example
 * ```ts
 * // Basic usage
 * router.webrtc('/call');
 *
 * // With callbacks for monitoring
 * router.webrtc('/call', {
 *   maxPeers: 2,
 *   callbacks: {
 *     onRoomCreated: (roomId) => console.log(`Room ${roomId} created`),
 *     onPeerJoin: (peerId, roomId) => console.log(`${peerId} joined ${roomId}`),
 *     onPeerLeave: (peerId, roomId, reason) => {
 *       analytics.track('peer_left', { peerId, roomId, reason });
 *     },
 *     onMessage: (type, from, to, roomId) => {
 *       metrics.increment(`webrtc.${type}`);
 *     },
 *   },
 * });
 * ```
 */
export class WebRTCRoomManager {
	// roomId -> Map<peerId, PeerConnection>
	private rooms = new Map<string, Map<string, PeerConnection>>();
	// ws -> peerId (reverse lookup for cleanup)
	private wsToPeer = new Map<WebSocketConnection, { peerId: string; roomId: string }>();
	private maxPeers: number;
	private peerIdCounter = 0;
	private callbacks: WebRTCSignalingCallbacks;

	constructor(options?: WebRTCOptions) {
		this.maxPeers = options?.maxPeers ?? 2;
		this.callbacks = options?.callbacks ?? {};
	}

	private generatePeerId(): string {
		return `peer-${Date.now()}-${++this.peerIdCounter}`;
	}

	private send(ws: WebSocketConnection, msg: SignalMessage): void {
		ws.send(JSON.stringify(msg));
	}

	private broadcast(roomId: string, msg: SignalMessage, excludePeerId?: string): void {
		const room = this.rooms.get(roomId);
		if (!room) return;

		for (const [peerId, peer] of room) {
			if (peerId !== excludePeerId) {
				this.send(peer.ws, msg);
			}
		}
	}

	/**
	 * Handle a peer joining a room
	 */
	handleJoin(ws: WebSocketConnection, roomId: string): void {
		let room = this.rooms.get(roomId);
		const isNewRoom = !room;

		// Create room if it doesn't exist
		if (!room) {
			room = new Map();
			this.rooms.set(roomId, room);
		}

		// Check room capacity
		if (room.size >= this.maxPeers) {
			const error = new Error(`Room is full (max ${this.maxPeers} peers)`);
			this.callbacks.onError?.(error, undefined, roomId);
			this.send(ws, { t: 'error', message: error.message });
			return;
		}

		const peerId = this.generatePeerId();
		const existingPeers = Array.from(room.keys());

		// Add peer to room
		room.set(peerId, { ws, roomId });
		this.wsToPeer.set(ws, { peerId, roomId });

		// Fire callbacks
		if (isNewRoom) {
			this.callbacks.onRoomCreated?.(roomId);
		}
		this.callbacks.onPeerJoin?.(peerId, roomId);

		// Send joined confirmation with list of existing peers
		this.send(ws, { t: 'joined', peerId, roomId, peers: existingPeers });

		// Notify existing peers about new peer
		this.broadcast(roomId, { t: 'peer-joined', peerId }, peerId);
	}

	/**
	 * Handle a peer disconnecting
	 */
	handleDisconnect(ws: WebSocketConnection): void {
		const peerInfo = this.wsToPeer.get(ws);
		if (!peerInfo) return;

		const { peerId, roomId } = peerInfo;
		const room = this.rooms.get(roomId);

		if (room) {
			room.delete(peerId);

			// Fire callback
			this.callbacks.onPeerLeave?.(peerId, roomId, 'disconnect');

			// Notify remaining peers
			this.broadcast(roomId, { t: 'peer-left', peerId });

			// Clean up empty room
			if (room.size === 0) {
				this.rooms.delete(roomId);
				this.callbacks.onRoomDestroyed?.(roomId);
			}
		}

		this.wsToPeer.delete(ws);
	}

	/**
	 * Relay SDP message to target peer(s)
	 */
	handleSDP(ws: WebSocketConnection, to: string | undefined, description: SDPDescription): void {
		const peerInfo = this.wsToPeer.get(ws);
		if (!peerInfo) {
			const error = new Error('Not in a room');
			this.callbacks.onError?.(error);
			this.send(ws, { t: 'error', message: error.message });
			return;
		}

		const { peerId, roomId } = peerInfo;
		const room = this.rooms.get(roomId);
		if (!room) return;

		// Fire callback
		this.callbacks.onMessage?.('sdp', peerId, to, roomId);

		// Server injects 'from' to prevent spoofing
		const msg: SignalMessage = { t: 'sdp', from: peerId, description };

		if (to) {
			// Send to specific peer
			const targetPeer = room.get(to);
			if (targetPeer) {
				this.send(targetPeer.ws, msg);
			}
		} else {
			// Broadcast to all peers in room
			this.broadcast(roomId, msg, peerId);
		}
	}

	/**
	 * Relay ICE candidate to target peer(s)
	 */
	handleICE(ws: WebSocketConnection, to: string | undefined, candidate: ICECandidate): void {
		const peerInfo = this.wsToPeer.get(ws);
		if (!peerInfo) {
			const error = new Error('Not in a room');
			this.callbacks.onError?.(error);
			this.send(ws, { t: 'error', message: error.message });
			return;
		}

		const { peerId, roomId } = peerInfo;
		const room = this.rooms.get(roomId);
		if (!room) return;

		// Fire callback
		this.callbacks.onMessage?.('ice', peerId, to, roomId);

		// Server injects 'from' to prevent spoofing
		const msg: SignalMessage = { t: 'ice', from: peerId, candidate };

		if (to) {
			// Send to specific peer
			const targetPeer = room.get(to);
			if (targetPeer) {
				this.send(targetPeer.ws, msg);
			}
		} else {
			// Broadcast to all peers in room
			this.broadcast(roomId, msg, peerId);
		}
	}

	/**
	 * Handle incoming signaling message
	 */
	handleMessage(ws: WebSocketConnection, data: string): void {
		let msg: SignalMessage;
		try {
			msg = JSON.parse(data);
		} catch {
			const error = new Error('Invalid JSON');
			this.callbacks.onError?.(error);
			this.send(ws, { t: 'error', message: error.message });
			return;
		}

		switch (msg.t) {
			case 'join':
				this.handleJoin(ws, msg.roomId);
				break;
			case 'sdp':
				this.handleSDP(ws, msg.to, msg.description);
				break;
			case 'ice':
				this.handleICE(ws, msg.to, msg.candidate);
				break;
			default:
				this.send(ws, {
					t: 'error',
					message: `Unknown message type: ${(msg as { t: string }).t}`,
				});
		}
	}

	/**
	 * Get room stats for debugging
	 */
	getRoomStats(): { roomCount: number; totalPeers: number } {
		let totalPeers = 0;
		for (const room of this.rooms.values()) {
			totalPeers += room.size;
		}
		return { roomCount: this.rooms.size, totalPeers };
	}
}
