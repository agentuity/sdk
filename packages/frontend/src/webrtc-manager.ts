import type {
	SignalMessage,
	WebRTCConnectionState,
	WebRTCDisconnectReason,
	DataChannelConfig,
	DataChannelState,
	ConnectionQualitySummary,
	RecordingOptions,
	RecordingHandle,
	RecordingState,
	TrackSource as CoreTrackSource,
} from '@agentuity/core';
import { createReconnectManager, type ReconnectManager } from './reconnect';

/**
 * Track source interface extended for browser environment.
 */
export interface TrackSource extends Omit<CoreTrackSource, 'getStream'> {
	getStream(): Promise<MediaStream>;
}

// =============================================================================
// Track Sources
// =============================================================================

/**
 * User media (camera/microphone) track source.
 */
export class UserMediaSource implements TrackSource {
	readonly type = 'user-media' as const;
	private stream: MediaStream | null = null;

	constructor(private constraints: MediaStreamConstraints = { video: true, audio: true }) {}

	async getStream(): Promise<MediaStream> {
		this.stream = await navigator.mediaDevices.getUserMedia(this.constraints);
		return this.stream;
	}

	stop(): void {
		if (this.stream) {
			for (const track of this.stream.getTracks()) {
				track.stop();
			}
			this.stream = null;
		}
	}
}

/**
 * Display media (screen share) track source.
 */
export class DisplayMediaSource implements TrackSource {
	readonly type = 'display-media' as const;
	private stream: MediaStream | null = null;

	constructor(private constraints: DisplayMediaStreamOptions = { video: true, audio: false }) {}

	async getStream(): Promise<MediaStream> {
		this.stream = await navigator.mediaDevices.getDisplayMedia(this.constraints);
		return this.stream;
	}

	stop(): void {
		if (this.stream) {
			for (const track of this.stream.getTracks()) {
				track.stop();
			}
			this.stream = null;
		}
	}
}

/**
 * Custom stream track source - wraps a user-provided MediaStream.
 */
export class CustomStreamSource implements TrackSource {
	readonly type = 'custom' as const;

	constructor(private stream: MediaStream) {}

	async getStream(): Promise<MediaStream> {
		return this.stream;
	}

	stop(): void {
		for (const track of this.stream.getTracks()) {
			track.stop();
		}
	}
}

// =============================================================================
// Per-Peer Session
// =============================================================================

/**
 * Represents a connection to a single remote peer.
 */
interface PeerSession {
	peerId: string;
	pc: RTCPeerConnection;
	remoteStream: MediaStream | null;
	dataChannels: Map<string, RTCDataChannel>;
	makingOffer: boolean;
	ignoreOffer: boolean;
	hasRemoteDescription: boolean;
	pendingCandidates: RTCIceCandidateInit[];
	isOfferer: boolean;
	negotiationStarted: boolean;
	lastStats?: RTCStatsReport;
	lastStatsTime?: number;
	hasIceCandidate?: boolean;
	iceGatheringTimer?: ReturnType<typeof setTimeout> | null;
}

// =============================================================================
// Callbacks
// =============================================================================

/**
 * Callbacks for WebRTC client state changes and events.
 * All callbacks are optional - only subscribe to events you care about.
 */
export interface WebRTCClientCallbacks {
	/**
	 * Called on every state transition.
	 */
	onStateChange?: (
		from: WebRTCConnectionState,
		to: WebRTCConnectionState,
		reason?: string
	) => void;

	/**
	 * Called when connected to at least one peer.
	 */
	onConnect?: () => void;

	/**
	 * Called when disconnected from all peers.
	 */
	onDisconnect?: (reason: WebRTCDisconnectReason) => void;

	/**
	 * Called when local media stream is acquired.
	 */
	onLocalStream?: (stream: MediaStream) => void;

	/**
	 * Called when a remote media stream is received.
	 */
	onRemoteStream?: (peerId: string, stream: MediaStream) => void;

	/**
	 * Called when a new track is added to a stream.
	 */
	onTrackAdded?: (peerId: string, track: MediaStreamTrack, stream: MediaStream) => void;

	/**
	 * Called when a track is removed from a stream.
	 */
	onTrackRemoved?: (peerId: string, track: MediaStreamTrack) => void;

	/**
	 * Called when a peer joins the room.
	 */
	onPeerJoined?: (peerId: string) => void;

	/**
	 * Called when a peer leaves the room.
	 */
	onPeerLeft?: (peerId: string) => void;

	/**
	 * Called when negotiation starts with a peer.
	 */
	onNegotiationStart?: (peerId: string) => void;

	/**
	 * Called when negotiation completes with a peer.
	 */
	onNegotiationComplete?: (peerId: string) => void;

	/**
	 * Called for each ICE candidate generated.
	 */
	onIceCandidate?: (peerId: string, candidate: RTCIceCandidateInit) => void;

	/**
	 * Called when ICE connection state changes for a peer.
	 */
	onIceStateChange?: (peerId: string, state: string) => void;

	/**
	 * Called when an error occurs.
	 */
	onError?: (error: Error, state: WebRTCConnectionState) => void;

	/**
	 * Called when a data channel is opened.
	 */
	onDataChannelOpen?: (peerId: string, label: string) => void;

	/**
	 * Called when a data channel is closed.
	 */
	onDataChannelClose?: (peerId: string, label: string) => void;

