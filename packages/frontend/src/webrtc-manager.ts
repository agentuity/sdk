import type {
	SignalMessage,
	WebRTCConnectionState,
	WebRTCDisconnectReason,
} from '@agentuity/core';

/**
 * Callbacks for WebRTC client state changes and events.
 * All callbacks are optional - only subscribe to events you care about.
 */
export interface WebRTCClientCallbacks {
	/**
	 * Called on every state transition.
	 * @param from - Previous state
	 * @param to - New state
	 * @param reason - Optional reason for the transition
	 */
	onStateChange?: (from: WebRTCConnectionState, to: WebRTCConnectionState, reason?: string) => void;

	/**
	 * Called when connection is fully established.
	 */
	onConnect?: () => void;

	/**
	 * Called when disconnected from the call.
	 * @param reason - Why the disconnection happened
	 */
	onDisconnect?: (reason: WebRTCDisconnectReason) => void;

	/**
	 * Called when local media stream is acquired.
	 * @param stream - The local MediaStream
	 */
	onLocalStream?: (stream: MediaStream) => void;

	/**
	 * Called when remote media stream is received.
	 * @param stream - The remote MediaStream
	 */
	onRemoteStream?: (stream: MediaStream) => void;

	/**
	 * Called when a new track is added to a stream.
	 * @param track - The added track
	 * @param stream - The stream containing the track
	 */
	onTrackAdded?: (track: MediaStreamTrack, stream: MediaStream) => void;

	/**
	 * Called when a track is removed from a stream.
	 * @param track - The removed track
	 */
	onTrackRemoved?: (track: MediaStreamTrack) => void;

	/**
	 * Called when a peer joins the room.
	 * @param peerId - The peer's ID
	 */
	onPeerJoined?: (peerId: string) => void;

	/**
	 * Called when a peer leaves the room.
	 * @param peerId - The peer's ID
	 */
	onPeerLeft?: (peerId: string) => void;

	/**
	 * Called when SDP/ICE negotiation starts.
	 */
	onNegotiationStart?: () => void;

	/**
	 * Called when SDP/ICE negotiation completes successfully.
	 */
	onNegotiationComplete?: () => void;

	/**
	 * Called for each ICE candidate generated.
	 * @param candidate - The ICE candidate
	 */
	onIceCandidate?: (candidate: RTCIceCandidateInit) => void;

	/**
	 * Called when ICE connection state changes.
	 * @param state - The new ICE connection state
	 */
	onIceStateChange?: (state: string) => void;

	/**
	 * Called when an error occurs.
	 * @param error - The error that occurred
	 * @param state - The state when the error occurred
	 */
	onError?: (error: Error, state: WebRTCConnectionState) => void;
}

/**
 * @deprecated Use `WebRTCConnectionState` from @agentuity/core instead.
 */
export type WebRTCStatus = 'disconnected' | 'connecting' | 'signaling' | 'connected';

/**
 * @deprecated Use `WebRTCClientCallbacks` from @agentuity/core instead.
 */
export interface WebRTCCallbacks {
	onLocalStream?: (stream: MediaStream) => void;
	onRemoteStream?: (stream: MediaStream) => void;
	onStatusChange?: (status: WebRTCStatus) => void;
	onError?: (error: Error) => void;
	onPeerJoined?: (peerId: string) => void;
	onPeerLeft?: (peerId: string) => void;
}

/**
 * Options for WebRTCManager
 */
export interface WebRTCManagerOptions {
	/** WebSocket signaling URL */
	signalUrl: string;
	/** Room ID to join */
	roomId: string;
	/** Whether this peer is "polite" in perfect negotiation (default: true) */
	polite?: boolean;
	/** ICE servers configuration */
	iceServers?: RTCIceServer[];
	/** Media constraints for getUserMedia */
	media?: MediaStreamConstraints;
	/**
	 * Callbacks for state changes and events.
	 * Supports both legacy WebRTCCallbacks and new WebRTCClientCallbacks.
	 */
	callbacks?: WebRTCClientCallbacks;
}

/**
 * WebRTC manager state
 */
export interface WebRTCManagerState {
	state: WebRTCConnectionState;
	peerId: string | null;
	remotePeerId: string | null;
	isAudioMuted: boolean;
	isVideoMuted: boolean;
	/** @deprecated Use `state` instead */
	status: WebRTCStatus;
}

/**
 * Default ICE servers (public STUN servers)
 */
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
	{ urls: 'stun:stun.l.google.com:19302' },
	{ urls: 'stun:stun1.l.google.com:19302' },
];

