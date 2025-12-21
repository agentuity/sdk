/**
 * WebRTC connection status
 */
export type WebRTCStatus = 'disconnected' | 'connecting' | 'signaling' | 'connected';

/**
 * Signaling message types (must match server protocol)
 */
type SignalMsg =
	| { t: 'join'; roomId: string }
	| { t: 'joined'; peerId: string; roomId: string; peers: string[] }
	| { t: 'peer-joined'; peerId: string }
	| { t: 'peer-left'; peerId: string }
	| { t: 'sdp'; from: string; to?: string; description: RTCSessionDescriptionInit }
	| { t: 'ice'; from: string; to?: string; candidate: RTCIceCandidateInit }
	| { t: 'error'; message: string };

/**
 * Callbacks for WebRTC manager state changes
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
	/** Callbacks for state changes */
	callbacks?: WebRTCCallbacks;
}

/**
 * WebRTC manager state
 */
export interface WebRTCManagerState {
	status: WebRTCStatus;
	peerId: string | null;
	remotePeerId: string | null;
	isAudioMuted: boolean;
	isVideoMuted: boolean;
}

/**
 * Default ICE servers (public STUN servers)
 */
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
	{ urls: 'stun:stun.l.google.com:19302' },
	{ urls: 'stun:stun1.l.google.com:19302' },
];

/**
 * Framework-agnostic WebRTC connection manager with signaling,
 * perfect negotiation, and media stream handling.
 */
export class WebRTCManager {
	private ws: WebSocket | null = null;
	private pc: RTCPeerConnection | null = null;
	private localStream: MediaStream | null = null;
	private remoteStream: MediaStream | null = null;

	private peerId: string | null = null;
	private remotePeerId: string | null = null;
	private status: WebRTCStatus = 'disconnected';
	private isAudioMuted = false;
	private isVideoMuted = false;

	// Perfect negotiation state
	private makingOffer = false;
	private ignoreOffer = false;
	private polite: boolean;

	// ICE candidate buffering - buffer until remote description is set
	private pendingCandidates: RTCIceCandidateInit[] = [];
	private hasRemoteDescription = false;

	private options: WebRTCManagerOptions;
	private callbacks: WebRTCCallbacks;

	constructor(options: WebRTCManagerOptions) {
		this.options = options;
		this.polite = options.polite ?? true;
		this.callbacks = options.callbacks ?? {};
	}

	/**
	 * Get current manager state
	 */
	getState(): WebRTCManagerState {
		return {
			status: this.status,
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

	private setStatus(status: WebRTCStatus): void {
		this.status = status;
		this.callbacks.onStatusChange?.(status);
	}

	private send(msg: SignalMsg): void {
		if (this.ws?.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(msg));
		}
	}

	/**
	 * Connect to the signaling server and start the call
	 */
	async connect(): Promise<void> {
		if (this.status !== 'disconnected') return;

		this.setStatus('connecting');

		try {
			// Get local media
			const mediaConstraints = this.options.media ?? { video: true, audio: true };
			this.localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
			this.callbacks.onLocalStream?.(this.localStream);

			// Connect to signaling server
			this.ws = new WebSocket(this.options.signalUrl);

			this.ws.onopen = () => {
				this.setStatus('signaling');
				this.send({ t: 'join', roomId: this.options.roomId });
			};

			this.ws.onmessage = (event) => {
				const msg = JSON.parse(event.data) as SignalMsg;
				this.handleSignalingMessage(msg);
			};

			this.ws.onerror = () => {
				this.callbacks.onError?.(new Error('WebSocket connection error'));
			};

			this.ws.onclose = () => {
				if (this.status !== 'disconnected') {
					this.setStatus('disconnected');
				}
			};
		} catch (err) {
			this.setStatus('disconnected');
			this.callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
		}
	}

	private async handleSignalingMessage(msg: SignalMsg): Promise<void> {
		switch (msg.t) {
			case 'joined':
				this.peerId = msg.peerId;
				// If there's already a peer in the room, we're the offerer (impolite)
				if (msg.peers.length > 0) {
					this.remotePeerId = msg.peers[0];
					// Late joiner is impolite (makes the offer, wins collisions)
					this.polite = this.options.polite ?? false;
					await this.createPeerConnection();
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
					this.setStatus('signaling');
				}
				break;

			case 'sdp':
				await this.handleRemoteSDP(msg.description);
				break;

			case 'ice':
				await this.handleRemoteICE(msg.candidate);
				break;

			case 'error':
				this.callbacks.onError?.(new Error(msg.message));
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

			if (this.status !== 'connected') {
				this.setStatus('connected');
			}
		};

		// Handle ICE candidates
		this.pc.onicecandidate = (event) => {
			if (event.candidate) {
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
				this.callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
			} finally {
				this.makingOffer = false;
			}
		};

		this.pc.oniceconnectionstatechange = () => {
			if (this.pc?.iceConnectionState === 'disconnected') {
				this.setStatus('signaling');
			} else if (this.pc?.iceConnectionState === 'connected') {
				this.setStatus('connected');
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
			}
			this.localStream = null;
		}

		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}

		this.peerId = null;
		this.remotePeerId = null;
		this.setStatus('disconnected');
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