	/**
	 * Called when a message is received on a data channel.
	 *
	 * **Note:** String messages are automatically parsed as JSON if valid.
	 * - If the message is valid JSON, `data` will be the parsed object/array/value
	 * - If the message is not valid JSON, `data` will be the raw string
	 * - Binary messages (ArrayBuffer) are passed through unchanged
	 *
	 * To distinguish between parsed JSON and raw strings, check the type:
	 * ```ts
	 * onDataChannelMessage: (peerId, label, data) => {
	 *   if (typeof data === 'string') {
	 *     // Raw string (failed JSON parse)
	 *   } else if (data instanceof ArrayBuffer) {
	 *     // Binary data
	 *   } else {
	 *     // Parsed JSON object/array/primitive
	 *   }
	 * }
	 * ```
	 */
	onDataChannelMessage?: (
		peerId: string,
		label: string,
		data: string | ArrayBuffer | unknown
	) => void;

	/**
	 * Called when a data channel error occurs.
	 */
	onDataChannelError?: (peerId: string, label: string, error: Error) => void;

	/**
	 * Called when screen sharing starts.
	 */
	onScreenShareStart?: () => void;

	/**
	 * Called when screen sharing stops.
	 */
	onScreenShareStop?: () => void;

	/**
	 * Called when a reconnect attempt is scheduled.
	 */
	onReconnecting?: (attempt: number) => void;

	/**
	 * Called after a successful reconnection.
	 */
	onReconnected?: () => void;

	/**
	 * Called when reconnect attempts are exhausted.
	 */
	onReconnectFailed?: () => void;
}

// =============================================================================
// Options and State
// =============================================================================

/**
 * Options for WebRTCManager
 */
export interface WebRTCManagerOptions {
	/** WebSocket signaling URL */
	signalUrl: string;
	/** Room ID to join */
	roomId: string;
	/** Whether this peer is "polite" in perfect negotiation (default: auto-determined) */
	polite?: boolean;
	/** ICE servers configuration */
	iceServers?: RTCIceServer[];
	/**
	 * Media source configuration.
	 * - `false`: Data-only mode (no media)
	 * - `MediaStreamConstraints`: Use getUserMedia with these constraints
	 * - `TrackSource`: Use a custom track source
	 * Default: { video: true, audio: true }
	 */
	media?: MediaStreamConstraints | TrackSource | false;
	/**
	 * Data channels to create when connection is established.
	 * Only the offerer (late joiner) creates channels; the answerer receives them.
	 */
	dataChannels?: DataChannelConfig[];
	/**
	 * Callbacks for state changes and events.
	 */
	callbacks?: WebRTCClientCallbacks;
	/**
	 * Whether to auto-reconnect on WebSocket/ICE failures (default: true)
	 */
	autoReconnect?: boolean;
	/**
	 * Maximum reconnection attempts before giving up (default: 5)
	 */
	maxReconnectAttempts?: number;
	/**
	 * Connection timeout in ms for connecting/negotiating (default: 30000)
	 */
	connectionTimeout?: number;
	/**
	 * ICE gathering timeout in ms (default: 10000)
	 */
	iceGatheringTimeout?: number;
}

/**
 * WebRTC manager state
 */
export interface WebRTCManagerState {
	state: WebRTCConnectionState;
	peerId: string | null;
	remotePeerIds: string[];
	isAudioMuted: boolean;
	isVideoMuted: boolean;
	isScreenSharing: boolean;
}

/**
 * Default ICE servers (public STUN servers)
 */
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
	{ urls: 'stun:stun.l.google.com:19302' },
	{ urls: 'stun:stun1.l.google.com:19302' },
];

// =============================================================================
// WebRTCManager
// =============================================================================

/**
 * Framework-agnostic WebRTC connection manager with multi-peer mesh networking,
 * perfect negotiation, media/data channel handling, and screen sharing.
 *
 * Uses an explicit state machine for connection lifecycle:
 * - idle: No resources allocated, ready to connect
 * - connecting: Acquiring media + opening WebSocket
 * - signaling: In room, waiting for peer(s)
 * - negotiating: SDP/ICE exchange in progress with at least one peer
 * - connected: At least one peer is connected
 *
 * @example
 * ```ts
 * const manager = new WebRTCManager({
 *   signalUrl: 'wss://example.com/call/signal',
 *   roomId: 'my-room',
 *   callbacks: {
 *     onStateChange: (from, to, reason) => console.log(`${from} → ${to}`, reason),
 *     onConnect: () => console.log('Connected!'),
 *     onRemoteStream: (peerId, stream) => { remoteVideos[peerId].srcObject = stream; },
 *   },
 * });
 *
 * await manager.connect();
 * ```
 */
export class WebRTCManager {
	private ws: WebSocket | null = null;
	private localStream: MediaStream | null = null;
	private trackSource: TrackSource | null = null;
	private previousVideoTrack: MediaStreamTrack | null = null;

	private peerId: string | null = null;
	private peers = new Map<string, PeerSession>();
	private isAudioMuted = false;
	private isVideoMuted = false;
	private isScreenSharing = false;

	private _state: WebRTCConnectionState = 'idle';
	private isConnecting = false;
	private basePolite: boolean | undefined;

	private options: WebRTCManagerOptions;
	private callbacks: WebRTCClientCallbacks;
	private reconnectManager: ReconnectManager;
	private isReconnecting = false;
	private intentionalClose = false;
	private connectionTimeoutId: ReturnType<typeof setTimeout> | null = null;

	private recordings = new Map<string, { recorder: MediaRecorder; chunks: Blob[] }>();

