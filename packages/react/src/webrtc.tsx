import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
	WebRTCManager,
	buildUrl,
	type WebRTCManagerOptions,
	type WebRTCClientCallbacks,
	type TrackSource,
} from '@agentuity/frontend';
import type {
	WebRTCConnectionState,
	DataChannelConfig,
	DataChannelState,
	ConnectionQualitySummary,
	RecordingHandle,
	RecordingOptions,
} from '@agentuity/core';

export type {
	WebRTCClientCallbacks,
	DataChannelConfig,
	DataChannelState,
	ConnectionQualitySummary,
};
import { AgentuityContext } from './context';

export type { WebRTCConnectionState };

/**
 * Options for useWebRTCCall hook
 */
export interface UseWebRTCCallOptions {
	/** Room ID to join */
	roomId: string;
	/** WebSocket signaling URL (e.g., '/call/signal' or full URL) */
	signalUrl: string;
	/** Whether this peer is "polite" in perfect negotiation */
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
	/** Whether to auto-connect on mount (default: true) */
	autoConnect?: boolean;
	/**
	 * Optional callbacks for WebRTC events.
	 * These are called in addition to the hook's internal state management.
	 */
	callbacks?: Partial<WebRTCClientCallbacks>;
}

/**
 * Return type for useWebRTCCall hook
 */
export interface UseWebRTCCallResult {
	/** Ref to attach to local video element */
	localVideoRef: React.RefObject<HTMLVideoElement | null>;
	/** Current connection state */
	state: WebRTCConnectionState;
	/** Current error if any */
	error: Error | null;
	/** Local peer ID assigned by server */
	peerId: string | null;
	/** Remote peer IDs */
	remotePeerIds: string[];
	/** Remote streams keyed by peer ID */
	remoteStreams: Map<string, MediaStream>;
	/** Whether audio is muted */
	isAudioMuted: boolean;
	/** Whether video is muted */
	isVideoMuted: boolean;
	/** Whether this is a data-only connection (no media) */
	isDataOnly: boolean;
	/** Whether screen sharing is active */
	isScreenSharing: boolean;
	/** Manually start the connection (if autoConnect is false) */
	connect: () => void;
	/** End the call */
	hangup: () => void;
	/** Mute or unmute audio */
	muteAudio: (muted: boolean) => void;
	/** Mute or unmute video */
	muteVideo: (muted: boolean) => void;

	// Screen sharing
	/** Start screen sharing */
	startScreenShare: (options?: DisplayMediaStreamOptions) => Promise<void>;
	/** Stop screen sharing */
	stopScreenShare: () => Promise<void>;

	// Data channel methods
	/** Create a new data channel to all peers */
	createDataChannel: (config: DataChannelConfig) => Map<string, RTCDataChannel>;
	/** Get all open data channel labels */
	getDataChannelLabels: () => string[];
	/** Get the state of a data channel for a specific peer */
	getDataChannelState: (peerId: string, label: string) => DataChannelState | null;
	/** Send a string message to all peers */
	sendString: (label: string, data: string) => boolean;
	/** Send a string message to a specific peer */
	sendStringTo: (peerId: string, label: string, data: string) => boolean;
	/** Send binary data to all peers */
	sendBinary: (label: string, data: ArrayBuffer | Uint8Array) => boolean;
	/** Send binary data to a specific peer */
	sendBinaryTo: (peerId: string, label: string, data: ArrayBuffer | Uint8Array) => boolean;
	/** Send JSON data to all peers */
	sendJSON: (label: string, data: unknown) => boolean;
	/** Send JSON data to a specific peer */
	sendJSONTo: (peerId: string, label: string, data: unknown) => boolean;
	/** Close a specific data channel on all peers */
	closeDataChannel: (label: string) => boolean;

	// Stats
	/** Get quality summary for a peer */
	getQualitySummary: (peerId: string) => Promise<ConnectionQualitySummary | null>;
	/** Get quality summaries for all peers */
	getAllQualitySummaries: () => Promise<Map<string, ConnectionQualitySummary>>;

	// Recording
	/** Start recording a stream */
	startRecording: (streamId: string, options?: RecordingOptions) => RecordingHandle | null;
	/** Check if a stream is being recorded */
	isRecording: (streamId: string) => boolean;
	/** Stop all recordings */
	stopAllRecordings: () => Promise<Map<string, Blob>>;
}

