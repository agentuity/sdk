import { useCallback, useEffect, useRef, useState } from 'react';
import { usePersistentDemoState } from '../hooks/usePersistentDemoState';
import { Button, Input } from './ui';

type ConnectionStatus =
	| 'idle'
	| 'media'
	| 'signaling'
	| 'waiting'
	| 'connecting'
	| 'connected'
	| 'closed'
	| 'error';

type ChatMessageType = 'sent' | 'received' | 'system' | 'error';

interface ChatMessage {
	readonly id: number;
	readonly type: ChatMessageType;
	readonly message: string;
	readonly timestamp: string;
}

interface DescriptionSignal {
	readonly kind: 'description';
	readonly description: RTCSessionDescriptionInit;
}

interface CandidateSignal {
	readonly kind: 'candidate';
	readonly candidate: RTCIceCandidateInit;
}

type SignalPayload = CandidateSignal | DescriptionSignal;

interface JoinedMessage {
	readonly type: 'joined';
	readonly roomId: string;
	readonly peerId: string;
	readonly waiting: boolean;
}

interface PeerJoinedMessage {
	readonly type: 'peer-joined';
	readonly peerId: string;
	readonly initiator: boolean;
}

interface PeerLeftMessage {
	readonly type: 'peer-left';
	readonly peerId: string;
}

interface SignalMessage {
	readonly type: 'signal';
	readonly from: string;
	readonly data: SignalPayload;
}

interface ErrorMessage {
	readonly type: 'error' | 'room-full';
	readonly message: string;
}

type ServerMessage =
	| ErrorMessage
	| JoinedMessage
	| PeerJoinedMessage
	| PeerLeftMessage
	| SignalMessage;

interface DataChannelMessage {
	readonly type: 'chat';
	readonly text: string;
	readonly timestamp: string;
}