/**
 * Map new state to legacy status for backwards compatibility
 */
function stateToStatus(state: WebRTCConnectionState): WebRTCStatus {
	if (state === 'idle') return 'disconnected';
	if (state === 'negotiating') return 'connecting';
	return state as WebRTCStatus;
}

/**
 * Framework-agnostic WebRTC connection manager with signaling,
 * perfect negotiation, and media stream handling.
 *
 * Uses an explicit state machine for connection lifecycle:
 * - idle: No resources allocated, ready to connect
 * - connecting: Acquiring media + opening WebSocket
 * - signaling: In room, waiting for peer
 * - negotiating: SDP/ICE exchange in progress
 * - connected: Media flowing
 *
 * @example
 * ```ts
 * const manager = new WebRTCManager({
 *   signalUrl: 'wss://example.com/call/signal',
 *   roomId: 'my-room',
 *   callbacks: {
 *     onStateChange: (from, to, reason) => {
 *       console.log(`State: ${from} → ${to}`, reason);
 *     },
 *     onConnect: () => console.log('Connected!'),
 *     onDisconnect: (reason) => console.log('Disconnected:', reason),
 *     onLocalStream: (stream) => { localVideo.srcObject = stream; },
 *     onRemoteStream: (stream) => { remoteVideo.srcObject = stream; },
 *     onError: (error, state) => console.error(`Error in ${state}:`, error),
 *   },
 * });
 *
 * await manager.connect();
 * ```
 */
export class WebRTCManager {
	private ws: WebSocket | null = null;
	private pc: RTCPeerConnection | null = null;
	private localStream: MediaStream | null = null;
	private remoteStream: MediaStream | null = null;

	private peerId: string | null = null;
	private remotePeerId: string | null = null;
	private isAudioMuted = false;
	private isVideoMuted = false;

	// State machine
	private _state: WebRTCConnectionState = 'idle';

	// Perfect negotiation state
	private makingOffer = false;
	private ignoreOffer = false;
	private polite: boolean;

	// ICE candidate buffering - buffer until remote description is set
	private pendingCandidates: RTCIceCandidateInit[] = [];
	private hasRemoteDescription = false;

	private options: WebRTCManagerOptions;
	private callbacks: WebRTCClientCallbacks;

	constructor(options: WebRTCManagerOptions) {
		this.options = options;
		this.polite = options.polite ?? true;
		this.callbacks = options.callbacks ?? {};
	}

	/**
	 * Current connection state
	 */
	get state(): WebRTCConnectionState {
		return this._state;
	}

	/**
	 * Get current manager state
	 */
	getState(): WebRTCManagerState {
		return {
			state: this._state,
			status: stateToStatus(this._state),
			peerId: this.peerId,
			remotePeerId: this.remotePeerId,
			isAudioMuted: this.isAudioMuted,
			isVideoMuted: this.isVideoMuted,
		};
	}

	/**
	 * Get local media stream
	 */
	getLocalStream(): MediaStream | null {
		return this.localStream;
	}

	/**
	 * Get remote media stream
	 */
	getRemoteStream(): MediaStream | null {
		return this.remoteStream;
	}

	/**
	 * Transition to a new state with callback notifications
	 */
	private setState(newState: WebRTCConnectionState, reason?: string): void {
		const prevState = this._state;
		if (prevState === newState) return;

		this._state = newState;

		// Fire state change callback
		this.callbacks.onStateChange?.(prevState, newState, reason);

		// Fire connect/disconnect callbacks
		if (newState === 'connected' && prevState !== 'connected') {
			this.callbacks.onConnect?.();
			this.callbacks.onNegotiationComplete?.();
		}

		if (newState === 'idle' && prevState !== 'idle') {
			const disconnectReason = this.mapToDisconnectReason(reason);
			this.callbacks.onDisconnect?.(disconnectReason);
		}

		if (newState === 'negotiating' && prevState !== 'negotiating') {
			this.callbacks.onNegotiationStart?.();
		}
	}

	private mapToDisconnectReason(reason?: string): WebRTCDisconnectReason {
		if (reason === 'hangup') return 'hangup';
		if (reason === 'peer-left') return 'peer-left';
		if (reason === 'timeout') return 'timeout';
		return 'error';
	}

