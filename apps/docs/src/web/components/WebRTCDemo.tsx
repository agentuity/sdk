import { useState, useCallback, useEffect, useRef } from 'react';
import { useWebRTCCall } from '@agentuity/react';
import type { WebRTCConnectionState } from '@agentuity/react';
import type { ConnectionQualitySummary } from '@agentuity/core';
import QRCode from 'react-qr-code';
import { Button, Input } from './ui';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/tabs';

const MAX_MESSAGES = 100;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

interface ChatMessage {
	id: number;
	type: 'sent' | 'received' | 'system' | 'error';
	message: string;
	peerId?: string;
	timestamp: string;
}

function getStatusColor(state: WebRTCConnectionState): string {
	switch (state) {
		case 'connected':
			return 'bg-emerald-500';
		case 'connecting':
		case 'signaling':
		case 'negotiating':
			return 'bg-yellow-500 animate-pulse';
		case 'idle':
		default:
			return 'bg-zinc-600';
	}
}

function getStatusLabel(state: WebRTCConnectionState): string {
	switch (state) {
		case 'idle':
			return 'Idle';
		case 'connecting':
			return 'Connecting...';
		case 'signaling':
			return 'Signaling...';
		case 'negotiating':
			return 'Negotiating...';
		case 'connected':
			return 'Connected';
		default:
			return state;
	}
}

function getMessageStyle(type: ChatMessage['type']): string {
	switch (type) {
		case 'sent':
			return 'bg-cyan-900/30 border-cyan-500/50 ml-8';
		case 'received':
			return 'bg-zinc-800/50 border-zinc-700/50 mr-8';
		case 'system':
			return 'bg-emerald-900/30 border-emerald-700/50';
		case 'error':
			return 'bg-red-900/30 border-red-700/50';
		default:
			return 'bg-zinc-800/50 border-zinc-700/50';
	}
}

function getMessageLabel(type: ChatMessage['type']): string {
	switch (type) {
		case 'sent':
			return 'You';
		case 'received':
			return 'Remote';
		case 'system':
			return 'System';
		case 'error':
			return 'Error';
		default:
			return type;
	}
}

function CopyLinkButton({ roomId }: { roomId: string }) {
	const [copied, setCopied] = useState(false);

	const copyLink = useCallback(() => {
		const url = new URL(window.location.href);
		url.searchParams.set('room', roomId);
		navigator.clipboard.writeText(url.toString()).catch(() => {});
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	}, [roomId]);

	return (
		<Button variant="outline" size="sm" onClick={copyLink} className="grid place-items-center">
			<span className="col-start-1 row-start-1 invisible">Copy Link</span>
			<span className="col-start-1 row-start-1">{copied ? 'Copied!' : 'Copy Link'}</span>
		</Button>
	);
}

function AudioLevelIndicator({ stream }: { stream: MediaStream | null }) {
	const [level, setLevel] = useState(0);

	useEffect(() => {
		if (!stream) return;
		const audioTracks = stream.getAudioTracks();
		if (audioTracks.length === 0) return;

		let audioCtx: AudioContext | undefined;
		let source: MediaStreamAudioSourceNode | undefined;
		let animId: number;
		let active = true;

		try {
			audioCtx = new AudioContext();
			const analyser = audioCtx.createAnalyser();
			analyser.fftSize = 256;
			analyser.smoothingTimeConstant = 0.3;
			source = audioCtx.createMediaStreamSource(stream);
			source.connect(analyser);

			const dataArray = new Uint8Array(analyser.fftSize);

			const tick = () => {
				if (!active) return;
				analyser.getByteTimeDomainData(dataArray);
				let peak = 0;
				for (const val of dataArray) {
					const amplitude = Math.abs(val - 128) / 128;
					if (amplitude > peak) peak = amplitude;
				}
				setLevel(peak);
				animId = requestAnimationFrame(tick);
			};
			animId = requestAnimationFrame(tick);
		} catch {
			try { audioCtx?.close(); } catch {}
			return;
		}

		return () => {
			active = false;
			cancelAnimationFrame(animId);
			try { source?.disconnect(); } catch {}
			try { audioCtx?.close(); } catch {}
		};
	}, [stream]);

	const bars = [0.06, 0.15, 0.3, 0.5];

	return (
		<div className="flex items-end gap-[2px] h-3">
			{bars.map((threshold, i) => (
				<div
					key={i}
					className="w-[3px] rounded-sm motion-safe:transition-colors motion-safe:duration-75"
					style={{
						height: `${40 + i * 20}%`,
						backgroundColor:
							level >= threshold ? '#00FFFF' : 'rgba(63, 63, 70, 0.5)',
					}}
				/>
			))}
		</div>
	);
}

