import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ConnectionQualitySummary } from '@agentuity/core';
import { useWebRTCCall, type WebRTCConnectionState } from '@agentuity/react';
import { MicOff, Volume2 } from 'lucide-react';
import { Button, Input, Tabs, TabsContent, TabsList, TabsTrigger } from './ui';

const ROOM_STORAGE_KEY = 'sdk-explorer-webrtc-room';
const TAB_STORAGE_KEY = 'sdk-explorer-webrtc-tab';

interface ChatMessage {
	readonly id: number;
	readonly type: 'sent' | 'received' | 'system' | 'error';
	readonly message: string;
	readonly peerId: string | undefined;
}

interface MediaStateMessage {
	readonly audioMuted: boolean;
	readonly videoOff: boolean;
}

interface ParticipantTileProps {
	readonly audioMuted: boolean;
	readonly connectionState: WebRTCConnectionState;
	readonly id: string;
	readonly isLocal: boolean;
	readonly localVideoRef: React.RefObject<HTMLVideoElement | null> | undefined;
	readonly screenSharing: boolean;
	readonly stream: MediaStream | undefined;
	readonly videoOff: boolean;
}

function createRoomId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID().slice(0, 8);
	}
	return Math.random().toString(36).slice(2, 10);
}

function shortPeerId(peerId: string): string {
	return peerId.slice(0, 8);
}

function statusLabel(state: WebRTCConnectionState): string {
	switch (state) {
		case 'connecting':
			return 'Connecting';
		case 'signaling':
			return 'Signaling';
		case 'negotiating':
			return 'Negotiating';
		case 'connected':
			return 'Connected';
		case 'idle':
		default:
			return 'Idle';
	}
}

function statusDotClass(state: WebRTCConnectionState): string {
	switch (state) {
		case 'connected':
			return 'bg-emerald-500';
		case 'connecting':
		case 'signaling':
		case 'negotiating':
			return 'bg-yellow-500 animate-pulse';
		case 'idle':
		default:
			return 'bg-zinc-500';
	}
}

function parseMediaStateMessage(data: unknown): MediaStateMessage | null {
	try {
		const parsed = typeof data === 'string' ? (JSON.parse(data) as unknown) : data;

		if (!parsed || typeof parsed !== 'object') {
			return null;
		}

		const audioMuted = Reflect.get(parsed, 'audioMuted');
		const videoOff = Reflect.get(parsed, 'videoOff');
		if (typeof audioMuted !== 'boolean' || typeof videoOff !== 'boolean') {
			return null;
		}

		return { audioMuted, videoOff };
	} catch {
		return null;
	}
}

function formatBitrate(value: number | undefined): string {
	if (value === undefined || Number.isNaN(value)) {
		return 'Collecting';
	}
	return `${(value / 1000).toFixed(0)} kbps`;
}

function formatLatency(value: number | undefined): string {
	if (value === undefined || Number.isNaN(value)) {
		return 'Collecting';
	}
	return `${value.toFixed(0)} ms`;
}

function formatLoss(value: number | undefined): string {
	if (value === undefined || Number.isNaN(value)) {
		return 'Pending';
	}
	return `${value.toFixed(1)}%`;
}

function hasQualityValue(value: number | undefined): boolean {
	return value !== undefined && !Number.isNaN(value);
}

function getVideoStatusCopy({
	connectionState,
	hasVideoTrack,
	isLocal,
	screenSharing,
	videoOff,
}: {
	readonly connectionState: WebRTCConnectionState;
	readonly hasVideoTrack: boolean;
	readonly isLocal: boolean;
	readonly screenSharing: boolean;
	readonly videoOff: boolean;
}): {
	readonly body: string;
	readonly footer: string;
	readonly title: string;
} | null {
	if (screenSharing) {
		return null;
	}

	if (videoOff) {
		return {
			title: 'Camera off',
			body: isLocal
				? 'Turn video back on to resume your camera feed.'
				: 'This participant is not sending video right now.',
			footer: 'Video hidden',
		};
	}

	if (hasVideoTrack) {
		return null;
	}

	if (isLocal && connectionState !== 'idle') {
		return {
			title: 'Starting camera',
			body: 'Your preview will appear here as soon as the browser finishes camera setup.',
			footer: 'Preview starting',
		};
	}

	return {
		title: 'Waiting for video',
		body: isLocal
			? 'Connect to start your camera and microphone preview.'
			: 'This participant has joined, but their video feed is not live yet.',
		footer: 'Video pending',
	};
}

function getMediaSupportError(): string | null {
	if (typeof window === 'undefined') {
		return null;
	}
	if (!window.isSecureContext) {
		return 'Video calls need a secure browser context such as localhost or HTTPS.';
	}
	if (!navigator.mediaDevices?.getUserMedia) {
		return 'This browser session does not support camera and microphone capture.';
	}
	return null;
}