	private send(msg: SignalMessage): void {
		if (this.ws?.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(msg));
		}
	}

	/**
	 * Connect to the signaling server and start the call
	 */
	async connect(): Promise<void> {
		if (this._state !== 'idle') return;

		this.setState('connecting', 'connect() called');

		try {
			// Get local media
			const mediaConstraints = this.options.media ?? { video: true, audio: true };
			this.localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
			this.callbacks.onLocalStream?.(this.localStream);

			// Connect to signaling server
			this.ws = new WebSocket(this.options.signalUrl);

			this.ws.onopen = () => {
				this.setState('signaling', 'WebSocket opened');
				this.send({ t: 'join', roomId: this.options.roomId });
			};

			this.ws.onmessage = (event) => {
				const msg = JSON.parse(event.data) as SignalMessage;
				this.handleSignalingMessage(msg);
			};

			this.ws.onerror = () => {
				const error = new Error('WebSocket connection error');
				this.callbacks.onError?.(error, this._state);
			};

			this.ws.onclose = () => {
				if (this._state !== 'idle') {
					this.setState('idle', 'WebSocket closed');
				}
			};
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			this.callbacks.onError?.(error, this._state);
			this.setState('idle', 'error');
		}
	}

	private async handleSignalingMessage(msg: SignalMessage): Promise<void> {
		switch (msg.t) {
			case 'joined':
				this.peerId = msg.peerId;
				// If there's already a peer in the room, we're the offerer (impolite)
				if (msg.peers.length > 0) {
					this.remotePeerId = msg.peers[0];
					// Late joiner is impolite (makes the offer, wins collisions)
					this.polite = this.options.polite ?? false;
					await this.createPeerConnection();
					this.setState('negotiating', 'creating offer');
					await this.createOffer();
				} else {
					// First peer is polite (waits for offers, yields on collision)
					this.polite = this.options.polite ?? true;
				}
				break;

			case 'peer-joined':
				this.remotePeerId = msg.peerId;
				this.callbacks.onPeerJoined?.(msg.peerId);
				// New peer joined, wait for their offer (they initiate)
				await this.createPeerConnection();
				break;

			case 'peer-left':
				this.callbacks.onPeerLeft?.(msg.peerId);
				if (msg.peerId === this.remotePeerId) {
					this.remotePeerId = null;
					this.closePeerConnection();
					this.setState('signaling', 'peer-left');
				}
				break;

			case 'sdp':
				if (this._state === 'signaling') {
					this.setState('negotiating', 'received SDP');
				}
				await this.handleRemoteSDP(msg.description);
				break;

			case 'ice':
				await this.handleRemoteICE(msg.candidate);
				break;

			case 'error':
				const error = new Error(msg.message);
				this.callbacks.onError?.(error, this._state);
				break;
		}
	}

	private async createPeerConnection(): Promise<void> {
		if (this.pc) return;

		const iceServers = this.options.iceServers ?? DEFAULT_ICE_SERVERS;
		this.pc = new RTCPeerConnection({ iceServers });

		// Add local tracks
		if (this.localStream) {
			for (const track of this.localStream.getTracks()) {
				this.pc.addTrack(track, this.localStream);
				this.callbacks.onTrackAdded?.(track, this.localStream);
			}
		}

		// Handle remote tracks
		this.pc.ontrack = (event) => {
			// Use the stream from the event if available (preferred - already has track)
			// Otherwise create a new stream with the track
			if (event.streams?.[0]) {
				if (this.remoteStream !== event.streams[0]) {
					this.remoteStream = event.streams[0];
					this.callbacks.onRemoteStream?.(this.remoteStream);
				}
			} else {
				// Fallback: create stream with track already included
				if (!this.remoteStream) {
					this.remoteStream = new MediaStream([event.track]);
					this.callbacks.onRemoteStream?.(this.remoteStream);
				} else {
					this.remoteStream.addTrack(event.track);
					// Re-trigger callback so video element updates
					this.callbacks.onRemoteStream?.(this.remoteStream);
				}
			}

			this.callbacks.onTrackAdded?.(event.track, this.remoteStream!);

			if (this._state !== 'connected') {
				this.setState('connected', 'track received');
			}
		};

		// Handle ICE candidates
		this.pc.onicecandidate = (event) => {
			if (event.candidate) {
				this.callbacks.onIceCandidate?.(event.candidate.toJSON());
				this.send({
					t: 'ice',
					from: this.peerId!,
					to: this.remotePeerId ?? undefined,
					candidate: event.candidate.toJSON(),
				});
			}
		};

		// Perfect negotiation: handle negotiation needed
		this.pc.onnegotiationneeded = async () => {
			try {
				this.makingOffer = true;
				await this.pc!.setLocalDescription();
				this.send({
					t: 'sdp',
					from: this.peerId!,
					to: this.remotePeerId ?? undefined,
					description: this.pc!.localDescription!,
				});
			} catch (err) {
				const error = err instanceof Error ? err : new Error(String(err));
				this.callbacks.onError?.(error, this._state);
			} finally {
				this.makingOffer = false;
			}
		};

		this.pc.oniceconnectionstatechange = () => {
			const iceState = this.pc?.iceConnectionState;
			if (iceState) {
				this.callbacks.onIceStateChange?.(iceState);
			}

			if (iceState === 'disconnected') {
				this.setState('signaling', 'ICE disconnected');
			} else if (iceState === 'connected') {
				this.setState('connected', 'ICE connected');
			} else if (iceState === 'failed') {
				const error = new Error('ICE connection failed');
				this.callbacks.onError?.(error, this._state);
			}
		};
	}

	private async createOffer(): Promise<void> {
		if (!this.pc) return;

		try {
			this.makingOffer = true;
			const offer = await this.pc.createOffer();
			await this.pc.setLocalDescription(offer);

			this.send({
				t: 'sdp',
				from: this.peerId!,
				to: this.remotePeerId ?? undefined,
				description: this.pc.localDescription!,
			});
		} finally {
			this.makingOffer = false;
		}
	}

	private async handleRemoteSDP(description: RTCSessionDescriptionInit): Promise<void> {
		if (!this.pc) {
			await this.createPeerConnection();
		}

		const pc = this.pc!;
		const isOffer = description.type === 'offer';

		// Perfect negotiation: collision detection
		const offerCollision = isOffer && (this.makingOffer || pc.signalingState !== 'stable');

		this.ignoreOffer = !this.polite && offerCollision;
		if (this.ignoreOffer) return;

		await pc.setRemoteDescription(description);
		this.hasRemoteDescription = true;

		// Flush buffered ICE candidates now that remote description is set
		for (const candidate of this.pendingCandidates) {
			try {
				await pc.addIceCandidate(candidate);
			} catch (err) {
				// Ignore errors for candidates that arrived during collision
				if (!this.ignoreOffer) {
					console.warn('Failed to add buffered ICE candidate:', err);
				}
			}
		}
		this.pendingCandidates = [];

		if (isOffer) {
			await pc.setLocalDescription();
			this.send({
				t: 'sdp',
				from: this.peerId!,
				to: this.remotePeerId ?? undefined,
				description: pc.localDescription!,
			});
		}
	}

	private async handleRemoteICE(candidate: RTCIceCandidateInit): Promise<void> {
		// Buffer candidates until peer connection AND remote description are ready
		if (!this.pc || !this.hasRemoteDescription) {
			this.pendingCandidates.push(candidate);
			return;
		}

		try {
			await this.pc.addIceCandidate(candidate);
		} catch (err) {
			if (!this.ignoreOffer) {
				// Log but don't propagate - some ICE failures are normal
				console.warn('Failed to add ICE candidate:', err);
			}
		}
	}

	private closePeerConnection(): void {
		if (this.pc) {
			this.pc.close();
			this.pc = null;
		}
		this.remoteStream = null;
		this.pendingCandidates = [];
		this.makingOffer = false;
		this.ignoreOffer = false;
		this.hasRemoteDescription = false;
	}

	/**
	 * End the call and disconnect
	 */
	hangup(): void {
		this.closePeerConnection();

		if (this.localStream) {
			for (const track of this.localStream.getTracks()) {
				track.stop();
				this.callbacks.onTrackRemoved?.(track);
			}
			this.localStream = null;
		}

		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}

		this.peerId = null;
		this.remotePeerId = null;
		this.setState('idle', 'hangup');
	}

	/**
	 * Mute or unmute audio
	 */
	muteAudio(muted: boolean): void {
		if (this.localStream) {
			for (const track of this.localStream.getAudioTracks()) {
				track.enabled = !muted;
			}
		}
		this.isAudioMuted = muted;
	}

	/**
	 * Mute or unmute video
	 */
	muteVideo(muted: boolean): void {
		if (this.localStream) {
			for (const track of this.localStream.getVideoTracks()) {
				track.enabled = !muted;
			}
		}
		this.isVideoMuted = muted;
	}

	/**
	 * Clean up all resources
	 */
	dispose(): void {
		this.hangup();
	}
}