function QRCodeDisplay({ roomId }: { roomId: string }) {
	const [isVisible, setIsVisible] = useState(false);
	const url =
		typeof window !== 'undefined'
			? (() => {
					const u = new URL(window.location.href);
					u.searchParams.set('room', roomId);
					return u.toString();
				})()
			: '';

	return (
		<div className="relative">
			<Button variant="outline" size="sm" onClick={() => setIsVisible(!isVisible)}>
				{isVisible ? 'Hide QR' : 'QR Code'}
			</Button>
			{isVisible && (
				<div className="absolute right-0 top-full mt-2 bg-zinc-900 p-4 rounded-lg shadow-lg border border-zinc-700 z-50">
					<QRCode value={url} size={200} level="M" bgColor="transparent" fgColor="#ffffff" />
					<p className="text-xs text-zinc-500 mt-2 text-center max-w-[200px] truncate">
						{url}
					</p>
				</div>
			)}
		</div>
	);
}

function OpenInNewTabButton({ roomId }: { roomId: string }) {
	const openNewTab = () => {
		if (typeof window === 'undefined') return;
		const url = new URL(window.location.href);
		url.searchParams.set('room', roomId);
		window.open(url.toString(), '_blank');
	};
	return (
		<Button variant="outline" size="sm" onClick={openNewTab}>
			Open in New Tab
		</Button>
	);
}

// ---------------------------------------------------------------------------
// Data Channel Tab
// ---------------------------------------------------------------------------

