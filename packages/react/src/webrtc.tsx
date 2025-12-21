import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
    WebRTCManager,
    buildUrl,
    type WebRTCStatus,
    type WebRTCManagerOptions,
} from '@agentuity/frontend';
import { AgentuityContext } from './context';

export type { WebRTCStatus };

/**
 * Options for useWebRTCCall hook
 */
export interface UseWebRTCCallOptions {
    /** Room ID to join */
    roomId: string;
    /** WebSocket signaling URL (e.g., '/call/signal' or full URL) */
    signalUrl: string;
    /** Whether this peer is "polite" in perfect negotiation (default: true for first joiner) */
    polite?: boolean;
    /** ICE servers configuration */
    iceServers?: RTCIceServer[];
    /** Media constraints for getUserMedia */
    media?: MediaStreamConstraints;
    /** Whether to auto-connect on mount (default: true) */
    autoConnect?: boolean;
}

/**
 * Return type for useWebRTCCall hook
 */
export interface UseWebRTCCallResult {
    /** Ref to attach to local video element */
    localVideoRef: React.RefObject<HTMLVideoElement | null>;
    /** Ref to attach to remote video element */
    remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
    /** Current connection status */
    status: WebRTCStatus;
    /** Current error if any */
    error: Error | null;
    /** Local peer ID assigned by server */
    peerId: string | null;
    /** Remote peer ID */
    remotePeerId: string | null;
    /** Whether audio is muted */
    isAudioMuted: boolean;
    /** Whether video is muted */
    isVideoMuted: boolean;
    /** Manually start the connection (if autoConnect is false) */
    connect: () => void;
    /** End the call */
    hangup: () => void;
    /** Mute or unmute audio */
    muteAudio: (muted: boolean) => void;
    /** Mute or unmute video */
    muteVideo: (muted: boolean) => void;
}

/**
 * React hook for WebRTC peer-to-peer audio/video calls.
 *
 * Handles WebRTC signaling, media capture, and peer connection management.
 *
 * @example
 * ```tsx
 * function VideoCall({ roomId }: { roomId: string }) {
 *   const {
 *     localVideoRef,
 *     remoteVideoRef,
 *     status,
 *     hangup,
 *     muteAudio,
 *     isAudioMuted,
 *   } = useWebRTCCall({
 *     roomId,
 *     signalUrl: '/call/signal',
 *   });
 *
 *   return (
 *     <div>
 *       <video ref={localVideoRef} autoPlay muted playsInline />
 *       <video ref={remoteVideoRef} autoPlay playsInline />
 *       <p>Status: {status}</p>
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
    const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

    const [status, setStatus] = useState<WebRTCStatus>('disconnected');
    const [error, setError] = useState<Error | null>(null);
    const [peerId, setPeerId] = useState<string | null>(null);
    const [remotePeerId, setRemotePeerId] = useState<string | null>(null);
    const [isAudioMuted, setIsAudioMuted] = useState(false);
    const [isVideoMuted, setIsVideoMuted] = useState(false);

    // Build full signaling URL
    const signalUrl = useMemo(() => {
        // If it's already a full URL, use as-is
        if (options.signalUrl.startsWith('ws://') || options.signalUrl.startsWith('wss://')) {
            return options.signalUrl;
        }

        // Build from context base URL
        const base = context?.baseUrl ?? window.location.origin;
        const wsBase = base.replace(/^http(s?):/, 'ws$1:');
        return buildUrl(wsBase, options.signalUrl);
    }, [context?.baseUrl, options.signalUrl]);

    // Create manager options - use refs to avoid recreating manager on state changes
    const managerOptions = useMemo((): WebRTCManagerOptions => {
        return {
            signalUrl,
            roomId: options.roomId,
            polite: options.polite,
            iceServers: options.iceServers,
            media: options.media,
            callbacks: {
                onLocalStream: (stream) => {
                    if (localVideoRef.current) {
                        localVideoRef.current.srcObject = stream;
                    }
                },
                onRemoteStream: (stream) => {
                    if (remoteVideoRef.current) {
                        remoteVideoRef.current.srcObject = stream;
                    }
                },
                onStatusChange: (newStatus) => {
                    setStatus(newStatus);
                    if (managerRef.current) {
                        const state = managerRef.current.getState();
                        setPeerId(state.peerId);
                        setRemotePeerId(state.remotePeerId);
                    }
                },
                onError: (err) => {
                    setError(err);
                },
                onPeerJoined: (id) => {
                    setRemotePeerId(id);
                },
                onPeerLeft: (id) => {
                    setRemotePeerId((current) => current === id ? null : current);
                },
            },
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signalUrl, options.roomId, options.polite, options.iceServers, options.media]);

    // Initialize manager
    useEffect(() => {
        const manager = new WebRTCManager(managerOptions);
        managerRef.current = manager;

        // Auto-connect if enabled (default: true)
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
        setStatus('disconnected');
        setPeerId(null);
        setRemotePeerId(null);
    }, []);

    const muteAudio = useCallback((muted: boolean) => {
        managerRef.current?.muteAudio(muted);
        setIsAudioMuted(muted);
    }, []);

    const muteVideo = useCallback((muted: boolean) => {
        managerRef.current?.muteVideo(muted);
        setIsVideoMuted(muted);
    }, []);

    return {
        localVideoRef,
        remoteVideoRef,
        status,
        error,
        peerId,
        remotePeerId,
        isAudioMuted,
        isVideoMuted,
        connect,
        hangup,
        muteAudio,
        muteVideo,
    };
}