function getQualityToneClass(summary: ConnectionQualitySummary | null): string {
	const rtt = summary?.rtt;
	const loss = summary?.packetLossPercent;

	if ((rtt !== undefined && rtt >= 300) || (loss !== undefined && loss >= 5)) {
		return 'text-red-500 dark:text-red-400';
	}
	if ((rtt !== undefined && rtt >= 100) || (loss !== undefined && loss >= 1)) {
		return 'text-yellow-600 dark:text-yellow-400';
	}
	if (rtt === undefined && loss === undefined) {
		return 'text-zinc-500';
	}
	return 'text-emerald-600 dark:text-emerald-400';
}

function getQualityLabel(summary: ConnectionQualitySummary | null): string {
	const rtt = summary?.rtt;
	const loss = summary?.packetLossPercent;

	if (rtt === undefined && loss === undefined) {
		return 'Gathering';
	}
	if ((rtt !== undefined && rtt >= 300) || (loss !== undefined && loss >= 5)) {
		return 'Poor';
	}
	if ((rtt !== undefined && rtt >= 100) || (loss !== undefined && loss >= 1)) {
		return 'Fair';
	}
	return 'Good';
}

function StableButtonLabel({
	current,
	reserve,
}: {
	readonly current: string;
	readonly reserve: ReadonlyArray<string> | string;
}): React.JSX.Element {
	const longest = useMemo(() => {
		const labels = Array.isArray(reserve) ? reserve : [reserve];
		return labels.reduce((widest, label) => (label.length > widest.length ? label : widest));
	}, [reserve]);

	return (
		<span className="grid place-items-center">
			<span className="col-start-1 row-start-1 invisible">{longest}</span>
			<span className="col-start-1 row-start-1">{current}</span>
		</span>
	);
}

function AudioLevelIndicator({
	audioMuted,
	stream,
}: {
	readonly audioMuted: boolean;
	readonly stream: MediaStream | undefined;
}): React.JSX.Element {
	const [level, setLevel] = useState(0);

	useEffect(() => {
		const audioTrack = stream?.getAudioTracks()[0];
		if (!stream || !audioTrack) {
			setLevel(0);
			return;
		}

		let active = true;
		let audioContext: AudioContext | undefined;
		let source: MediaStreamAudioSourceNode | undefined;
		let animationFrame = 0;

		try {
			audioContext = new AudioContext();
			const analyser = audioContext.createAnalyser();
			analyser.fftSize = 256;
			analyser.smoothingTimeConstant = 0.3;

			source = audioContext.createMediaStreamSource(stream);
			source.connect(analyser);

			const data = new Uint8Array(analyser.fftSize);

			const tick = (): void => {
				if (!active) {
					return;
				}

				analyser.getByteTimeDomainData(data);
				let peak = 0;
				for (const value of data) {
					const amplitude = Math.abs(value - 128) / 128;
					if (amplitude > peak) {
						peak = amplitude;
					}
				}

				setLevel((previousLevel) => {
					const boostedPeak = Math.min(1, peak * 1.15);
					return Math.max(boostedPeak, previousLevel * 0.6);
				});
				animationFrame = window.requestAnimationFrame(tick);
			};

			animationFrame = window.requestAnimationFrame(tick);
		} catch {
			setLevel(0);
			void audioContext?.close().catch(() => {});
			return;
		}

		return () => {
			active = false;
			window.cancelAnimationFrame(animationFrame);
			try {
				source?.disconnect();
			} catch {}
			void audioContext?.close().catch(() => {});
		};
	}, [stream]);

	const thresholds = [0.05, 0.1, 0.18, 0.32];

	return (
		<div
			className="flex h-3 items-end gap-[2px]"
			aria-hidden="true"
			title={
				audioMuted
					? 'Microphone muted'
					: level > 0.05
						? 'Audio activity detected'
						: 'No audio activity'
			}
		>
			{thresholds.map((threshold, index) => (
				<div
					key={threshold}
					className="w-[3px] rounded-sm transition-colors duration-100"
					style={{
						height: `${40 + index * 18}%`,
						backgroundColor: audioMuted
							? 'rgb(244 63 94 / 0.9)'
							: level >= threshold
								? 'rgb(34 197 94)'
								: 'rgb(113 113 122 / 0.45)',
					}}
				/>
			))}
		</div>
	);
}

function RemoteVideo({
	stream,
	className,
}: {
	readonly className?: string;
	readonly stream: MediaStream | undefined;
}): React.JSX.Element {
	const ref = useRef<HTMLVideoElement | null>(null);

	useEffect(() => {
		if (ref.current) {
			ref.current.srcObject = stream ?? null;
		}

		return () => {
			if (ref.current) {
				ref.current.srcObject = null;
			}
		};
	}, [stream]);

	// biome-ignore lint/a11y/useMediaCaption: Live WebRTC streams in this demo do not provide caption tracks.
	return <video ref={ref} autoPlay playsInline className={className} />;
}

