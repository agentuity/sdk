import type { WebSocketConnection } from './router';

// WebRTC types for signaling (not using DOM types since this runs on server)
export interface SDPDescription {
	type: 'offer' | 'answer' | 'pranswer' | 'rollback';
	sdp?: string;
}

export interface ICECandidate {
	candidate?: string;
	sdpMid?: string | null;
	sdpMLineIndex?: number | null;
	usernameFragment?: string | null;
}

// Signaling message protocol
export type SignalMsg =
	| { t: 'join'; roomId: string }
	| { t: 'joined'; peerId: string; roomId: string; peers: string[] }
	| { t: 'peer-joined'; peerId: string }
	| { t: 'peer-left'; peerId: string }
	| { t: 'sdp'; from: string; to?: string; description: SDPDescription }
	| { t: 'ice'; from: string; to?: string; candidate: ICECandidate }
	| { t: 'error'; message: string };

export interface WebRTCOptions {
	/** Maximum number of peers per room (default: 2) */
	maxPeers?: number;
}

interface PeerConnection {
	ws: WebSocketConnection;
	roomId: string;
}

/**
 * In-memory room manager for WebRTC signaling.
 * Tracks rooms and their connected peers.
 */
export class WebRTCRoomManager {
	// roomId -> Map<peerId, PeerConnection>
	private rooms = new Map<string, Map<string, PeerConnection>>();
	// ws -> peerId (reverse lookup for cleanup)
	private wsToPeer = new Map<WebSocketConnection, { peerId: string; roomId: string }>();
	private maxPeers: number;
	private peerIdCounter = 0;

	constructor(options?: WebRTCOptions) {
		this.maxPeers = options?.maxPeers ?? 2;
	}

	private generatePeerId(): string {
		return `peer-${Date.now()}-${++this.peerIdCounter}`;
	}

	private send(ws: WebSocketConnection, msg: SignalMsg): void {
		ws.send(JSON.stringify(msg));
	}

	private broadcast(roomId: string, msg: SignalMsg, excludePeerId?: string): void {
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

		// Create room if it doesn't exist
		if (!room) {
			room = new Map();
			this.rooms.set(roomId, room);
		}

		// Check room capacity
		if (room.size >= this.maxPeers) {
			this.send(ws, { t: 'error', message: `Room is full (max ${this.maxPeers} peers)` });
			return;
		}

		const peerId = this.generatePeerId();
		const existingPeers = Array.from(room.keys());

		// Add peer to room
		room.set(peerId, { ws, roomId });
		this.wsToPeer.set(ws, { peerId, roomId });

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

			// Notify remaining peers
			this.broadcast(roomId, { t: 'peer-left', peerId });

			// Clean up empty room
			if (room.size === 0) {
				this.rooms.delete(roomId);
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
			this.send(ws, { t: 'error', message: 'Not in a room' });
			return;
		}

		const { peerId, roomId } = peerInfo;
		const room = this.rooms.get(roomId);
		if (!room) return;

		// Server injects 'from' to prevent spoofing
		const msg: SignalMsg = { t: 'sdp', from: peerId, description };

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
			this.send(ws, { t: 'error', message: 'Not in a room' });
			return;
		}

		const { peerId, roomId } = peerInfo;
		const room = this.rooms.get(roomId);
		if (!room) return;

		// Server injects 'from' to prevent spoofing
		const msg: SignalMsg = { t: 'ice', from: peerId, candidate };

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
		let msg: SignalMsg;
		try {
			msg = JSON.parse(data);
		} catch {
			this.send(ws, { t: 'error', message: 'Invalid JSON' });
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