/**
 * React hook for WebRTC peer-to-peer audio/video/data calls.
 *
 * Supports multi-peer mesh networking, screen sharing, recording, and stats.
 *
 * @example
 * ```tsx
 * function VideoCall({ roomId }: { roomId: string }) {
 *   const {
 *     localVideoRef,
 *     state,
 *     remotePeerIds,
 *     remoteStreams,
 *     hangup,
 *     muteAudio,
 *     isAudioMuted,
 *     startScreenShare,
 *   } = useWebRTCCall({
 *     roomId,
 *     signalUrl: '/call/signal',
 *     callbacks: {
 *       onStateChange: (from, to, reason) => console.log(`${from} → ${to}`, reason),
 *       onRemoteStream: (peerId, stream) => console.log(`Got stream from ${peerId}`),
 *     },
 *   });
 *
 *   return (
 *     <div>
 *       <video ref={localVideoRef} autoPlay muted playsInline />
 *       {remotePeerIds.map((peerId) => (
 *         <RemoteVideo key={peerId} stream={remoteStreams.get(peerId)} />
 *       ))}
 *       <p>State: {state}</p>
 *       <button onClick={() => muteAudio(!isAudioMuted)}>
 *         {isAudioMuted ? 'Unmute' : 'Mute'}
 *       </button>
 *       <button onClick={hangup}>Hang Up</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useWebRTCCall(options: UseWebRTCCallOptions): UseWebRTCCallResult {
	const context = useContext(AgentuityContext);

	const managerRef = useRef<WebRTCManager | null>(null);
	const localVideoRef = useRef<HTMLVideoElement | null>(null);

	const [state, setState] = useState<WebRTCConnectionState>('idle');
	const [error, setError] = useState<Error | null>(null);
	const [peerId, setPeerId] = useState<string | null>(null);
	const [remotePeerIds, setRemotePeerIds] = useState<string[]>([]);
	const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
	const [isAudioMuted, setIsAudioMuted] = useState(false);
	const [isVideoMuted, setIsVideoMuted] = useState(false);
	const [isScreenSharing, setIsScreenSharing] = useState(false);

	const userCallbacksRef = useRef(options.callbacks);
	userCallbacksRef.current = options.callbacks;

	const signalUrl = useMemo(() => {
		if (options.signalUrl.startsWith('ws://') || options.signalUrl.startsWith('wss://')) {
			return options.signalUrl;
		}
		const base = context?.baseUrl ?? window.location.origin;
		const wsBase = base.replace(/^http(s?):/, 'ws$1:');
		return buildUrl(wsBase, options.signalUrl);
	}, [context?.baseUrl, options.signalUrl]);

	const managerOptions = useMemo((): WebRTCManagerOptions => {
		return {
			signalUrl,
			roomId: options.roomId,
			polite: options.polite,
			iceServers: options.iceServers,
			media: options.media,
			dataChannels: options.dataChannels,
			callbacks: {
				onStateChange: (from, to, reason) => {
					setState(to);
					if (managerRef.current) {
						const managerState = managerRef.current.getState();
						setPeerId(managerState.peerId);
						setRemotePeerIds(managerState.remotePeerIds);
						setIsScreenSharing(managerState.isScreenSharing);
					}
					userCallbacksRef.current?.onStateChange?.(from, to, reason);
				},
				onConnect: () => {
					userCallbacksRef.current?.onConnect?.();
				},
				onDisconnect: (reason) => {
					userCallbacksRef.current?.onDisconnect?.(reason);
				},
				onLocalStream: (stream) => {
					if (localVideoRef.current) {
						localVideoRef.current.srcObject = stream;
					}
					userCallbacksRef.current?.onLocalStream?.(stream);
				},
				onRemoteStream: (remotePeerId, stream) => {
					setRemoteStreams((prev) => {
						const next = new Map(prev);
						next.set(remotePeerId, stream);
						return next;
					});
					userCallbacksRef.current?.onRemoteStream?.(remotePeerId, stream);
				},
				onTrackAdded: (remotePeerId, track, stream) => {
					userCallbacksRef.current?.onTrackAdded?.(remotePeerId, track, stream);
				},
				onTrackRemoved: (remotePeerId, track) => {
					userCallbacksRef.current?.onTrackRemoved?.(remotePeerId, track);
				},
				onPeerJoined: (id) => {
					setRemotePeerIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
					userCallbacksRef.current?.onPeerJoined?.(id);
				},
				onPeerLeft: (id) => {
					setRemotePeerIds((prev) => prev.filter((p) => p !== id));
					setRemoteStreams((prev) => {
						const next = new Map(prev);
						next.delete(id);
						return next;
					});
					userCallbacksRef.current?.onPeerLeft?.(id);
				},
				onNegotiationStart: (remotePeerId) => {
					userCallbacksRef.current?.onNegotiationStart?.(remotePeerId);
				},
				onNegotiationComplete: (remotePeerId) => {
					userCallbacksRef.current?.onNegotiationComplete?.(remotePeerId);
				},
				onIceCandidate: (remotePeerId, candidate) => {
					userCallbacksRef.current?.onIceCandidate?.(remotePeerId, candidate);
				},
				onIceStateChange: (remotePeerId, iceState) => {
					userCallbacksRef.current?.onIceStateChange?.(remotePeerId, iceState);
				},
				onError: (err, currentState) => {
					setError(err);
					userCallbacksRef.current?.onError?.(err, currentState);
				},
				onDataChannelOpen: (remotePeerId, label) => {
					userCallbacksRef.current?.onDataChannelOpen?.(remotePeerId, label);
				},
				onDataChannelClose: (remotePeerId, label) => {
					userCallbacksRef.current?.onDataChannelClose?.(remotePeerId, label);
				},
				onDataChannelMessage: (remotePeerId, label, data) => {
					userCallbacksRef.current?.onDataChannelMessage?.(remotePeerId, label, data);
				},
				onDataChannelError: (remotePeerId, label, err) => {
					userCallbacksRef.current?.onDataChannelError?.(remotePeerId, label, err);
				},
				onScreenShareStart: () => {
					setIsScreenSharing(true);
					userCallbacksRef.current?.onScreenShareStart?.();
				},
				onScreenShareStop: () => {
					setIsScreenSharing(false);
					userCallbacksRef.current?.onScreenShareStop?.();
				},
			},
		};
	}, [
		signalUrl,
		options.roomId,
		options.polite,
		options.iceServers,
		options.media,
		options.dataChannels,
	]);

	useEffect(() => {
		const manager = new WebRTCManager(managerOptions);
		managerRef.current = manager;

		if (options.autoConnect !== false) {
			manager.connect();
		}

		return () => {
			manager.dispose();
			managerRef.current = null;
		};
	}, [managerOptions, options.autoConnect]);

	const connect = useCallback(() => {
		managerRef.current?.connect();
	}, []);

	const hangup = useCallback(() => {
		managerRef.current?.hangup();
		setRemotePeerIds([]);
		setRemoteStreams(new Map());
	}, []);

	const muteAudio = useCallback((muted: boolean) => {
		managerRef.current?.muteAudio(muted);
		setIsAudioMuted(muted);
	}, []);

	const muteVideo = useCallback((muted: boolean) => {
		managerRef.current?.muteVideo(muted);
		setIsVideoMuted(muted);
	}, []);

	const startScreenShare = useCallback(async (opts?: DisplayMediaStreamOptions) => {
		await managerRef.current?.startScreenShare(opts);
	}, []);

	const stopScreenShare = useCallback(async () => {
		await managerRef.current?.stopScreenShare();
	}, []);

	const createDataChannel = useCallback((config: DataChannelConfig) => {
		return managerRef.current?.createDataChannel(config) ?? new Map();
	}, []);

	const getDataChannelLabels = useCallback(() => {
		return managerRef.current?.getDataChannelLabels() ?? [];
	}, []);

	const getDataChannelState = useCallback((remotePeerId: string, label: string) => {
		return managerRef.current?.getDataChannelState(remotePeerId, label) ?? null;
	}, []);

	const sendString = useCallback((label: string, data: string) => {
		return managerRef.current?.sendString(label, data) ?? false;
	}, []);

	const sendStringTo = useCallback((remotePeerId: string, label: string, data: string) => {
		return managerRef.current?.sendStringTo(remotePeerId, label, data) ?? false;
	}, []);

	const sendBinary = useCallback((label: string, data: ArrayBuffer | Uint8Array) => {
		return managerRef.current?.sendBinary(label, data) ?? false;
	}, []);

	const sendBinaryTo = useCallback(
		(remotePeerId: string, label: string, data: ArrayBuffer | Uint8Array) => {
			return managerRef.current?.sendBinaryTo(remotePeerId, label, data) ?? false;
		},
		[]
	);

	const sendJSON = useCallback((label: string, data: unknown) => {
		return managerRef.current?.sendJSON(label, data) ?? false;
	}, []);

	const sendJSONTo = useCallback((remotePeerId: string, label: string, data: unknown) => {
		return managerRef.current?.sendJSONTo(remotePeerId, label, data) ?? false;
	}, []);

	const closeDataChannel = useCallback((label: string) => {
		return managerRef.current?.closeDataChannel(label) ?? false;
	}, []);

	const getQualitySummary = useCallback(async (remotePeerId: string) => {
		return managerRef.current?.getQualitySummary(remotePeerId) ?? null;
	}, []);

	const getAllQualitySummaries = useCallback(async () => {
		return managerRef.current?.getAllQualitySummaries() ?? new Map();
	}, []);

	const startRecording = useCallback((streamId: string, opts?: RecordingOptions) => {
		return managerRef.current?.startRecording(streamId, opts) ?? null;
	}, []);

	const isRecordingFn = useCallback((streamId: string) => {
		return managerRef.current?.isRecording(streamId) ?? false;
	}, []);

	const stopAllRecordings = useCallback(async () => {
		return managerRef.current?.stopAllRecordings() ?? new Map();
	}, []);

	return {
		localVideoRef,
		state,
		error,
		peerId,
		remotePeerIds,
		remoteStreams,
		isAudioMuted,
		isVideoMuted,
		isDataOnly: options.media === false,
		isScreenSharing,
		connect,
		hangup,
		muteAudio,
		muteVideo,
		startScreenShare,
		stopScreenShare,
		createDataChannel,
		getDataChannelLabels,
		getDataChannelState,
		sendString,
		sendStringTo,
		sendBinary,
		sendBinaryTo,
		sendJSON,
		sendJSONTo,
		closeDataChannel,
		getQualitySummary,
		getAllQualitySummaries,
		startRecording,
		isRecording: isRecordingFn,
		stopAllRecordings,
	};
}