function ParticipantTile({
	audioMuted,
	connectionState,
	id,
	isLocal,
	localVideoRef,
	screenSharing,
	stream,
	videoOff,
}: ParticipantTileProps): React.JSX.Element {
	const hasVideoTrack = (stream?.getVideoTracks().length ?? 0) > 0;
	const videoStatusCopy = getVideoStatusCopy({
		connectionState,
		hasVideoTrack,
		isLocal,
		screenSharing,
		videoOff,
	});
	const showVideoStatus = videoStatusCopy !== null;
	const participantLabel = isLocal ? 'You' : `Peer ${shortPeerId(id)}`;
	const secondaryLabel = isLocal
		? id === 'local-preview'
			? 'Joining room'
			: `Peer ${shortPeerId(id)}`
		: 'Remote participant';

	return (
		<div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950/60">
			<div className="relative aspect-video bg-zinc-950">
				{isLocal ? (
					<video
						ref={localVideoRef}
						autoPlay
						muted
						playsInline
						className="absolute inset-0 size-full object-cover"
					/>
				) : (
					<RemoteVideo
						stream={stream}
						className="absolute inset-0 size-full bg-zinc-950 object-cover"
					/>
				)}

				{showVideoStatus ? (
					<div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950/92 text-center">
						<div className="mb-3 flex size-14 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-zinc-400">
							<span className="text-lg">{isLocal ? 'Y' : 'R'}</span>
						</div>
						<p className="text-sm font-medium text-zinc-100">{videoStatusCopy.title}</p>
						<p className="mt-1 max-w-[18rem] text-xs text-zinc-400">{videoStatusCopy.body}</p>
					</div>
				) : null}

				<div className="absolute right-3 top-3 flex flex-wrap items-center justify-end gap-2">
					{screenSharing ? (
						<div className="inline-flex items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-500/18 px-2 py-1 text-[11px] font-medium text-cyan-100 shadow-sm backdrop-blur-sm">
							<span>Sharing screen</span>
						</div>
					) : null}
					{audioMuted ? (
						<div className="inline-flex items-center gap-1 rounded-full border border-red-400/30 bg-red-500/18 px-2 py-1 text-[11px] font-medium text-red-100 shadow-sm backdrop-blur-sm">
							<MicOff className="size-3.5" />
							<span>Muted</span>
						</div>
					) : null}
				</div>

				<div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/80 via-black/35 to-transparent px-3 py-3 text-white">
					<div className="min-w-0">
						<div className="flex items-center gap-2">
							<span className="rounded-full bg-white/14 px-2 py-0.5 text-[11px] font-medium tracking-wide">
								{participantLabel}
							</span>
						</div>
						<p className="mt-1 truncate text-xs text-zinc-200/90">{secondaryLabel}</p>
					</div>

					<div className="inline-flex items-center gap-2 rounded-full bg-black/45 px-2 py-1">
						{audioMuted ? (
							<MicOff className="size-3.5 text-red-200" />
						) : (
							<Volume2 className="size-3.5 text-zinc-100" />
						)}
						<AudioLevelIndicator stream={stream} audioMuted={audioMuted} />
					</div>
				</div>
			</div>
		</div>
	);
}

function EmptyParticipantTile({
	description,
	title,
}: {
	readonly description: string;
	readonly title: string;
}): React.JSX.Element {
	return (
		<div className="flex aspect-video flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-5 text-center dark:border-zinc-700 dark:bg-zinc-950/30">
			<p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{title}</p>
			<p className="mt-2 max-w-xs text-sm text-zinc-500">{description}</p>
		</div>
	);
}