	constructor(options: WebRTCManagerOptions) {
		this.options = {
			...options,
			autoReconnect: options.autoReconnect ?? true,
			maxReconnectAttempts: options.maxReconnectAttempts ?? 5,
			connectionTimeout: options.connectionTimeout ?? 30000,
			iceGatheringTimeout: options.iceGatheringTimeout ?? 10000,
		};
		this.basePolite = options.polite;
		this.callbacks = options.callbacks ?? {};
		this.reconnectManager = createReconnectManager({
			onReconnect: () => {
				void this.reconnect();
			},
			baseDelay: 1000,
			factor: 2,
			maxDelay: 30000,
			jitter: 0,
			enabled: () => this.shouldAutoReconnect(),
		});
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
			peerId: this.peerId,
			remotePeerIds: Array.from(this.peers.keys()),
			isAudioMuted: this.isAudioMuted,
			isVideoMuted: this.isVideoMuted,
			isScreenSharing: this.isScreenSharing,
		};
	}

	/**
	 * Get local media stream
	 */
	getLocalStream(): MediaStream | null {
		return this.localStream;
	}

	/**
	 * Get remote media streams keyed by peer ID
	 */
	getRemoteStreams(): Map<string, MediaStream> {
		const streams = new Map<string, MediaStream>();
		for (const [peerId, session] of this.peers) {
			if (session.remoteStream) {
				streams.set(peerId, session.remoteStream);
			}
		}
		return streams;
	}

	/**
	 * Get a specific peer's remote stream
	 */
	getRemoteStream(peerId: string): MediaStream | null {
		return this.peers.get(peerId)?.remoteStream ?? null;
	}

	/**
	 * Whether this manager is in data-only mode (no media streams).
	 */
	get isDataOnly(): boolean {
		return this.options.media === false;
	}

	/**
	 * Get connected peer count
	 */
	get peerCount(): number {
		return this.peers.size;
	}

	// =========================================================================
	// State Machine
	// =========================================================================

	private setState(newState: WebRTCConnectionState, reason?: string): void {
		const prevState = this._state;
		if (prevState === newState) return;

		this._state = newState;
		this.handleStateTimeouts(newState);
		this.callbacks.onStateChange?.(prevState, newState, reason);

		if (newState === 'connected' && prevState !== 'connected') {
			this.callbacks.onConnect?.();
		}

		if (newState === 'idle' && prevState !== 'idle') {
			const disconnectReason = this.mapToDisconnectReason(reason);
			this.callbacks.onDisconnect?.(disconnectReason);
		}
	}

	private mapToDisconnectReason(reason?: string): WebRTCDisconnectReason {
		if (reason === 'hangup') return 'hangup';
		if (reason === 'peer-left') return 'peer-left';
		if (reason?.includes('timeout')) return 'timeout';
		return 'error';
	}

	private handleStateTimeouts(state: WebRTCConnectionState): void {
		if (state === 'connecting' || state === 'negotiating') {
			this.startConnectionTimeout();
			return;
		}
		this.clearConnectionTimeout();
	}

	private startConnectionTimeout(): void {
		this.clearConnectionTimeout();
		const timeoutMs = this.options.connectionTimeout ?? 30000;
		this.connectionTimeoutId = setTimeout(() => {
			if (this._state === 'connecting' || this._state === 'negotiating') {
				const error = new Error('WebRTC connection timed out');
				this.callbacks.onError?.(error, this._state);
				this.handleTimeout('connection-timeout');
			}
		}, timeoutMs);
	}

	private clearConnectionTimeout(): void {
		if (this.connectionTimeoutId) {
			clearTimeout(this.connectionTimeoutId);
			this.connectionTimeoutId = null;
		}
	}

	private handleTimeout(reason: string): void {
		this.intentionalClose = true;
		this.cleanupPeerSessions();
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
		this.peerId = null;
		this.setState('idle', reason);
		this.intentionalClose = false;
	}

	private shouldAutoReconnect(): boolean {
		return (this.options.autoReconnect ?? true) && !this.intentionalClose;
	}

	private updateConnectionState(): void {
		const connectedPeers = Array.from(this.peers.values()).filter(
			(p) => p.pc.iceConnectionState === 'connected' || p.pc.iceConnectionState === 'completed'
		);

		if (connectedPeers.length > 0) {
			if (this._state !== 'connected') {
				this.setState('connected', 'peer connected');
			}
		} else if (this.peers.size > 0) {
			if (this._state === 'connected') {
				this.setState('negotiating', 'no connected peers');
			}
		} else if (this._state === 'connected' || this._state === 'negotiating') {
			this.setState('signaling', 'all peers left');
		}
	}

	private send(msg: SignalMessage): void {
		if (this.ws?.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(msg));
		}
	}

	// =========================================================================
	// Connection
	// =========================================================================

	/**
	 * Connect to the signaling server and start the call
	 */
	async connect(): Promise<void> {
		if (this._state !== 'idle' || this.isConnecting) return;
		this.isConnecting = true;
		this.intentionalClose = false;
		this.reconnectManager.reset();

		this.setState('connecting', 'connect() called');

		try {
			await this.ensureLocalStream();
			this.openWebSocket();
		} catch (err) {
			// Clean up local media on failure
			if (this.localStream) {
				for (const track of this.localStream.getTracks()) {
					track.stop();
				}
				this.localStream = null;
			}
			if (this.trackSource) {
				this.trackSource.stop();
				this.trackSource = null;
			}
			const error = err instanceof Error ? err : new Error(String(err));
			this.callbacks.onError?.(error, this._state);
			this.isConnecting = false;
			this.setState('idle', 'error');
		} finally {
			this.isConnecting = false;
		}
	}

	private async ensureLocalStream(): Promise<void> {
		if (this.options.media === false || this.localStream) return;
		if (
			this.options.media &&
			typeof this.options.media === 'object' &&
			'getStream' in this.options.media
		) {
			this.trackSource = this.options.media;
		} else {
			const constraints = (this.options.media as MediaStreamConstraints) ?? {
				video: true,
				audio: true,
			};
			this.trackSource = new UserMediaSource(constraints);
		}
		this.localStream = await this.trackSource.getStream();
		this.callbacks.onLocalStream?.(this.localStream);
	}

	private openWebSocket(): void {
		if (this.ws) {
			const previous = this.ws;
			this.ws = null;
			previous.onclose = null;
			previous.onerror = null;
			previous.onmessage = null;
			previous.onopen = null;
			previous.close();
		}

		this.ws = new WebSocket(this.options.signalUrl);

		this.ws.onopen = () => {
			this.setState('signaling', 'WebSocket opened');
			this.send({ t: 'join', roomId: this.options.roomId });
			if (this.isReconnecting) {
				this.isReconnecting = false;
				this.reconnectManager.recordSuccess();
				this.callbacks.onReconnected?.();
			}
		};

		this.ws.onmessage = (event) => {
			try {
				const msg = JSON.parse(event.data) as SignalMessage;
				void this.handleSignalingMessage(msg).catch((err) => {
					this.callbacks.onError?.(
						err instanceof Error ? err : new Error(String(err)),
						this._state
					);
				});
			} catch (_err) {
				this.callbacks.onError?.(new Error('Invalid signaling message'), this._state);
			}
		};

		this.ws.onerror = () => {
			const error = new Error('WebSocket connection error');
			this.callbacks.onError?.(error, this._state);
		};

		this.ws.onclose = () => {
			if (this._state === 'idle') return;
			if (this.intentionalClose) {
				this.setState('idle', 'WebSocket closed');
				return;
			}
			this.handleConnectionLoss('WebSocket closed');
		};
	}

	private handleConnectionLoss(reason: string): void {
		this.cleanupPeerSessions();
		this.peerId = null;
		if (this.shouldAutoReconnect()) {
			this.scheduleReconnect(reason);
		} else {
			this.setState('idle', reason);
		}
	}

	private scheduleReconnect(reason: string): void {
		const nextAttempt = this.reconnectManager.getAttempts() + 1;
		const maxAttempts = this.options.maxReconnectAttempts ?? 5;
		if (nextAttempt > maxAttempts) {
			this.callbacks.onReconnectFailed?.();
			this.setState('idle', 'reconnect-failed');
			return;
		}

		this.isReconnecting = true;
		this.callbacks.onReconnecting?.(nextAttempt);
		this.setState('connecting', `reconnecting:${reason}`);
		this.reconnectManager.recordFailure();
	}

	private async reconnect(): Promise<void> {
		if (!this.shouldAutoReconnect()) return;
		this.cleanupPeerSessions();
		this.peerId = null;
		try {
			await this.ensureLocalStream();
			this.openWebSocket();
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			this.callbacks.onError?.(error, this._state);
			this.scheduleReconnect('reconnect-error');
		}
	}

	private async handleSignalingMessage(msg: SignalMessage): Promise<void> {
		switch (msg.t) {
			case 'joined':
				this.peerId = msg.peerId;
				for (const existingPeerId of msg.peers) {
					await this.createPeerSession(existingPeerId, true);
				}
				break;

			case 'peer-joined':
				this.callbacks.onPeerJoined?.(msg.peerId);
				await this.createPeerSession(msg.peerId, false);
				break;

			case 'peer-left':
				this.callbacks.onPeerLeft?.(msg.peerId);
				this.closePeerSession(msg.peerId);
				this.updateConnectionState();
				break;

			case 'sdp':
				await this.handleRemoteSDP(msg.from, msg.description);
				break;

			case 'ice':
				await this.handleRemoteICE(msg.from, msg.candidate);
				break;

			case 'error': {
				const error = new Error(msg.message);
				this.callbacks.onError?.(error, this._state);
				break;
			}
		}
	}

	// =========================================================================
	// Peer Session Management
	// =========================================================================

	private async createPeerSession(remotePeerId: string, isOfferer: boolean): Promise<PeerSession> {
		if (this.peers.has(remotePeerId)) {
			return this.peers.get(remotePeerId)!;
		}

		const iceServers = this.options.iceServers ?? DEFAULT_ICE_SERVERS;
		const pc = new RTCPeerConnection({ iceServers });

		const session: PeerSession = {
			peerId: remotePeerId,
			pc,
			remoteStream: null,
			dataChannels: new Map(),
			makingOffer: false,
			ignoreOffer: false,
			hasRemoteDescription: false,
			pendingCandidates: [],
			isOfferer,
			negotiationStarted: false,
			hasIceCandidate: false,
			iceGatheringTimer: null,
		};

		this.peers.set(remotePeerId, session);

		if (this.localStream) {
			for (const track of this.localStream.getTracks()) {
				pc.addTrack(track, this.localStream);
			}
		}

		pc.ontrack = (event) => {
			if (event.streams?.[0]) {
				if (session.remoteStream !== event.streams[0]) {
					session.remoteStream = event.streams[0];
					this.callbacks.onRemoteStream?.(remotePeerId, session.remoteStream);
				}
			} else {
				if (!session.remoteStream) {
					session.remoteStream = new MediaStream([event.track]);
					this.callbacks.onRemoteStream?.(remotePeerId, session.remoteStream);
				} else {
					session.remoteStream.addTrack(event.track);
					this.callbacks.onRemoteStream?.(remotePeerId, session.remoteStream);
				}
			}

			this.callbacks.onTrackAdded?.(remotePeerId, event.track, session.remoteStream!);
			this.updateConnectionState();
		};

		pc.ondatachannel = (event) => {
			this.setupDataChannel(session, event.channel);
		};

		pc.onicecandidate = (event) => {
			if (event.candidate) {
				session.hasIceCandidate = true;
				if (session.iceGatheringTimer) {
					clearTimeout(session.iceGatheringTimer);
					session.iceGatheringTimer = null;
				}
				this.callbacks.onIceCandidate?.(remotePeerId, event.candidate.toJSON());
				this.send({
					t: 'ice',
					from: this.peerId!,
					to: remotePeerId,
					candidate: event.candidate.toJSON(),
				});
			}
		};

		this.scheduleIceGatheringTimeout(session);

		pc.onnegotiationneeded = async () => {
			// If we're not the offerer and haven't received a remote description yet,
			// don't send an offer - wait for the other peer's offer
			if (!session.isOfferer && !session.hasRemoteDescription && !session.negotiationStarted) {
				return;
			}

			try {
				session.makingOffer = true;
				await pc.setLocalDescription();
				this.send({
					t: 'sdp',
					from: this.peerId!,
					to: remotePeerId,
					description: pc.localDescription!,
				});
			} catch (err) {
				const error = err instanceof Error ? err : new Error(String(err));
				this.callbacks.onError?.(error, this._state);
			} finally {
				session.makingOffer = false;
			}
		};

		pc.oniceconnectionstatechange = () => {
			const iceState = pc.iceConnectionState;
			this.callbacks.onIceStateChange?.(remotePeerId, iceState);
			this.updateConnectionState();

			if (iceState === 'failed') {
				const error = new Error(`ICE connection failed for peer ${remotePeerId}`);
				this.callbacks.onError?.(error, this._state);
				this.handleConnectionLoss('ice-failed');
			}
		};

		if (isOfferer) {
			if (this.options.dataChannels) {
				for (const config of this.options.dataChannels) {
					const channel = pc.createDataChannel(config.label, {
						ordered: config.ordered ?? true,
						maxPacketLifeTime: config.maxPacketLifeTime,
						maxRetransmits: config.maxRetransmits,
						protocol: config.protocol,
					});
					this.setupDataChannel(session, channel);
				}
			}

			this.setState('negotiating', 'creating offer');
			this.callbacks.onNegotiationStart?.(remotePeerId);
			await this.createOffer(session);
		}

		return session;
	}

	private async createOffer(session: PeerSession): Promise<void> {
		try {
			session.makingOffer = true;
			session.negotiationStarted = true;
			const offer = await session.pc.createOffer();
			await session.pc.setLocalDescription(offer);

			this.send({
				t: 'sdp',
				from: this.peerId!,
				to: session.peerId,
				description: session.pc.localDescription!,
			});
		} finally {
			session.makingOffer = false;
		}
	}

	private async handleRemoteSDP(
		fromPeerId: string,
		description: RTCSessionDescriptionInit
	): Promise<void> {
		let session = this.peers.get(fromPeerId);
		if (!session) {
			session = await this.createPeerSession(fromPeerId, false);
		}

		const pc = session.pc;
		const isOffer = description.type === 'offer';
		const polite = this.basePolite ?? !this.isOffererFor(fromPeerId);
		const offerCollision = isOffer && (session.makingOffer || pc.signalingState !== 'stable');

		session.ignoreOffer = !polite && offerCollision;
		if (session.ignoreOffer) return;

		if (this._state === 'signaling') {
			this.setState('negotiating', 'received SDP');
			this.callbacks.onNegotiationStart?.(fromPeerId);
		}

		await pc.setRemoteDescription(description);
		session.hasRemoteDescription = true;

		for (const candidate of session.pendingCandidates) {
			try {
				await pc.addIceCandidate(candidate);
			} catch (err) {
				if (!session.ignoreOffer) {
					console.warn('Failed to add buffered ICE candidate:', err);
				}
			}
		}
		session.pendingCandidates = [];

		if (isOffer) {
			session.negotiationStarted = true;
			await pc.setLocalDescription();
			this.send({
				t: 'sdp',
				from: this.peerId!,
				to: fromPeerId,
				description: pc.localDescription!,
			});
		}

		this.callbacks.onNegotiationComplete?.(fromPeerId);
	}

	private isOffererFor(remotePeerId: string): boolean {
		return this.peerId! > remotePeerId;
	}

	private async handleRemoteICE(
		fromPeerId: string,
		candidate: RTCIceCandidateInit
	): Promise<void> {
		const session = this.peers.get(fromPeerId);
		if (!session || !session.hasRemoteDescription) {
			if (session) {
				session.pendingCandidates.push(candidate);
			}
			return;
		}

		try {
			await session.pc.addIceCandidate(candidate);
		} catch (err) {
			if (!session.ignoreOffer) {
				console.warn('Failed to add ICE candidate:', err);
			}
		}
	}

	private closePeerSession(peerId: string): void {
		const session = this.peers.get(peerId);
		if (!session) return;

		// Clear ICE gathering timer if exists
		if (session.iceGatheringTimer) {
			clearTimeout(session.iceGatheringTimer);
			session.iceGatheringTimer = null;
		}

		// Close data channels
		for (const channel of session.dataChannels.values()) {
			channel.close();
		}
		session.dataChannels.clear();

		// Clear all event handlers before closing to prevent memory leaks
		const pc = session.pc;
		pc.ontrack = null;
		pc.ondatachannel = null;
		pc.onicecandidate = null;
		pc.onnegotiationneeded = null;
		pc.oniceconnectionstatechange = null;

		pc.close();
		this.peers.delete(peerId);
	}

	private cleanupPeerSessions(): void {
		for (const peerId of this.peers.keys()) {
			this.closePeerSession(peerId);
		}
		this.peers.clear();
	}

	private scheduleIceGatheringTimeout(session: PeerSession): void {
		const timeoutMs = this.options.iceGatheringTimeout ?? 10000;
		if (timeoutMs <= 0) return;
		if (session.iceGatheringTimer) {
			clearTimeout(session.iceGatheringTimer);
		}
		session.iceGatheringTimer = setTimeout(() => {
			if (!session.hasIceCandidate) {
				console.warn(`ICE gathering timeout for peer ${session.peerId}`);
			}
		}, timeoutMs);
	}

	// =========================================================================
	// Data Channel
	// =========================================================================

	private setupDataChannel(session: PeerSession, channel: RTCDataChannel): void {
		const label = channel.label;
		const peerId = session.peerId;
		session.dataChannels.set(label, channel);

		channel.onopen = () => {
			this.callbacks.onDataChannelOpen?.(peerId, label);
			if (this.isDataOnly && this._state !== 'connected') {
				this.updateConnectionState();
			}
		};

		channel.onclose = () => {
			session.dataChannels.delete(label);
			this.callbacks.onDataChannelClose?.(peerId, label);
		};

		channel.onmessage = (event) => {
			const data = event.data;
			if (typeof data === 'string') {
				try {
					const parsed = JSON.parse(data);
					this.callbacks.onDataChannelMessage?.(peerId, label, parsed);
				} catch {
					this.callbacks.onDataChannelMessage?.(peerId, label, data);
				}
			} else {
				this.callbacks.onDataChannelMessage?.(peerId, label, data);
			}
		};

		channel.onerror = (event) => {
			const error =
				event instanceof ErrorEvent
					? new Error(event.message)
					: new Error('Data channel error');
			this.callbacks.onDataChannelError?.(peerId, label, error);
		};
	}

	/**
	 * Create a new data channel to all connected peers.
	 */
	createDataChannel(config: DataChannelConfig): Map<string, RTCDataChannel> {
		const channels = new Map<string, RTCDataChannel>();
		for (const [peerId, session] of this.peers) {
			const channel = session.pc.createDataChannel(config.label, {
				ordered: config.ordered ?? true,
				maxPacketLifeTime: config.maxPacketLifeTime,
				maxRetransmits: config.maxRetransmits,
				protocol: config.protocol,
			});
			this.setupDataChannel(session, channel);
			channels.set(peerId, channel);
		}
		return channels;
	}

	/**
	 * Get a data channel by label from a specific peer.
	 */
	getDataChannel(peerId: string, label: string): RTCDataChannel | undefined {
		return this.peers.get(peerId)?.dataChannels.get(label);
	}

	/**
	 * Get all open data channel labels.
	 */
	getDataChannelLabels(): string[] {
		const labels = new Set<string>();
		for (const session of this.peers.values()) {
			for (const label of session.dataChannels.keys()) {
				labels.add(label);
			}
		}
		return Array.from(labels);
	}

	/**
	 * Get the state of a data channel for a specific peer.
	 */
	getDataChannelState(peerId: string, label: string): DataChannelState | null {
		const channel = this.peers.get(peerId)?.dataChannels.get(label);
		return channel ? (channel.readyState as DataChannelState) : null;
	}

	/**
	 * Send a string message to all peers on a data channel.
	 */
	sendString(label: string, data: string): boolean {
		let sent = false;
		for (const session of this.peers.values()) {
			const channel = session.dataChannels.get(label);
			if (channel?.readyState === 'open') {
				channel.send(data);
				sent = true;
			}
		}
		return sent;
	}

	/**
	 * Send a string message to a specific peer.
	 */
	sendStringTo(peerId: string, label: string, data: string): boolean {
		const channel = this.peers.get(peerId)?.dataChannels.get(label);
		if (!channel || channel.readyState !== 'open') return false;
		channel.send(data);
		return true;
	}

	/**
	 * Send binary data to all peers on a data channel.
	 */
	sendBinary(label: string, data: ArrayBuffer | Uint8Array): boolean {
		let sent = false;
		const buffer =
			data instanceof ArrayBuffer
				? data
				: (() => {
						const buf = new ArrayBuffer(data.byteLength);
						new Uint8Array(buf).set(data);
						return buf;
					})();

		for (const session of this.peers.values()) {
			const channel = session.dataChannels.get(label);
			if (channel?.readyState === 'open') {
				channel.send(buffer);
				sent = true;
			}
		}
		return sent;
	}

	/**
	 * Send binary data to a specific peer.
	 */
	sendBinaryTo(peerId: string, label: string, data: ArrayBuffer | Uint8Array): boolean {
		const channel = this.peers.get(peerId)?.dataChannels.get(label);
		if (!channel || channel.readyState !== 'open') return false;

		if (data instanceof ArrayBuffer) {
			channel.send(data);
		} else {
			const buffer = new ArrayBuffer(data.byteLength);
			new Uint8Array(buffer).set(data);
			channel.send(buffer);
		}
		return true;
	}

	/**
	 * Send JSON data to all peers on a data channel.
	 */
	sendJSON(label: string, data: unknown): boolean {
		return this.sendString(label, JSON.stringify(data));
	}

	/**
	 * Send JSON data to a specific peer.
	 */
	sendJSONTo(peerId: string, label: string, data: unknown): boolean {
		return this.sendStringTo(peerId, label, JSON.stringify(data));
	}

	/**
	 * Close a specific data channel on all peers.
	 */
	closeDataChannel(label: string): boolean {
		let closed = false;
		for (const session of this.peers.values()) {
			const channel = session.dataChannels.get(label);
			if (channel) {
				channel.close();
				session.dataChannels.delete(label);
				closed = true;
			}
		}
		return closed;
	}

	// =========================================================================
	// Media Controls
	// =========================================================================

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

	// =========================================================================
	// Screen Sharing
	// =========================================================================

	/**
	 * Start screen sharing, replacing the current video track.
	 * @param options - Display media constraints
	 */
	async startScreenShare(
		options: DisplayMediaStreamOptions = { video: true, audio: false }
	): Promise<void> {
		if (this.isScreenSharing || this.isDataOnly) return;

		const screenStream = await navigator.mediaDevices.getDisplayMedia(options);
		const screenTrack = screenStream.getVideoTracks()[0];

		if (!screenTrack) {
			throw new Error('Failed to get screen video track');
		}

		if (this.localStream) {
			const currentVideoTrack = this.localStream.getVideoTracks()[0];
			if (currentVideoTrack) {
				this.previousVideoTrack = currentVideoTrack;
				this.localStream.removeTrack(currentVideoTrack);
			}
			this.localStream.addTrack(screenTrack);
		}

		for (const session of this.peers.values()) {
			const sender = session.pc.getSenders().find((s) => s.track?.kind === 'video');
			if (sender) {
				await sender.replaceTrack(screenTrack);
			} else {
				session.pc.addTrack(screenTrack, this.localStream!);
			}
		}

		screenTrack.onended = () => {
			this.stopScreenShare();
		};

		this.isScreenSharing = true;
		this.callbacks.onScreenShareStart?.();
	}

	/**
	 * Stop screen sharing and restore the previous video track.
	 */
	async stopScreenShare(): Promise<void> {
		if (!this.isScreenSharing) return;

		const screenTrack = this.localStream?.getVideoTracks()[0];
		if (screenTrack) {
			screenTrack.stop();
			this.localStream?.removeTrack(screenTrack);
		}

		if (this.previousVideoTrack && this.localStream) {
			this.localStream.addTrack(this.previousVideoTrack);

			for (const session of this.peers.values()) {
				const sender = session.pc.getSenders().find((s) => s.track?.kind === 'video');
				if (sender) {
					await sender.replaceTrack(this.previousVideoTrack);
				}
			}
		}

		this.previousVideoTrack = null;
		this.isScreenSharing = false;
		this.callbacks.onScreenShareStop?.();
	}

	// =========================================================================
	// Connection Stats
	// =========================================================================

	/**
	 * Get raw stats for a peer connection.
	 */
	async getRawStats(peerId: string): Promise<RTCStatsReport | null> {
		const session = this.peers.get(peerId);
		if (!session) return null;
		return session.pc.getStats();
	}

	/**
	 * Get raw stats for all peer connections.
	 */
	async getAllRawStats(): Promise<Map<string, RTCStatsReport>> {
		const stats = new Map<string, RTCStatsReport>();
		for (const [peerId, session] of this.peers) {
			stats.set(peerId, await session.pc.getStats());
		}
		return stats;
	}

	/**
	 * Get a normalized quality summary for a peer connection.
	 */
	async getQualitySummary(peerId: string): Promise<ConnectionQualitySummary | null> {
		const session = this.peers.get(peerId);
		if (!session) return null;

		const stats = await session.pc.getStats();
		return this.parseStatsToSummary(stats, session);
	}

	/**
	 * Get quality summaries for all peer connections.
	 */
	async getAllQualitySummaries(): Promise<Map<string, ConnectionQualitySummary>> {
		const summaries = new Map<string, ConnectionQualitySummary>();
		for (const [peerId, session] of this.peers) {
			const stats = await session.pc.getStats();
			summaries.set(peerId, this.parseStatsToSummary(stats, session));
		}
		return summaries;
	}

	private parseStatsToSummary(
		stats: RTCStatsReport,
		session: PeerSession
	): ConnectionQualitySummary {
		const summary: ConnectionQualitySummary = { timestamp: Date.now() };
		const now = Date.now();
		const prevStats = session.lastStats;
		const prevTime = session.lastStatsTime ?? now;
		const timeDelta = (now - prevTime) / 1000;

		const bitrate: ConnectionQualitySummary['bitrate'] = {};

		stats.forEach((report) => {
			if (report.type === 'candidate-pair' && report.state === 'succeeded') {
				summary.rtt = report.currentRoundTripTime
					? report.currentRoundTripTime * 1000
					: undefined;

				const localCandidateId = report.localCandidateId;
				const remoteCandidateId = report.remoteCandidateId;
				const localCandidate = this.getStatReport(stats, localCandidateId);
				const remoteCandidate = this.getStatReport(stats, remoteCandidateId);

				summary.candidatePair = {
					localType: localCandidate?.candidateType,
					remoteType: remoteCandidate?.candidateType,
					protocol: localCandidate?.protocol,
					usingRelay:
						localCandidate?.candidateType === 'relay' ||
						remoteCandidate?.candidateType === 'relay',
				};
			}

			if (report.type === 'inbound-rtp' && report.kind === 'audio') {
				summary.jitter = report.jitter ? report.jitter * 1000 : undefined;
				if (report.packetsLost !== undefined && report.packetsReceived !== undefined) {
					const total = report.packetsLost + report.packetsReceived;
					if (total > 0) {
						summary.packetLossPercent = (report.packetsLost / total) * 100;
					}
				}

				if (prevStats && timeDelta > 0) {
					const prev = this.findMatchingReport(prevStats, report.id);
					if (prev?.bytesReceived !== undefined && report.bytesReceived !== undefined) {
						bitrate.audio = bitrate.audio ?? {};
						bitrate.audio.inbound =
							((report.bytesReceived - prev.bytesReceived) * 8) / timeDelta;
					}
				}
			}

			if (report.type === 'inbound-rtp' && report.kind === 'video') {
				summary.video = {
					framesPerSecond: report.framesPerSecond,
					framesDropped: report.framesDropped,
					frameWidth: report.frameWidth,
					frameHeight: report.frameHeight,
				};

				if (prevStats && timeDelta > 0) {
					const prev = this.findMatchingReport(prevStats, report.id);
					if (prev?.bytesReceived !== undefined && report.bytesReceived !== undefined) {
						bitrate.video = bitrate.video ?? {};
						bitrate.video.inbound =
							((report.bytesReceived - prev.bytesReceived) * 8) / timeDelta;
					}
				}
			}

			if (report.type === 'outbound-rtp' && prevStats && timeDelta > 0) {
				const prev = this.findMatchingReport(prevStats, report.id);
				if (prev?.bytesSent !== undefined && report.bytesSent !== undefined) {
					const bps = ((report.bytesSent - prev.bytesSent) * 8) / timeDelta;
					if (report.kind === 'audio') {
						bitrate.audio = bitrate.audio ?? {};
						bitrate.audio.outbound = bps;
					} else if (report.kind === 'video') {
						bitrate.video = bitrate.video ?? {};
						bitrate.video.outbound = bps;
					}
				}
			}
		});

		if (Object.keys(bitrate).length > 0) {
			summary.bitrate = bitrate;
		}

		session.lastStats = stats;
		session.lastStatsTime = now;

		return summary;
	}

	private findMatchingReport(stats: RTCStatsReport, id: string): any {
		return this.getStatReport(stats, id);
	}

	// RTCStatsReport extends Map but bun-types may not expose .get() properly
	private getStatReport(stats: RTCStatsReport, id: string): any {
		// Use Map.prototype.get via cast
		const mapLike = stats as unknown as Map<string, unknown>;
		return mapLike.get(id);
	}

	// =========================================================================
	// Recording
	// =========================================================================

	/**
	 * Start recording a stream.
	 * @param streamId - 'local' for local stream, or a peer ID for remote stream
	 * @param options - Recording options
	 */
	startRecording(streamId: string, options?: RecordingOptions): RecordingHandle | null {
		const stream = streamId === 'local' ? this.localStream : this.getRemoteStream(streamId);
		if (!stream) return null;

		const mimeType = this.selectMimeType(stream, options?.mimeType);
		if (!mimeType) return null;

		const recorder = new MediaRecorder(stream, {
			mimeType,
			audioBitsPerSecond: options?.audioBitsPerSecond,
			videoBitsPerSecond: options?.videoBitsPerSecond,
		});

		const chunks: Blob[] = [];
		recorder.ondataavailable = (event) => {
			if (event.data.size > 0) {
				chunks.push(event.data);
			}
		};

		this.recordings.set(streamId, { recorder, chunks });
		recorder.start(1000);

		return {
			stop: () =>
				new Promise<Blob>((resolve) => {
					recorder.onstop = () => {
						this.recordings.delete(streamId);
						resolve(new Blob(chunks, { type: mimeType }));
					};
					recorder.stop();
				}),
			pause: () => recorder.pause(),
			resume: () => recorder.resume(),
			get state(): RecordingState {
				return recorder.state as RecordingState;
			},
		};
	}

	/**
	 * Check if a stream is being recorded.
	 */
	isRecording(streamId: string): boolean {
		const recording = this.recordings.get(streamId);
		return recording?.recorder.state === 'recording';
	}

	/**
	 * Stop all recordings and return the blobs.
	 */
	async stopAllRecordings(): Promise<Map<string, Blob>> {
		const blobs = new Map<string, Blob>();
		const promises: Promise<void>[] = [];

		for (const [streamId, { recorder, chunks }] of this.recordings) {
			const mimeType = recorder.mimeType;
			promises.push(
				new Promise<void>((resolve) => {
					const timeout = setTimeout(() => {
						console.warn(`Recording stop timeout for stream ${streamId}`);
						resolve(); // Don't block other recordings
					}, 5000);

					recorder.onstop = () => {
						clearTimeout(timeout);
						blobs.set(streamId, new Blob(chunks, { type: mimeType }));
						resolve();
					};
					recorder.stop();
				})
			);
		}

		await Promise.all(promises);
		this.recordings.clear();
		return blobs;
	}

	private selectMimeType(stream: MediaStream, preferred?: string): string | null {
		if (preferred && MediaRecorder.isTypeSupported(preferred)) {
			return preferred;
		}

		const hasVideo = stream.getVideoTracks().length > 0;
		const hasAudio = stream.getAudioTracks().length > 0;

		const videoTypes = [
			'video/webm;codecs=vp9,opus',
			'video/webm;codecs=vp8,opus',
			'video/webm',
			'video/mp4',
		];
		const audioTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];

		const candidates = hasVideo ? videoTypes : hasAudio ? audioTypes : [];
		for (const type of candidates) {
			if (MediaRecorder.isTypeSupported(type)) {
				return type;
			}
		}
		return null;
	}

	// =========================================================================
	// Cleanup
	// =========================================================================

	/**
	 * End the call and disconnect from all peers
	 */
	hangup(): void {
		this.intentionalClose = true;
		this.reconnectManager.cancel();
		this.clearConnectionTimeout();
		this.cleanupPeerSessions();

		if (this.isScreenSharing) {
			const screenTrack = this.localStream?.getVideoTracks()[0];
			screenTrack?.stop();
		}

		if (this.trackSource) {
			this.trackSource.stop();
			this.trackSource = null;
		}
		this.localStream = null;
		this.previousVideoTrack = null;

		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}

		this.peerId = null;
		this.isScreenSharing = false;
		this.setState('idle', 'hangup');
		this.intentionalClose = false;
	}

	/**
	 * Clean up all resources
	 */
	dispose(): void {
		this.stopAllRecordings();
		this.hangup();
		this.reconnectManager.dispose();
	}
}
