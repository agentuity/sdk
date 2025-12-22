/**
 * WebRTC signaling types shared between server and client.
 */

// =============================================================================
// Signaling Protocol Types
// =============================================================================

/**
 * SDP (Session Description Protocol) description for WebRTC negotiation.
 */
export interface SDPDescription {
	type: 'offer' | 'answer' | 'pranswer' | 'rollback';
	sdp?: string;
}

/**
 * ICE (Interactive Connectivity Establishment) candidate for NAT traversal.
 */
export interface ICECandidate {
	candidate?: string;
	sdpMid?: string | null;
	sdpMLineIndex?: number | null;
	usernameFragment?: string | null;
}

/**
 * Signaling message protocol for WebRTC peer communication.
 *
 * Message types:
 * - `join`: Client requests to join a room
 * - `joined`: Server confirms join with peer ID and existing peers
 * - `peer-joined`: Server notifies when another peer joins the room
 * - `peer-left`: Server notifies when a peer leaves the room
 * - `sdp`: SDP offer/answer exchange between peers
 * - `ice`: ICE candidate exchange between peers
 * - `error`: Error message from server
 */
export type SignalMessage =
	| { t: 'join'; roomId: string }
	| { t: 'joined'; peerId: string; roomId: string; peers: string[] }
	| { t: 'peer-joined'; peerId: string }
	| { t: 'peer-left'; peerId: string }
	| { t: 'sdp'; from: string; to?: string; description: SDPDescription }
	| { t: 'ice'; from: string; to?: string; candidate: ICECandidate }
	| { t: 'error'; message: string };

/**
 * @deprecated Use `SignalMessage` instead. Alias for backwards compatibility.
 */
export type SignalMsg = SignalMessage;

// =============================================================================
// Frontend State Machine Types
// =============================================================================

/**
 * WebRTC connection states for the frontend state machine.
 *
 * State transitions:
 * - idle → connecting: connect() called
 * - connecting → signaling: WebSocket opened, joined room
 * - connecting → idle: error or cancel
 * - signaling → negotiating: peer joined, SDP exchange started
 * - signaling → idle: hangup or WebSocket closed
 * - negotiating → connected: ICE complete, media flowing
 * - negotiating → signaling: peer left during negotiation
 * - negotiating → idle: error or hangup
 * - connected → negotiating: renegotiation needed
 * - connected → signaling: peer left
 * - connected → idle: hangup or WebSocket closed
 */
export type WebRTCConnectionState = 'idle' | 'connecting' | 'signaling' | 'negotiating' | 'connected';

/**
 * Reasons for disconnection.
 */
export type WebRTCDisconnectReason = 'hangup' | 'error' | 'peer-left' | 'timeout';

// =============================================================================
// Backend Signaling Callbacks
// =============================================================================

/**
 * Callbacks for WebRTC signaling server events.
 * All callbacks are optional - only subscribe to events you care about.
 */
export interface WebRTCSignalingCallbacks {
	/**
	 * Called when a new room is created.
	 * @param roomId - The room ID
	 */
	onRoomCreated?: (roomId: string) => void;

	/**
	 * Called when a room is destroyed (last peer left).
	 * @param roomId - The room ID
	 */
	onRoomDestroyed?: (roomId: string) => void;

	/**
	 * Called when a peer joins a room.
	 * @param peerId - The peer's ID
	 * @param roomId - The room ID
	 */
	onPeerJoin?: (peerId: string, roomId: string) => void;

	/**
	 * Called when a peer leaves a room.
	 * @param peerId - The peer's ID
	 * @param roomId - The room ID
	 * @param reason - Why the peer left
	 */
	onPeerLeave?: (peerId: string, roomId: string, reason: 'disconnect' | 'kicked') => void;

	/**
	 * Called when a signaling message is relayed.
	 * @param type - Message type ('sdp' or 'ice')
	 * @param from - Sender peer ID
	 * @param to - Target peer ID (undefined for broadcast)
	 * @param roomId - The room ID
	 */
	onMessage?: (type: 'sdp' | 'ice', from: string, to: string | undefined, roomId: string) => void;

	/**
	 * Called when an error occurs.
	 * @param error - The error that occurred
	 * @param peerId - The peer ID if applicable
	 * @param roomId - The room ID if applicable
	 */
	onError?: (error: Error, peerId?: string, roomId?: string) => void;
}