function ShareControls({ roomId }: { readonly roomId: string }): React.JSX.Element {
	const [copied, setCopied] = useState(false);
	const copyTimeoutRef = useRef<number | null>(null);

	const shareUrl = useMemo(() => {
		if (typeof window === 'undefined' || !roomId.trim()) {
			return '';
		}
		const url = new URL(window.location.href);
		url.searchParams.set('room', roomId);
		return url.toString();
	}, [roomId]);

	const copyLink = useCallback(async (): Promise<void> => {
		if (!shareUrl) {
			return;
		}
		try {
			await navigator.clipboard.writeText(shareUrl);
			setCopied(true);
			if (copyTimeoutRef.current !== null) {
				window.clearTimeout(copyTimeoutRef.current);
			}
			copyTimeoutRef.current = window.setTimeout(() => {
				setCopied(false);
				copyTimeoutRef.current = null;
			}, 1500);
		} catch {
			setCopied(false);
		}
	}, [shareUrl]);

	useEffect(() => {
		return () => {
			if (copyTimeoutRef.current !== null) {
				window.clearTimeout(copyTimeoutRef.current);
			}
		};
	}, []);

	const openTab = useCallback((): void => {
		if (!shareUrl) {
			return;
		}
		window.open(shareUrl, '_blank', 'noopener,noreferrer');
	}, [shareUrl]);

	return (
		<div className="flex flex-wrap items-center gap-2">
			<Button
				variant="outline"
				size="sm"
				onClick={() => void copyLink()}
				disabled={!shareUrl}
				className="min-w-[7.5rem]"
			>
				<StableButtonLabel
					current={copied ? 'Copied!' : 'Copy Link'}
					reserve={['Copy Link', 'Copied!']}
				/>
			</Button>
			<Button variant="outline" size="sm" onClick={openTab} disabled={!shareUrl}>
				Open in New Tab
			</Button>
		</div>
	);
}

function DataChannelTab({ roomId }: { readonly roomId: string }): React.JSX.Element {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [input, setInput] = useState('');
	const [dataChannelReady, setDataChannelReady] = useState(false);
	const nextMessageId = useRef(0);
	const dataChannels = useMemo(() => [{ label: 'chat', ordered: true }], []);

	const appendMessage = useCallback(
		(type: ChatMessage['type'], message: string, peerId?: string): void => {
			setMessages((prev) =>
				[
					...prev,
					{
						id: nextMessageId.current++,
						type,
						message,
						peerId,
					},
				].slice(-100)
			);
		},
		[]
	);

	const { state, error, peerId, remotePeerIds, connect, hangup, sendString } = useWebRTCCall({
		roomId,
		signalUrl: '/api/webrtc/signal',
		media: false,
		dataChannels,
		autoConnect: false,
		callbacks: {
			onPeerJoined: (id) =>
				appendMessage('system', `Peer ${id.slice(0, 6)} joined the room`, id),
			onPeerLeft: (id) => {
				setDataChannelReady(false);
				appendMessage('system', `Peer ${id.slice(0, 6)} left the room`, id);
			},
			onDataChannelOpen: (_id, label) => {
				if (label === 'chat') {
					setDataChannelReady(true);
					appendMessage('system', 'Data channel open. You can send messages now.');
				}
			},
			onDataChannelClose: (_id, label) => {
				if (label === 'chat') {
					setDataChannelReady(false);
				}
			},
			onDataChannelMessage: (fromPeerId, label, data) => {
				if (label === 'chat') {
					let message: string;
					if (typeof data === 'string') {
						message = data;
					} else if (data instanceof ArrayBuffer) {
						message = `Binary payload (${data.byteLength} bytes)`;
					} else if (data instanceof Blob) {
						message = `Binary payload (${data.size} bytes)`;
					} else {
						message = JSON.stringify(data) ?? String(data);
					}
					appendMessage('received', message, fromPeerId);
				}
			},
			onError: (err) => appendMessage('error', err.message),
		},
	});

	const sendMessage = useCallback((): void => {
		const value = input.trim();
		if (!value) {
			return;
		}

		const sent = sendString('chat', value);
		if (sent) {
			appendMessage('sent', value, peerId ?? undefined);
			setInput('');
			return;
		}

		appendMessage('error', 'Message could not be sent. Connect first.');
	}, [appendMessage, input, peerId, sendString]);

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center gap-3 text-sm text-zinc-500">
				<div className="flex items-center gap-2">
					<div className={`h-2.5 w-2.5 rounded-full ${statusDotClass(state)}`} aria-hidden />
					<span>{statusLabel(state)}</span>
				</div>
				{peerId ? <span>Peer ID: {shortPeerId(peerId)}</span> : null}
				{remotePeerIds.length > 0 ? <span>Peers: {remotePeerIds.length}</span> : null}
			</div>

			<div className="flex flex-wrap gap-2">
				<Button
					variant="outline"
					size="sm"
					onClick={connect}
					disabled={state !== 'idle' || !roomId.trim()}
				>
					Connect
				</Button>
				<Button variant="outline" size="sm" onClick={hangup} disabled={state === 'idle'}>
					Hang Up
				</Button>
			</div>

			<div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50/50 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
				<div
					className="max-h-64 space-y-2 overflow-auto"
					role="log"
					aria-label="WebRTC chat messages"
					aria-live="polite"
				>
					{messages.length === 0 ? (
						<p className="text-sm text-zinc-500">
							Join the room in two tabs, then use the chat data channel to send messages
							directly between browsers.
						</p>
					) : (
						messages.map((message) => (
							<div
								key={message.id}
								className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900"
							>
								<div className="mb-1 text-xs uppercase tracking-wide text-zinc-500">
									{message.type}
									{message.peerId ? ` • ${message.peerId.slice(0, 6)}` : ''}
								</div>
								<div className="break-words text-zinc-700 dark:text-zinc-200">
									{message.message}
								</div>
							</div>
						))
					)}
				</div>

				<div className="flex flex-col gap-2 sm:flex-row">
					<Input
						value={input}
						onChange={(event) => setInput(event.target.value)}
						aria-label="Chat data channel message"
						onKeyDown={(event) => {
							if (event.key === 'Enter') {
								sendMessage();
							}
						}}
						placeholder={
							dataChannelReady
								? 'Send a message over the chat data channel'
								: state === 'connected'
									? 'Waiting for the chat data channel to open'
									: 'Connect from two tabs with the same room ID'
						}
						disabled={!dataChannelReady}
					/>
					<Button
						variant="outline"
						onClick={sendMessage}
						disabled={!dataChannelReady}
						className="sm:self-start"
					>
						Send
					</Button>
				</div>
				{error ? (
					<p className="text-sm text-red-500" role="alert">
						{error.message}
					</p>
				) : null}
			</div>
		</div>
	);
}