const DEFAULT_ROOM_ID = 'agentuity-demo';
const ICE_SERVERS: RTCConfiguration = {
	iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function stringValue(record: Record<string, unknown>, key: string): string | null {
	const value = record[key];
	return typeof value === 'string' ? value : null;
}

function booleanValue(record: Record<string, unknown>, key: string): boolean | null {
	const value = record[key];
	return typeof value === 'boolean' ? value : null;
}

function isDescriptionType(value: string | null): value is RTCSdpType {
	return value === 'answer' || value === 'offer' || value === 'pranswer' || value === 'rollback';
}

function parseSignalPayload(value: unknown): SignalPayload | null {
	if (!isRecord(value)) {
		return null;
	}

	const kind = stringValue(value, 'kind');
	if (kind === 'description') {
		const description = value.description;
		if (!isRecord(description)) {
			return null;
		}

		const type = stringValue(description, 'type');
		const sdp = stringValue(description, 'sdp');
		if (!isDescriptionType(type) || typeof sdp !== 'string') {
			return null;
		}

		return {
			kind,
			description: { type, sdp },
		};
	}

	if (kind === 'candidate') {
		const candidate = value.candidate;
		if (!isRecord(candidate)) {
			return null;
		}

		const candidateText = stringValue(candidate, 'candidate');
		if (candidateText === null) {
			return null;
		}

		const sdpMid = stringValue(candidate, 'sdpMid') ?? undefined;
		const sdpMLineIndex =
			typeof candidate.sdpMLineIndex === 'number' ? candidate.sdpMLineIndex : undefined;
		const usernameFragment = stringValue(candidate, 'usernameFragment') ?? undefined;

		return {
			kind,
			candidate: {
				candidate: candidateText,
				sdpMid,
				sdpMLineIndex,
				usernameFragment,
			},
		};
	}

	return null;
}

function parseServerMessage(data: unknown): ServerMessage | null {
	if (typeof data !== 'string') {
		return null;
	}

	try {
		const parsed: unknown = JSON.parse(data);
		if (!isRecord(parsed)) {
			return null;
		}

		const type = stringValue(parsed, 'type');
		if (type === 'joined') {
			const roomId = stringValue(parsed, 'roomId');
			const peerId = stringValue(parsed, 'peerId');
			const waiting = booleanValue(parsed, 'waiting');
			if (!roomId || !peerId || waiting === null) {
				return null;
			}
			return { type, roomId, peerId, waiting };
		}

		if (type === 'peer-joined') {
			const peerId = stringValue(parsed, 'peerId');
			const initiator = booleanValue(parsed, 'initiator');
			if (!peerId || initiator === null) {
				return null;
			}
			return { type, peerId, initiator };
		}

		if (type === 'peer-left') {
			const peerId = stringValue(parsed, 'peerId');
			return peerId ? { type, peerId } : null;
		}

		if (type === 'signal') {
			const from = stringValue(parsed, 'from');
			const signal = parseSignalPayload(parsed.data);
			if (!from || !signal) {
				return null;
			}
			return { type, from, data: signal };
		}

		if (type === 'error' || type === 'room-full') {
			const message = stringValue(parsed, 'message');
			return message ? { type, message } : null;
		}

		return null;
	} catch {
		return null;
	}
}

function parseDataChannelMessage(data: unknown): DataChannelMessage | null {
	if (typeof data !== 'string') {
		return null;
	}

	try {
		const parsed: unknown = JSON.parse(data);
		if (!isRecord(parsed) || parsed.type !== 'chat') {
			return null;
		}

		const text = stringValue(parsed, 'text');
		const timestamp = stringValue(parsed, 'timestamp');
		if (!text || !timestamp) {
			return null;
		}

		return { type: 'chat', text, timestamp };
	} catch {
		return null;
	}
}

function supportError(): string | null {
	if (typeof window === 'undefined') {
		return null;
	}
	if (!window.isSecureContext) {
		return 'WebRTC media capture requires localhost or HTTPS.';
	}
	if (!navigator.mediaDevices?.getUserMedia) {
		return 'This browser does not expose camera and microphone capture.';
	}
	if (typeof RTCPeerConnection === 'undefined') {
		return 'This browser does not support RTCPeerConnection.';
	}
	return null;
}

function statusLabel(status: ConnectionStatus): string {
	switch (status) {
		case 'media':
			return 'Opening media';
		case 'signaling':
			return 'Signaling';
		case 'waiting':
			return 'Waiting for peer';
		case 'connecting':
			return 'Connecting';
		case 'connected':
			return 'Connected';
		case 'closed':
			return 'Closed';
		case 'error':
			return 'Error';
		case 'idle':
		default:
			return 'Idle';
	}
}

function statusDotClass(status: ConnectionStatus): string {
	switch (status) {
		case 'connected':
			return 'bg-emerald-500';
		case 'media':
		case 'signaling':
		case 'waiting':
		case 'connecting':
			return 'bg-yellow-500 animate-pulse';
		case 'error':
			return 'bg-red-500';
		default:
			return 'bg-zinc-600';
	}
}

export function WebRTCDemo() {
	const [roomId, setRoomId] = usePersistentDemoState<string>('webrtc', 'room-id', {
		defaultValue: DEFAULT_ROOM_ID,
		storage: 'local',
	});
	const [status, setStatus] = useState<ConnectionStatus>('idle');
	const [peerId, setPeerId] = useState<string | null>(null);
	const [remotePeerId, setRemotePeerId] = useState<string | null>(null);
	const [localStream, setLocalStream] = useState<MediaStream | null>(null);
	const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
	const [audioEnabled, setAudioEnabled] = useState(true);
	const [videoEnabled, setVideoEnabled] = useState(true);
	const [chatInput, setChatInput] = useState('');
	const [messages, setMessages] = useState<ChatMessage[]>([]);

	const localVideoRef = useRef<HTMLVideoElement | null>(null);
	const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
	const pcRef = useRef<RTCPeerConnection | null>(null);
	const wsRef = useRef<WebSocket | null>(null);
	const dataChannelRef = useRef<RTCDataChannel | null>(null);
	const localStreamRef = useRef<MediaStream | null>(null);
	const messageIdRef = useRef(0);

	useEffect(() => {
		localStreamRef.current = localStream;
		if (localVideoRef.current) {
			localVideoRef.current.srcObject = localStream;
		}
	}, [localStream]);

	useEffect(() => {
		if (remoteVideoRef.current) {
			remoteVideoRef.current.srcObject = remoteStream;
		}
	}, [remoteStream]);

	const appendMessage = useCallback((type: ChatMessageType, message: string) => {
		setMessages((prev) => [
			...prev.slice(-49),
			{
				id: messageIdRef.current++,
				type,
				message,
				timestamp: new Date().toISOString(),
			},
		]);
	}, []);

	const sendSocketMessage = useCallback((value: unknown) => {
		const ws = wsRef.current;
		if (!ws || ws.readyState !== WebSocket.OPEN) {
			return;
		}
		ws.send(JSON.stringify(value));
	}, []);

	const sendSignal = useCallback(
		(payload: SignalPayload) => {
			sendSocketMessage({
				type: 'signal',
				data: payload,
			});
		},
		[sendSocketMessage]
	);

	const attachDataChannel = useCallback(
		(channel: RTCDataChannel) => {
			dataChannelRef.current = channel;

			channel.onopen = () => {
				appendMessage('system', 'Data channel is open. Chat messages now move peer-to-peer.');
			};

			channel.onmessage = (event) => {
				const parsed = parseDataChannelMessage(event.data);
				if (!parsed) {
					appendMessage('received', String(event.data));
					return;
				}
				appendMessage('received', parsed.text);
			};

			channel.onclose = () => {
				appendMessage('system', 'Data channel closed.');
			};
		},
		[appendMessage]
	);

	const closeConnections = useCallback(() => {
		dataChannelRef.current?.close();
		dataChannelRef.current = null;

		pcRef.current?.close();
		pcRef.current = null;

		wsRef.current?.close();
		wsRef.current = null;

		localStreamRef.current?.getTracks().forEach((track) => track.stop());
		localStreamRef.current = null;
		setLocalStream(null);
		setRemoteStream(null);
		setPeerId(null);
		setRemotePeerId(null);
		setStatus('closed');
	}, []);

	const createOffer = useCallback(async () => {
		const pc = pcRef.current;
		if (!pc) {
			return;
		}

		const channel = pc.createDataChannel('messages');
		attachDataChannel(channel);

		const offer = await pc.createOffer();
		await pc.setLocalDescription(offer);
		if (pc.localDescription) {
			sendSignal({
				kind: 'description',
				description: pc.localDescription.toJSON(),
			});
		}
	}, [attachDataChannel, sendSignal]);

	const handleSignal = useCallback(
		async (payload: SignalPayload) => {
			const pc = pcRef.current;
			if (!pc) {
				return;
			}

			if (payload.kind === 'candidate') {
				await pc.addIceCandidate(payload.candidate);
				return;
			}

			await pc.setRemoteDescription(payload.description);
			if (payload.description.type === 'offer') {
				const answer = await pc.createAnswer();
				await pc.setLocalDescription(answer);
				if (pc.localDescription) {
					sendSignal({
						kind: 'description',
						description: pc.localDescription.toJSON(),
					});
				}
			}
		},
		[sendSignal]
	);

	const connect = useCallback(async () => {
		const error = supportError();
		if (error) {
			setStatus('error');
			appendMessage('error', error);
			return;
		}

		closeConnections();
		setMessages([]);
		setStatus('media');

		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: true,
				video: true,
			});
			localStreamRef.current = stream;
			setLocalStream(stream);
			setAudioEnabled(true);
			setVideoEnabled(true);

			const pc = new RTCPeerConnection(ICE_SERVERS);
			pcRef.current = pc;

			for (const track of stream.getTracks()) {
				pc.addTrack(track, stream);
			}

			pc.ontrack = (event) => {
				const [streamFromPeer] = event.streams;
				if (streamFromPeer) {
					setRemoteStream(streamFromPeer);
					return;
				}

				setRemoteStream(new MediaStream([event.track]));
			};

			pc.onicecandidate = (event) => {
				if (event.candidate) {
					sendSignal({
						kind: 'candidate',
						candidate: event.candidate.toJSON(),
					});
				}
			};

			pc.onconnectionstatechange = () => {
				if (pc.connectionState === 'connected') {
					setStatus('connected');
				} else if (pc.connectionState === 'failed') {
					setStatus('error');
					appendMessage('error', 'WebRTC connection failed. Try a new room or add TURN.');
				} else if (pc.connectionState === 'closed' || pc.connectionState === 'disconnected') {
					setStatus('closed');
				} else if (pc.connectionState === 'connecting') {
					setStatus('connecting');
				}
			};

			pc.ondatachannel = (event) => {
				attachDataChannel(event.channel);
			};

			const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
			const ws = new WebSocket(
				`${protocol}//${window.location.host}/api/webrtc/signal?room=${encodeURIComponent(
					roomId.trim() || DEFAULT_ROOM_ID
				)}`
			);
			wsRef.current = ws;

			ws.onopen = () => {
				setStatus('signaling');
			};

			ws.onmessage = async (event) => {
				const message = parseServerMessage(event.data);
				if (!message) {
					appendMessage('error', 'Received an unknown signaling message.');
					return;
				}

				if (message.type === 'joined') {
					setPeerId(message.peerId);
					setStatus(message.waiting ? 'waiting' : 'signaling');
					appendMessage(
						'system',
						message.waiting
							? 'Joined room. Open this page in another tab with the same room ID.'
							: 'Joined room. Waiting for the offer.'
					);
					return;
				}

				if (message.type === 'peer-joined') {
					setRemotePeerId(message.peerId);
					setStatus('connecting');
					appendMessage('system', `Peer ${message.peerId} joined.`);
					if (message.initiator) {
						await createOffer();
					}
					return;
				}

				if (message.type === 'peer-left') {
					setRemotePeerId(null);
					setRemoteStream(null);
					setStatus('waiting');
					appendMessage('system', `Peer ${message.peerId} left the room.`);
					return;
				}

				if (message.type === 'signal') {
					setRemotePeerId(message.from);
					await handleSignal(message.data);
					return;
				}

				setStatus('error');
				appendMessage('error', message.message);
			};

			ws.onclose = () => {
				if (pcRef.current?.connectionState !== 'connected') {
					setStatus('closed');
				}
			};

			ws.onerror = () => {
				setStatus('error');
				appendMessage('error', 'Signaling socket failed.');
			};
		} catch (err) {
			setStatus('error');
			appendMessage(
				'error',
				err instanceof Error ? err.message : 'Could not start the WebRTC session.'
			);
		}
	}, [
		appendMessage,
		attachDataChannel,
		closeConnections,
		createOffer,
		handleSignal,
		roomId,
		sendSignal,
	]);

	const toggleAudio = useCallback(() => {
		const next = !audioEnabled;
		localStream?.getAudioTracks().forEach((track) => {
			track.enabled = next;
		});
		setAudioEnabled(next);
	}, [audioEnabled, localStream]);

	const toggleVideo = useCallback(() => {
		const next = !videoEnabled;
		localStream?.getVideoTracks().forEach((track) => {
			track.enabled = next;
		});
		setVideoEnabled(next);
	}, [localStream, videoEnabled]);

	const sendChat = useCallback(() => {
		const message = chatInput.trim();
		const channel = dataChannelRef.current;
		if (!message || !channel || channel.readyState !== 'open') {
			return;
		}

		const payload: DataChannelMessage = {
			type: 'chat',
			text: message,
			timestamp: new Date().toISOString(),
		};
		channel.send(JSON.stringify(payload));
		appendMessage('sent', message);
		setChatInput('');
	}, [appendMessage, chatInput]);

	useEffect(() => {
		return () => {
			dataChannelRef.current?.close();
			pcRef.current?.close();
			wsRef.current?.close();
			localStreamRef.current?.getTracks().forEach((track) => track.stop());
		};
	}, []);

	const canConnect = status === 'idle' || status === 'closed' || status === 'error';
	const connected = status === 'connected';
	const localPeerLabel = peerId ? `Peer ${peerId}` : 'Local peer';
	const remotePeerLabel = remotePeerId ? `Peer ${remotePeerId}` : 'Remote peer';

	return (
		<div className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-900 dark:bg-black">
			<div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-900">
				<div className="flex flex-col gap-3 md:flex-row md:items-end">
					<div className="min-w-0 flex-1">
						<label
							htmlFor="webrtc-room"
							className="mb-2 block text-xs uppercase text-zinc-500 dark:text-zinc-400"
						>
							Room ID
						</label>
						<Input
							id="webrtc-room"
							value={roomId}
							onChange={(event) => setRoomId(event.target.value)}
							disabled={!canConnect}
							className="font-mono"
						/>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<Button
							variant={canConnect ? 'default' : 'destructive'}
							size="sm"
							onClick={canConnect ? connect : closeConnections}
							className="min-h-11 min-w-28 justify-center md:min-h-9"
						>
							{canConnect ? 'Connect' : 'Disconnect'}
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={toggleAudio}
							disabled={!localStream}
							className="min-h-11 md:min-h-9"
						>
							{audioEnabled ? 'Mute' : 'Unmute'}
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={toggleVideo}
							disabled={!localStream}
							className="min-h-11 md:min-h-9"
						>
							{videoEnabled ? 'Camera off' : 'Camera on'}
						</Button>
					</div>
				</div>
				<div className="mt-3 flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
					<span className={`h-2 w-2 rounded-full ${statusDotClass(status)}`} />
					<span>{statusLabel(status)}</span>
					<span className="hidden text-zinc-400 dark:text-zinc-600 sm:inline">/</span>
					<span className="hidden sm:inline">
						Open the same room in another tab to connect.
					</span>
				</div>
			</div>

			<div className="grid gap-4 p-4 lg:grid-cols-2">
				<div className="overflow-hidden rounded-md border border-zinc-200 bg-zinc-950 dark:border-zinc-800">
					<div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2 text-xs text-zinc-400">
						<span>{localPeerLabel}</span>
						<span>
							{audioEnabled ? 'Mic on' : 'Muted'} /{' '}
							{videoEnabled ? 'Camera on' : 'Camera off'}
						</span>
					</div>
					<div className="relative aspect-video bg-zinc-950">
						<video
							ref={localVideoRef}
							autoPlay
							muted
							playsInline
							className="h-full w-full object-cover"
						/>
						{!localStream && (
							<div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-zinc-500">
								Connect to start local media.
							</div>
						)}
					</div>
				</div>

				<div className="overflow-hidden rounded-md border border-zinc-200 bg-zinc-950 dark:border-zinc-800">
					<div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2 text-xs text-zinc-400">
						<span>{remotePeerLabel}</span>
						<span>{remoteStream ? 'Media active' : 'Waiting'}</span>
					</div>
					<div className="relative aspect-video bg-zinc-950">
						{/* biome-ignore lint/a11y/useMediaCaption: live peer media has no captions source */}
						<video
							ref={remoteVideoRef}
							autoPlay
							playsInline
							className="h-full w-full object-cover"
						/>
						{!remoteStream && (
							<div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-zinc-500">
								Remote media appears after the peer connection finishes negotiation.
							</div>
						)}
					</div>
				</div>
			</div>

			<div className="border-t border-zinc-200 p-4 dark:border-zinc-900">
				<div className="mb-3 flex gap-2">
					<Input
						value={chatInput}
						onChange={(event) => setChatInput(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === 'Enter') {
								sendChat();
							}
						}}
						placeholder="Send a data-channel message"
						disabled={!connected || dataChannelRef.current?.readyState !== 'open'}
					/>
					<Button
						type="button"
						onClick={sendChat}
						disabled={!connected || dataChannelRef.current?.readyState !== 'open'}
					>
						Send
					</Button>
				</div>

				<div className="max-h-52 space-y-2 overflow-auto rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-900 dark:bg-zinc-950">
					{messages.length === 0 ? (
						<p className="text-sm text-zinc-500">
							Connection events and data-channel messages appear here.
						</p>
					) : (
						messages.map((message) => (
							<div
								key={message.id}
								className={`rounded-md border px-3 py-2 text-sm ${
									message.type === 'error'
										? 'border-red-500/20 bg-red-500/8 text-red-700 dark:text-red-300'
										: message.type === 'sent'
											? 'ml-8 border-cyan-500/15 bg-cyan-500/8 text-zinc-800 dark:text-zinc-200'
											: message.type === 'received'
												? 'mr-8 border-emerald-500/15 bg-emerald-500/8 text-zinc-800 dark:text-zinc-200'
												: 'border-zinc-200 bg-white text-zinc-600 dark:border-zinc-800 dark:bg-black dark:text-zinc-400'
								}`}
							>
								<div className="mb-1 text-[11px] uppercase text-zinc-500">
									{message.type}
								</div>
								{message.message}
							</div>
						))
					)}
				</div>
			</div>
		</div>
	);
}