function DataChannelTab({ roomId }: { roomId: string }) {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [inputValue, setInputValue] = useState('');
	const messageIdRef = useRef(0);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const [dataChannelReady, setDataChannelReady] = useState(false);

	const {
		state,
		remotePeerIds,
		connect,
		hangup,
		sendString,
	} = useWebRTCCall({
		roomId,
		signalUrl: '/api/webrtc/signal',
		media: false,
		dataChannels: [{ label: 'chat', ordered: true }],
		autoConnect: false,
		callbacks: {
			onDataChannelMessage: (remotePeerId, label, data) => {
				if (label !== 'chat') return;
				const text = typeof data === 'string' ? data : JSON.stringify(data);
				setMessages((prev) => {
					const next = [
						...prev,
						{
							id: messageIdRef.current++,
							type: 'received' as const,
							message: text,
							peerId: remotePeerId,
							timestamp: new Date().toISOString(),
						},
					];
					return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
				});
			},
			onDataChannelOpen: (_remotePeerId, label) => {
				if (label === 'chat') {
					setDataChannelReady(true);
					setMessages((prev) => {
						const next = [
							...prev,
							{
								id: messageIdRef.current++,
								type: 'system' as const,
								message: 'Data channel open. You can send messages now.',
								timestamp: new Date().toISOString(),
							},
						];
						return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
					});
				}
			},
			onDataChannelClose: (_remotePeerId, label) => {
				if (label === 'chat') {
					setDataChannelReady(false);
				}
			},
			onPeerJoined: (id) => {
				setMessages((prev) => {
					const next = [
						...prev,
						{
							id: messageIdRef.current++,
							type: 'system' as const,
							message: 'A peer joined the room',
							timestamp: new Date().toISOString(),
						},
					];
					return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
				});
			},
			onPeerLeft: (id) => {
				setMessages((prev) => {
					const next = [
						...prev,
						{
							id: messageIdRef.current++,
							type: 'system' as const,
							message: 'A peer left the room',
							timestamp: new Date().toISOString(),
						},
					];
					return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
				});
				setDataChannelReady(false);
			},
			onError: (err) => {
				setMessages((prev) => {
					const next = [
						...prev,
						{
							id: messageIdRef.current++,
							type: 'error' as const,
							message: err.message,
							timestamp: new Date().toISOString(),
						},
					];
					return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
				});
			},
		},
	});

	// Reset local state when room changes (hook creates a new manager)
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional reset on roomId change
	useEffect(() => {
		setMessages([]);
		setDataChannelReady(false);
	}, [roomId]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll when messages change
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
	}, [messages.length]);

	const sendMessage = useCallback(() => {
		if (!inputValue.trim()) return;
		const text = inputValue.trim();
		const success = sendString('chat', text);
		if (!success) {
			setMessages((prev) => {
				const next = [
					...prev,
					{
						id: messageIdRef.current++,
						type: 'error' as const,
						message: 'Failed to send message. Data channel may not be open.',
						timestamp: new Date().toISOString(),
					},
				];
				return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
			});
			return;
		}
		setMessages((prev) => {
			const next = [
				...prev,
				{
					id: messageIdRef.current++,
					type: 'sent' as const,
					message: text,
					timestamp: new Date().toISOString(),
				},
			];
			return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
		});
		setInputValue('');
	}, [inputValue, sendString]);

	const clearMessages = useCallback(() => {
		setMessages([]);
	}, []);

	const isConnected = state === 'connected';
	const isActive = state !== 'idle';

	return (
		<div className="mt-4 flex flex-col gap-4">
			{/* Connection controls */}
			<div className="flex items-center gap-4">
				<Button
					variant={isActive ? 'destructive' : 'outline'}
					size="sm"
					onClick={isActive ? hangup : connect}
					disabled={state === 'connecting' || state === 'negotiating'}
				>
					{state === 'connecting' || state === 'negotiating'
						? 'Connecting...'
						: isActive
							? 'Leave'
							: 'Join Room'}
				</Button>

				<div className="flex items-center gap-2">
					<div className={`w-2 h-2 rounded-full ${getStatusColor(state)}`} />
					<span className="text-sm text-zinc-400">{getStatusLabel(state)}</span>
				</div>

				{remotePeerIds.length > 0 && (
					<span className="text-xs text-zinc-600">
						{remotePeerIds.length} peer{remotePeerIds.length > 1 ? 's' : ''}
					</span>
				)}

				{messages.length > 0 && (
					<Button
						variant="ghost"
						size="xs"
						onClick={clearMessages}
						className="text-zinc-500 hover:text-zinc-300"
					>
						Clear
					</Button>
				)}
			</div>

			{isActive && !isConnected && remotePeerIds.length === 0 && (
				<div className="text-xs text-zinc-500 bg-zinc-900/50 border border-zinc-800 rounded px-3 py-2">
					Waiting for another peer to join this room. Open this page in a second tab or share the link.
				</div>
			)}

			{/* Messages */}
			<div className="bg-black border border-zinc-800 rounded-lg min-h-0 flex-1 overflow-y-auto p-3 space-y-2">
				{messages.length === 0 ? (
					<div className="text-zinc-600 text-sm text-center py-8">
						{isConnected
							? 'Waiting for data channel...'
							: 'Click Join Room to start'}
					</div>
				) : (
					messages.map((msg) => (
						<div
							key={msg.id}
							className={`border rounded px-3 py-2 ${getMessageStyle(msg.type)}`}
						>
							<div className="flex items-center justify-between mb-1">
								<span
									className={`text-xs font-medium ${
										msg.type === 'sent'
											? 'text-cyan-600 dark:text-cyan-400'
											: msg.type === 'error'
												? 'text-red-400'
												: 'text-zinc-400'
									}`}
								>
									{getMessageLabel(msg.type)}
								</span>
								<span className="text-xs text-zinc-600">
									{new Date(msg.timestamp).toLocaleTimeString()}
								</span>
							</div>
							<div className="text-white">{msg.message}</div>
						</div>
					))
				)}
				<div ref={messagesEndRef} />
			</div>

			{/* Message input */}
			<div className="flex items-center gap-2">
				<Input
					type="text"
					value={inputValue}
					onChange={(e) => setInputValue(e.target.value)}
					onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
					placeholder={
						dataChannelReady
							? 'Type a message...'
							: isConnected
								? 'Waiting for data channel...'
								: 'Join a room first...'
					}
					disabled={!dataChannelReady}
					className="flex-1"
				/>
				<Button
					variant="outline"
					size="default"
					onClick={sendMessage}
					disabled={!dataChannelReady || !inputValue.trim()}
				>
					Send
				</Button>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Video Call Tab
// ---------------------------------------------------------------------------

function RemoteVideo({ peerId, stream, videoOff }: { peerId: string; stream: MediaStream | undefined; videoOff?: boolean }) {
	const videoRef = useRef<HTMLVideoElement>(null);

	useEffect(() => {
		const video = videoRef.current;
		if (video && stream) {
			video.srcObject = stream;
		}
		return () => {
			if (video) {
				video.srcObject = null;
			}
		};
	}, [stream]);

	const hasVideo = stream ? stream.getVideoTracks().length > 0 : false;
	const showOverlay = videoOff || !hasVideo;

	return (
		<div className="relative">
			<video
				ref={videoRef}
				autoPlay
				playsInline
				className="w-full rounded-lg bg-zinc-900 border border-zinc-800"
			/>
			{showOverlay && (
				<div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900/90 rounded-lg">
					<div className="w-16 h-16 rounded-full bg-zinc-800/80 border-2 border-zinc-600/50 flex items-center justify-center mb-2">
						<span className="text-zinc-400 text-xl">R</span>
					</div>
					<span className="text-sm text-zinc-500">Camera off</span>
				</div>
			)}
			<span className="absolute bottom-2 left-2 text-xs bg-black/70 text-zinc-300 px-2 py-0.5 rounded">
				Remote
			</span>
		</div>
	);
}

function VideoCallTab({ roomId }: { roomId: string }) {
	const [mediaError, setMediaError] = useState<string | null>(null);
	const [localStream, setLocalStream] = useState<MediaStream | null>(null);
	const [remoteVideoOff, setRemoteVideoOff] = useState(false);

	const {
		localVideoRef,
		state,
		error,
		remotePeerIds,
		remoteStreams,
		isAudioMuted,
		isVideoMuted,
		isScreenSharing,
		connect,
		hangup,
		muteAudio,
		muteVideo,
		startScreenShare,
		stopScreenShare,
		sendString,
		getAllQualitySummaries,
	} = useWebRTCCall({
		roomId,
		signalUrl: '/api/webrtc/signal',
		autoConnect: false,
		dataChannels: [{ label: 'media-state', ordered: true }],
		callbacks: {
			onDataChannelMessage: (_remotePeerId, label, data) => {
				if (label === 'media-state') {
					try {
						const msg = JSON.parse(typeof data === 'string' ? data : '');
						if (msg.videoOff !== undefined) setRemoteVideoOff(msg.videoOff);
					} catch {}
				}
			},
			onPeerLeft: () => {
				setRemoteVideoOff(false);
			},
			onError: (err) => {
				if (err.name === 'NotAllowedError') {
					setMediaError(
						'Camera/microphone access was denied. Please allow access in your browser settings and try again.'
					);
				} else if (err.name === 'NotFoundError') {
					setMediaError(
						'No camera or microphone found. Connect a device and try again.'
					);
				} else if (err.name === 'NotReadableError' || err.name === 'AbortError') {
					setMediaError(
						'Camera or microphone is in use by another application. Close other apps using it and try again.'
					);
				}
			},
		},
	});

	// Reset error state when room changes
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional reset on roomId change
	useEffect(() => {
		setMediaError(null);
		setRemoteVideoOff(false);
	}, [roomId]);

	// Track local stream reactively (ref.srcObject is set by the hook's internal effect)
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-check when state changes
	useEffect(() => {
		const video = localVideoRef.current;
		if (video?.srcObject instanceof MediaStream) {
			setLocalStream(video.srcObject);
		} else {
			setLocalStream(null);
		}
	}, [state]);

	const handleConnect = useCallback(() => {
		setMediaError(null);
		connect();
	}, [connect]);

	const isConnected = state === 'connected';
	const isActive = state !== 'idle';

	return (
		<div className="mt-4 space-y-4">
			{/* Connection controls */}
			<div className="flex items-center gap-4 flex-wrap">
				<Button
					variant={isActive ? 'destructive' : 'outline'}
					size="sm"
					onClick={isActive ? hangup : handleConnect}
					disabled={state === 'connecting' || state === 'negotiating'}
				>
					{state === 'connecting' || state === 'negotiating'
						? 'Connecting...'
						: isActive
							? 'Leave'
							: 'Join Room'}
				</Button>

				<div className="flex items-center gap-2">
					<div className={`w-2 h-2 rounded-full ${getStatusColor(state)}`} />
					<span className="text-sm text-zinc-400">{getStatusLabel(state)}</span>
				</div>

				{/* Mute toggles */}
				{isActive && (
					<div className="flex items-center gap-2">
						<Button
							variant={isAudioMuted ? 'destructive' : 'outline'}
							size="xs"
							onClick={() => muteAudio(!isAudioMuted)}
						>
							{isAudioMuted ? 'Unmute Mic' : 'Mute Mic'}
						</Button>
						<Button
							variant={isVideoMuted ? 'destructive' : 'outline'}
							size="xs"
							onClick={() => {
								const newMuted = !isVideoMuted;
								muteVideo(newMuted);
								sendString('media-state', JSON.stringify({ videoOff: newMuted }));
							}}
						>
							{isVideoMuted ? 'Show Video' : 'Hide Video'}
						</Button>
						<Button
							variant={isScreenSharing ? 'destructive' : 'outline'}
							size="xs"
							onClick={isScreenSharing ? stopScreenShare : () => startScreenShare()}
						>
							{isScreenSharing ? 'Stop Sharing' : 'Share Screen'}
						</Button>
					</div>
				)}
			</div>

			{/* Errors */}
			{mediaError && (
				<div className="text-xs text-red-400 bg-red-900/20 border border-red-800/50 rounded px-3 py-2">
					{mediaError}
				</div>
			)}
			{error && !mediaError && (
				<div className="text-xs text-red-400 bg-red-900/20 border border-red-800/50 rounded px-3 py-2">
					{error.message}
				</div>
			)}

			{isActive && !isConnected && remotePeerIds.length === 0 && (
				<div className="text-xs text-zinc-500 bg-zinc-900/50 border border-zinc-800 rounded px-3 py-2">
					Waiting for another peer to join this room. Open this page in a second tab or share the link.
				</div>
			)}

			{/* Video grid */}
			<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
				{/* Local video */}
				<div className="relative">
					<video
						ref={localVideoRef}
						autoPlay
						muted
						playsInline
						className="w-full rounded-lg bg-zinc-900 border border-zinc-800"
					/>
					{isVideoMuted && (
						<div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900/90 rounded-lg">
							<div className="w-16 h-16 rounded-full bg-cyan-900/50 border-2 border-cyan-500/50 flex items-center justify-center mb-2">
								<span className="text-cyan-400 text-xl">Y</span>
							</div>
							<span className="text-sm text-zinc-400">Camera off</span>
						</div>
					)}
					<span className="absolute bottom-2 left-2 text-xs bg-black/70 text-zinc-300 px-2 py-0.5 rounded flex items-center gap-1.5">
						You
						{!isAudioMuted && (
							<AudioLevelIndicator stream={localStream} />
						)}
					</span>
				</div>

				{/* Remote videos */}
				{remotePeerIds.map((id) => (
					<RemoteVideo key={id} peerId={id} stream={remoteStreams.get(id)} videoOff={remoteVideoOff} />
				))}

				{/* Empty state for remote slot */}
				{isConnected && remotePeerIds.length === 0 && (
					<div className="flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 min-h-[180px]">
						<span className="text-zinc-600 text-sm">
							Waiting for a peer to join...
						</span>
					</div>
				)}
			</div>

			{/* Not connected placeholder */}
			{!isActive && (
				<div className="flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 min-h-[180px]">
					<span className="text-zinc-600 text-sm">
						Click Join Room to start a video call
					</span>
				</div>
			)}

			{/* Connection stats */}
			<ConnectionStats
				getAllQualitySummaries={getAllQualitySummaries}
				isConnected={isConnected}
				remotePeerIds={remotePeerIds}
			/>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Connection Stats
// ---------------------------------------------------------------------------

function getQualityColor(rtt?: number, loss?: number): string {
	if (rtt !== undefined && rtt >= 300) return 'text-red-400';
	if (loss !== undefined && loss >= 5) return 'text-red-400';
	if (rtt !== undefined && rtt >= 100) return 'text-yellow-400';
	if (loss !== undefined && loss >= 1) return 'text-yellow-400';
	return 'text-emerald-400';
}

function formatBitrate(bps?: number): string {
	if (bps === undefined) return '--';
	return `${(bps / 1000).toFixed(0)} kbps`;
}

function ConnectionStats({
	getAllQualitySummaries,
	isConnected,
	remotePeerIds,
}: {
	getAllQualitySummaries: () => Promise<Map<string, ConnectionQualitySummary>>;
	isConnected: boolean;
	remotePeerIds: string[];
}) {
	const [isExpanded, setIsExpanded] = useState(false);
	const [stats, setStats] = useState<Map<string, ConnectionQualitySummary>>(new Map());

	useEffect(() => {
		if (!isExpanded || !isConnected || remotePeerIds.length === 0) return;
		let active = true;
		const poll = async () => {
			const summaries = await getAllQualitySummaries();
			if (active) setStats(summaries);
		};
		poll();
		const interval = setInterval(poll, 2000);
		return () => {
			active = false;
			clearInterval(interval);
		};
	}, [isExpanded, isConnected, remotePeerIds.length, getAllQualitySummaries]);

	if (!isConnected || remotePeerIds.length === 0) return null;

	return (
		<div className="border border-zinc-800 rounded-lg overflow-hidden">
			<button
				type="button"
				onClick={() => setIsExpanded(!isExpanded)}
				className="w-full flex items-center justify-between px-3 py-2 bg-zinc-900/50 text-sm text-zinc-400 hover:text-zinc-300 transition-colors"
			>
				<span>Connection Stats</span>
				<span className="text-xs">{isExpanded ? 'Hide' : 'Show'}</span>
			</button>
			{isExpanded && (
				<div className="p-3 space-y-3">
					{remotePeerIds.map((peerId) => {
						const s = stats.get(peerId);
						if (!s) {
							return (
								<div key={peerId} className="text-xs text-zinc-600">
									Remote: gathering stats...
								</div>
							);
						}
						const qualityColor = getQualityColor(s.rtt, s.packetLossPercent);
						return (
							<div
								key={peerId}
								className="bg-zinc-900/50 border border-zinc-800 rounded p-2 space-y-1"
							>
								<div className="flex items-center justify-between">
									<span className="text-xs font-medium text-zinc-300">
										Remote
									</span>
									<span className={`text-xs font-medium ${qualityColor}`}>
										{s.rtt !== undefined && s.rtt < 100
											? 'Good'
											: s.rtt !== undefined && s.rtt < 300
												? 'Fair'
												: s.rtt !== undefined
													? 'Poor'
													: '--'}
									</span>
								</div>
								<div className="grid grid-cols-3 gap-2 text-xs">
									<div>
										<span className="text-zinc-600">RTT</span>
										<span className={`block ${qualityColor}`}>
											{s.rtt !== undefined ? `${s.rtt.toFixed(0)} ms` : '--'}
										</span>
									</div>
									<div>
										<span className="text-zinc-600">Loss</span>
										<span className={`block ${qualityColor}`}>
											{s.packetLossPercent !== undefined
												? `${s.packetLossPercent.toFixed(1)}%`
												: '--'}
										</span>
									</div>
									<div>
										<span className="text-zinc-600">Jitter</span>
										<span className="block text-zinc-400">
											{s.jitter !== undefined
												? `${s.jitter.toFixed(1)} ms`
												: '--'}
										</span>
									</div>
								</div>
								{s.bitrate && (
									<div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-zinc-800">
										<div>
											<span className="text-zinc-600">Video In/Out</span>
											<span className="block text-zinc-400">
												{formatBitrate(s.bitrate.video?.inbound)} /{' '}
												{formatBitrate(s.bitrate.video?.outbound)}
											</span>
										</div>
										<div>
											<span className="text-zinc-600">Audio In/Out</span>
											<span className="block text-zinc-400">
												{formatBitrate(s.bitrate.audio?.inbound)} /{' '}
												{formatBitrate(s.bitrate.audio?.outbound)}
											</span>
										</div>
									</div>
								)}
								{s.video && (
									<div className="grid grid-cols-3 gap-2 text-xs pt-1 border-t border-zinc-800">
										<div>
											<span className="text-zinc-600">FPS</span>
											<span className="block text-zinc-400">
												{s.video.framesPerSecond ?? '--'}
											</span>
										</div>
										<div>
											<span className="text-zinc-600">Resolution</span>
											<span className="block text-zinc-400">
												{s.video.frameWidth && s.video.frameHeight
													? `${s.video.frameWidth}x${s.video.frameHeight}`
													: '--'}
											</span>
										</div>
										<div>
											<span className="text-zinc-600">Dropped</span>
											<span className="block text-zinc-400">
												{s.video.framesDropped ?? '--'}
											</span>
										</div>
									</div>
								)}
								{s.candidatePair && (
									<div className="text-xs pt-1 border-t border-zinc-800 text-zinc-600">
										{s.candidatePair.protocol?.toUpperCase() ?? ''}{' '}
										{s.candidatePair.localType} &rarr;{' '}
										{s.candidatePair.remoteType}
										{s.candidatePair.usingRelay && (
											<span className="text-yellow-500 ml-1">(relay)</span>
										)}
									</div>
								)}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function WebRTCDemo() {
	const [roomId, setRoomId] = useState(() => {
		if (typeof window === 'undefined') return crypto.randomUUID().slice(0, 8);
		const params = new URLSearchParams(window.location.search);
		return params.get('room') || crypto.randomUUID().slice(0, 8);
	});
	const [activeTab, setActiveTab] = useState<'data' | 'video'>('data');

	return (
		<div className="space-y-4">
			<div className="bg-black border border-zinc-900 rounded-lg p-4">
				<p className="text-zinc-600 text-xs m-0 mb-4">
					Open this page in two browser tabs with the same Room ID to test peer-to-peer communication.
				</p>

				{/* Room controls */}
				<div className="flex items-center gap-2 mb-4">
					<label className="text-sm text-zinc-400 whitespace-nowrap">Room ID</label>
					<Input
						type="text"
						value={roomId}
						onChange={(e) => setRoomId(e.target.value)}
						placeholder="Enter room ID"
						className="flex-1 max-w-[200px]"
					/>
					<CopyLinkButton roomId={roomId} />
					<OpenInNewTabButton roomId={roomId} />
					<QRCodeDisplay roomId={roomId} />
				</div>

				{/* Tabs - conditional rendering unmounts inactive tabs to avoid competing
				    WebSocket signaling connections from two useWebRTCCall instances */}
				<Tabs
					value={activeTab}
					onValueChange={(v) => setActiveTab(v as 'data' | 'video')}
				>
					<TabsList>
						<TabsTrigger value="data">Data Channel</TabsTrigger>
						<TabsTrigger value="video">Video Call</TabsTrigger>
					</TabsList>
					<TabsContent value="data">
						{activeTab === 'data' && <DataChannelTab roomId={roomId} />}
					</TabsContent>
					<TabsContent value="video">
						{activeTab === 'video' && <VideoCallTab roomId={roomId} />}
					</TabsContent>
				</Tabs>
			</div>

		</div>
	);
}