function ConnectionStatsPanel({
	quality,
	remotePeerIds,
}: {
	readonly quality: ReadonlyMap<string, ConnectionQualitySummary | null>;
	readonly remotePeerIds: ReadonlyArray<string>;
}): React.JSX.Element | null {
	if (remotePeerIds.length === 0) {
		return null;
	}

	return (
		<div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-950/40">
			<div className="mb-3 flex items-center justify-between gap-3">
				<div>
					<p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
						Connection Quality
					</p>
					<p className="text-xs text-zinc-500">
						Live network stats update while the call is active.
					</p>
				</div>
			</div>

			<div
				className={
					remotePeerIds.length > 1 ? 'grid gap-3 xl:grid-cols-2' : 'grid max-w-sm gap-3'
				}
			>
				{remotePeerIds.map((remotePeerId) => {
					const summary = quality.get(remotePeerId) ?? null;
					const toneClass = getQualityToneClass(summary);
					const qualityLabel = getQualityLabel(summary);
					const metrics = [
						hasQualityValue(summary?.rtt)
							? {
									label: 'Latency',
									value: formatLatency(summary?.rtt),
									valueClassName: toneClass,
								}
							: null,
						hasQualityValue(summary?.packetLossPercent)
							? {
									label: 'Packet loss',
									value: formatLoss(summary?.packetLossPercent),
									valueClassName: toneClass,
								}
							: null,
						hasQualityValue(summary?.bitrate?.video?.inbound)
							? {
									label: 'Video',
									value: formatBitrate(summary?.bitrate?.video?.inbound),
									valueClassName: 'text-zinc-700 dark:text-zinc-300',
								}
							: null,
						hasQualityValue(summary?.bitrate?.audio?.inbound)
							? {
									label: 'Audio',
									value: formatBitrate(summary?.bitrate?.audio?.inbound),
									valueClassName: 'text-zinc-700 dark:text-zinc-300',
								}
							: null,
					].filter(
						(
							value
						): value is {
							readonly label: string;
							readonly value: string;
							readonly valueClassName: string;
						} => value !== null
					);
					const detailBits = [
						summary?.jitter !== undefined ? `Jitter ${summary.jitter.toFixed(1)} ms` : null,
						summary?.video?.framesPerSecond !== undefined
							? `${summary.video.framesPerSecond} fps`
							: null,
						summary?.video?.frameWidth && summary.video.frameHeight
							? `${summary.video.frameWidth}x${summary.video.frameHeight}`
							: null,
					].filter((value): value is string => value !== null);

					return (
						<div
							key={remotePeerId}
							className="rounded-lg border border-zinc-200 bg-white px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900/80"
						>
							<div className="mb-3 flex items-center justify-between gap-3">
								<div>
									<p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
										Peer {shortPeerId(remotePeerId)}
									</p>
									<p className="text-xs text-zinc-500">Remote transport summary</p>
								</div>
								<span className={`text-xs font-medium ${toneClass}`}>{qualityLabel}</span>
							</div>

							{metrics.length > 0 ? (
								<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
									{metrics.map((metric) => (
										<div key={metric.label}>
											<p className="text-[11px] uppercase tracking-wide text-zinc-500">
												{metric.label}
											</p>
											<p className={`mt-1 text-sm ${metric.valueClassName}`}>
												{metric.value}
											</p>
										</div>
									))}
								</div>
							) : (
								<div className="rounded-md border border-dashed border-zinc-200 px-3 py-2 text-sm text-zinc-500 dark:border-zinc-800">
									Transport stats are still warming up for this peer.
								</div>
							)}

							{detailBits.length > 0 ? (
								<div className="mt-3 border-t border-zinc-200 pt-3 text-xs text-zinc-500 dark:border-zinc-800">
									{detailBits.join(' • ')}
								</div>
							) : null}
						</div>
					);
				})}
			</div>
		</div>
	);
}

function VideoCallTab({ roomId }: { readonly roomId: string }): React.JSX.Element {
	const [quality, setQuality] = useState<ReadonlyMap<string, ConnectionQualitySummary | null>>(
		new Map()
	);
	const [mediaError, setMediaError] = useState<string | null>(null);
	const [localStream, setLocalStream] = useState<MediaStream | undefined>(undefined);
	const [sawPeerJoinEvent, setSawPeerJoinEvent] = useState(false);
	const [remoteMediaStateByPeer, setRemoteMediaStateByPeer] = useState<
		Record<string, MediaStateMessage>
	>({});
	const mediaStateChannels = useMemo(() => [{ label: 'media-state', ordered: true }], []);
	const sendStringRef = useRef<((label: string, data: string) => boolean) | null>(null);
	const isAudioMutedRef = useRef(false);
	const isVideoMutedRef = useRef(false);
	const stateRef = useRef<WebRTCConnectionState>('idle');

	const {
		localVideoRef,
		state,
		error,
		peerId,
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
		dataChannels: mediaStateChannels,
		callbacks: {
			onLocalStream: (stream) => {
				setLocalStream(stream);
				setMediaError(null);
			},
			onDataChannelMessage: (fromPeerId, label, data) => {
				if (label !== 'media-state') {
					return;
				}

				const next = parseMediaStateMessage(data);
				if (!next) {
					return;
				}

				setRemoteMediaStateByPeer((prev) => ({
					...prev,
					[fromPeerId]: next,
				}));
			},
			onDataChannelOpen: (_peerId, label) => {
				if (label !== 'media-state') {
					return;
				}

				sendStringRef.current?.(
					'media-state',
					JSON.stringify({
						audioMuted: isAudioMutedRef.current,
						videoOff: isVideoMutedRef.current,
					})
				);
			},
			onPeerJoined: () => {
				if (stateRef.current !== 'idle') {
					setSawPeerJoinEvent(true);
				}
			},
			onPeerLeft: (leftPeerId) => {
				setRemoteMediaStateByPeer((prev) => {
					const next = { ...prev };
					delete next[leftPeerId];
					return next;
				});
			},
			onError: (err) => {
				if (err.name === 'NotAllowedError') {
					setMediaError(
						'Camera or microphone access was denied. Allow access in your browser, then reconnect.'
					);
					return;
				}
				if (err.name === 'NotSupportedError' || err.name === 'SecurityError') {
					setMediaError(
						'This browser session cannot start camera or microphone capture for WebRTC video calls.'
					);
					return;
				}
				if (err.name === 'NotFoundError') {
					setMediaError('No camera or microphone was found for this browser session.');
					return;
				}
				if (err.name === 'NotReadableError' || err.name === 'AbortError') {
					setMediaError(
						'Camera or microphone is busy in another app. Close the other app and try again.'
					);
				}
			},
		},
	});

	const callReady = state !== 'idle';
	const audioButtonLabel = callReady && isAudioMuted ? 'Unmute Audio' : 'Mute Audio';
	const videoButtonLabel = callReady && isVideoMuted ? 'Show Video' : 'Hide Video';
	const screenShareButtonLabel = callReady && isScreenSharing ? 'Stop Share' : 'Share Screen';

	useEffect(() => {
		sendStringRef.current = sendString;
	}, [sendString]);

	useEffect(() => {
		stateRef.current = state;
	}, [state]);

	useEffect(() => {
		isAudioMutedRef.current = isAudioMuted;
	}, [isAudioMuted]);

	useEffect(() => {
		isVideoMutedRef.current = isVideoMuted;
	}, [isVideoMuted]);

	useEffect(() => {
		if (state !== 'connected') {
			setQuality(new Map());
			return;
		}

		let active = true;

		const updateQuality = async (): Promise<void> => {
			const summaries = await getAllQualitySummaries();
			if (!active) {
				return;
			}
			setQuality(summaries);
		};

		void updateQuality();
		const interval = window.setInterval(() => {
			void updateQuality();
		}, 2000);

		return () => {
			active = false;
			window.clearInterval(interval);
		};
	}, [getAllQualitySummaries, state]);

	useEffect(() => {
		if (state === 'idle') {
			setSawPeerJoinEvent(false);
			setLocalStream(undefined);
			setRemoteMediaStateByPeer({});
		}
	}, [state]);

	const orderedRemotePeerIds = useMemo(() => {
		return remotePeerIds.slice().sort((left, right) => left.localeCompare(right));
	}, [remotePeerIds]);

	const joinedExistingCall = remotePeerIds.length > 0 && !sawPeerJoinEvent;

	const handleConnect = useCallback((): void => {
		const supportError = getMediaSupportError();
		setMediaError(supportError);
		if (supportError) {
			return;
		}
		connect();
	}, [connect]);

	const handleToggleVideo = useCallback((): void => {
		const nextMuted = !isVideoMuted;
		muteVideo(nextMuted);
	}, [isVideoMuted, muteVideo]);

	useEffect(() => {
		if (state !== 'connected' || remotePeerIds.length === 0) {
			return;
		}

		let cancelled = false;
		let timer: number | undefined;
		const payload = JSON.stringify({
			audioMuted: isAudioMuted,
			videoOff: isVideoMuted,
		});

		const publishMediaState = (): void => {
			if (cancelled) {
				return;
			}

			const sent = sendStringRef.current?.('media-state', payload) ?? false;
			if (!sent) {
				timer = window.setTimeout(publishMediaState, 300);
			}
		};

		publishMediaState();

		return () => {
			cancelled = true;
			if (timer !== undefined) {
				window.clearTimeout(timer);
			}
		};
	}, [isAudioMuted, isVideoMuted, remotePeerIds.length, state]);

	const handleToggleScreenShare = useCallback((): void => {
		void (isScreenSharing ? stopScreenShare() : startScreenShare());
	}, [isScreenSharing, startScreenShare, stopScreenShare]);

	const participantTiles = useMemo(() => {
		const hasLocalParticipant = state !== 'idle' || localStream !== undefined || isScreenSharing;

		if (!hasLocalParticipant && orderedRemotePeerIds.length === 0) {
			return (
				<>
					<EmptyParticipantTile
						title="Your preview appears here"
						description="Connect to start camera and microphone capture for this room."
					/>
					<EmptyParticipantTile
						title="Remote participant"
						description="Open the same room in another tab or browser to start the call."
					/>
				</>
			);
		}

		const remoteTiles = orderedRemotePeerIds.map((participantId) => {
			return (
				<ParticipantTile
					key={participantId}
					id={participantId}
					isLocal={false}
					connectionState="connected"
					stream={remoteStreams.get(participantId)}
					localVideoRef={undefined}
					videoOff={remoteMediaStateByPeer[participantId]?.videoOff ?? false}
					audioMuted={remoteMediaStateByPeer[participantId]?.audioMuted ?? false}
					screenSharing={false}
				/>
			);
		});

		const localTile = hasLocalParticipant ? (
			<ParticipantTile
				key="local-participant"
				id={peerId ?? 'local-preview'}
				isLocal={true}
				connectionState={state}
				stream={localStream}
				localVideoRef={localVideoRef}
				videoOff={isVideoMuted && !isScreenSharing}
				audioMuted={isAudioMuted}
				screenSharing={isScreenSharing}
			/>
		) : null;

		const waitingTile =
			remoteTiles.length === 0 ? (
				<EmptyParticipantTile
					key="waiting-for-peer"
					title={
						hasLocalParticipant ? 'Waiting for another participant' : 'Remote participant'
					}
					description={
						hasLocalParticipant
							? 'Share the link or open the same room in another browser to complete the call.'
							: 'Open the same room in another tab or browser to start the call.'
					}
				/>
			) : null;

		if (joinedExistingCall) {
			return (
				<>
					{remoteTiles}
					{localTile}
					{waitingTile}
				</>
			);
		}

		return (
			<>
				{localTile}
				{remoteTiles}
				{waitingTile}
			</>
		);
	}, [
		isAudioMuted,
		isScreenSharing,
		isVideoMuted,
		localStream,
		localVideoRef,
		joinedExistingCall,
		orderedRemotePeerIds,
		peerId,
		remoteStreams,
		remoteMediaStateByPeer,
		state,
	]);

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center gap-3 text-sm text-zinc-500">
				<div className="flex items-center gap-2">
					<div className={`h-2.5 w-2.5 rounded-full ${statusDotClass(state)}`} />
					<span>{statusLabel(state)}</span>
				</div>
				{peerId ? <span>Peer ID: {shortPeerId(peerId)}</span> : null}
				{remotePeerIds.length > 0 ? <span>Peers: {remotePeerIds.length}</span> : null}
			</div>

			<div className="flex flex-wrap gap-2">
				<Button
					variant="outline"
					size="sm"
					onClick={handleConnect}
					disabled={state !== 'idle' || !roomId.trim()}
				>
					Connect
				</Button>
				<Button variant="outline" size="sm" onClick={hangup} disabled={state === 'idle'}>
					Hang Up
				</Button>
				<Button
					variant="outline"
					size="sm"
					onClick={() => muteAudio(!isAudioMuted)}
					className="min-w-[7.5rem]"
					disabled={!callReady}
				>
					<StableButtonLabel
						current={audioButtonLabel}
						reserve={['Mute Audio', 'Unmute Audio']}
					/>
				</Button>
				<Button
					variant="outline"
					size="sm"
					onClick={handleToggleVideo}
					className="min-w-[7rem]"
					disabled={!callReady}
				>
					<StableButtonLabel
						current={videoButtonLabel}
						reserve={['Show Video', 'Hide Video']}
					/>
				</Button>
				<Button
					variant="outline"
					size="sm"
					onClick={handleToggleScreenShare}
					className="min-w-[7.75rem]"
					disabled={!callReady}
				>
					<StableButtonLabel
						current={screenShareButtonLabel}
						reserve={['Share Screen', 'Stop Share']}
					/>
				</Button>
			</div>

			{mediaError ? (
				<div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
					{mediaError}
				</div>
			) : null}
			{error && !mediaError ? (
				<div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
					{error.message}
				</div>
			) : null}

			<div className="grid gap-3 md:grid-cols-2">{participantTiles}</div>

			<ConnectionStatsPanel quality={quality} remotePeerIds={orderedRemotePeerIds} />
		</div>
	);
}

export function WebRTCDemo(): React.JSX.Element {
	const [roomId, setRoomId] = useState(() => {
		if (typeof window === 'undefined') {
			return createRoomId();
		}

		const params = new URLSearchParams(window.location.search);
		const roomFromUrl = params.get('room');
		if (roomFromUrl) {
			return roomFromUrl;
		}

		try {
			const stored = window.sessionStorage.getItem(ROOM_STORAGE_KEY);
			if (stored) {
				return stored;
			}
		} catch {}

		return createRoomId();
	});
	const [tab, setTab] = useState<'data' | 'video'>(() => {
		if (typeof window === 'undefined') {
			return 'data';
		}

		try {
			const stored = window.sessionStorage.getItem(TAB_STORAGE_KEY);
			return stored === 'video' ? 'video' : 'data';
		} catch {
			return 'data';
		}
	});
	const effectiveRoomId = roomId.trim();

	useEffect(() => {
		if (typeof window === 'undefined') {
			return;
		}

		try {
			window.sessionStorage.setItem(ROOM_STORAGE_KEY, roomId);
		} catch {}

		const url = new URL(window.location.href);
		if (effectiveRoomId) {
			url.searchParams.set('room', effectiveRoomId);
		} else {
			url.searchParams.delete('room');
		}
		window.history.replaceState({}, '', url);
	}, [effectiveRoomId, roomId]);

	useEffect(() => {
		if (typeof window === 'undefined') {
			return;
		}

		try {
			window.sessionStorage.setItem(TAB_STORAGE_KEY, tab);
		} catch {}
	}, [tab]);

	return (
		<div className="space-y-4">
			<div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-black">
				<p className="text-sm text-zinc-500">
					Open this page in two browser tabs with the same room ID to test peer-to-peer data or
					video connections.
				</p>

				<div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
					<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
						<label className="text-sm text-zinc-500" htmlFor="webrtc-room-id">
							Room ID
						</label>
						<Input
							id="webrtc-room-id"
							value={roomId}
							onChange={(event) => setRoomId(event.target.value)}
							placeholder="Enter a room ID"
							className="w-full sm:max-w-[240px]"
						/>
					</div>
					<ShareControls roomId={effectiveRoomId} />
				</div>

				<div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-4 py-3">
					<p className="text-xs text-zinc-600 dark:text-zinc-400">
						<span className="font-medium text-cyan-600 dark:text-cyan-400">Tip:</span>{' '}
						Switching between the Data Channel and Video Call tabs resets the active peer
						connection for that browser tab.
					</p>
				</div>

				<Tabs value={tab} onValueChange={(value) => setTab(value as 'data' | 'video')}>
					<TabsList className="grid w-full grid-cols-2 sm:inline-flex sm:w-fit">
						<TabsTrigger value="data">Data Channel</TabsTrigger>
						<TabsTrigger value="video">Video Call</TabsTrigger>
					</TabsList>
					<TabsContent value="data">
						{tab === 'data' ? (
							<DataChannelTab
								key={effectiveRoomId || 'empty-data'}
								roomId={effectiveRoomId}
							/>
						) : null}
					</TabsContent>
					<TabsContent value="video">
						{tab === 'video' ? (
							<VideoCallTab
								key={effectiveRoomId || 'empty-video'}
								roomId={effectiveRoomId}
							/>
						) : null}
					</TabsContent>
				</Tabs>
			</div>
		</div>
	);
}
