import { useCallback, useEffect, useRef, useState } from 'react';
import { WebRTCManager, type WebRTCConnectionState } from '@agentuity/frontend';
import type { RecordingHandle, RecordingState } from '@agentuity/core';

interface Message {
	from: 'local' | 'remote';
	peerId?: string;
	data: string;
	timestamp: number;
}

interface CursorPosition {
	peerId: string;
	x: number;
	y: number;
	color: string;
}

const CURSOR_COLORS = [
	'#e91e63',
	'#9c27b0',
	'#673ab7',
	'#3f51b5',
	'#2196f3',
	'#00bcd4',
	'#009688',
	'#4caf50',
	'#ff9800',
	'#ff5722',
];

export function WebRTCTestPage() {
	const [roomId, setRoomId] = useState('e2e-test-room');
	const [state, setState] = useState<WebRTCConnectionState>('idle');
	const [peerId, setPeerId] = useState<string | null>(null);
	const [remotePeerIds, setRemotePeerIds] = useState<string[]>([]);
	const [messages, setMessages] = useState<Message[]>([]);
	const [inputMessage, setInputMessage] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [dataChannelOpen, setDataChannelOpen] = useState(false);
	const [isScreenSharing, setIsScreenSharing] = useState(false);
	const [recordingState, setRecordingState] = useState<RecordingState>('inactive');
	const [recordingSize, setRecordingSize] = useState<number | null>(null);
	const [recordingMimeType, setRecordingMimeType] = useState<string | null>(null);

	// Media options
	const [enableVideo, setEnableVideo] = useState(false);
	const [enableAudio, setEnableAudio] = useState(false);
	const [isAudioMuted, setIsAudioMuted] = useState(false);
	const [isVideoMuted, setIsVideoMuted] = useState(false);
	const [autoReconnect, setAutoReconnect] = useState(true);
	const [maxReconnectAttempts, setMaxReconnectAttempts] = useState(5);
	const [reconnectAttempt, setReconnectAttempt] = useState<number | null>(null);
	const [reconnectStatus, setReconnectStatus] = useState<
		'idle' | 'reconnecting' | 'reconnected' | 'failed'
	>('idle');

	// Cursor tracking
	const [remoteCursors, setRemoteCursors] = useState<Map<string, CursorPosition>>(new Map());
	const [cursorChannelOpen, setCursorChannelOpen] = useState(false);
	const peerColorsRef = useRef<Map<string, string>>(new Map());

	// Store remote streams so we can apply them when video elements mount
	const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

	const managerRef = useRef<WebRTCManager | null>(null);
	const localVideoRef = useRef<HTMLVideoElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const recordingHandleRef = useRef<RecordingHandle | null>(null);
	const checkPeerIdRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const connect = useCallback(() => {
		// Clear any existing peer ID check interval
		if (checkPeerIdRef.current) {
			clearInterval(checkPeerIdRef.current);
			checkPeerIdRef.current = null;
		}
		if (managerRef.current) {
			managerRef.current.dispose();
		}
		setError(null);
		setReconnectStatus('idle');
		setReconnectAttempt(null);

		const signalUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/webrtc/signal`;

		const mediaEnabled = enableVideo || enableAudio;
		const mediaConstraints = mediaEnabled ? { video: enableVideo, audio: enableAudio } : false;

		const manager = new WebRTCManager({
			signalUrl,
			roomId,
			media: mediaConstraints,
			autoReconnect,
			maxReconnectAttempts,
			dataChannels: [
				{ label: 'chat', ordered: true },
				{ label: 'cursors', ordered: false, maxRetransmits: 0 },
			],
			callbacks: {
				onLocalStream: (stream) => {
					console.log('[WebRTC] Local stream received');
					if (localVideoRef.current) {
						localVideoRef.current.srcObject = stream;
					}
				},
				onRemoteStream: (remotePeerId, stream) => {
					console.log('[WebRTC] Remote stream received from:', remotePeerId);
					setRemoteStreams((prev) => {
						const next = new Map(prev);
						next.set(remotePeerId, stream);
						return next;
					});
				},
				onStateChange: (from, to, reason) => {
					console.log(`[WebRTC] State: ${from} → ${to}`, reason);
					setState(to);
				},
				onConnect: () => {
					console.log('[WebRTC] Connected!');
				},
				onDisconnect: (reason) => {
					console.log('[WebRTC] Disconnected:', reason);
					setDataChannelOpen(false);
					setRemotePeerIds([]);
					setIsScreenSharing(false);
				},
				onPeerJoined: (id) => {
					console.log('[WebRTC] Peer joined:', id);
					setRemotePeerIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
				},
				onPeerLeft: (id) => {
					console.log('[WebRTC] Peer left:', id);
					setRemotePeerIds((prev) => prev.filter((p) => p !== id));
					setRemoteStreams((prev) => {
						const next = new Map(prev);
						next.delete(id);
						return next;
					});
				},
				onDataChannelOpen: (remotePeerId, label) => {
					console.log('[WebRTC] Data channel opened:', label, 'with peer:', remotePeerId);
					if (label === 'chat') {
						setDataChannelOpen(true);
					}
					if (label === 'cursors') {
						setCursorChannelOpen(true);
						// Assign color to peer if not already assigned
						if (!peerColorsRef.current.has(remotePeerId)) {
							const colorIndex = peerColorsRef.current.size % CURSOR_COLORS.length;
							const color = CURSOR_COLORS[colorIndex] ?? '#e91e63';
							peerColorsRef.current.set(remotePeerId, color);
						}
					}
				},
				onDataChannelClose: (remotePeerId, label) => {
					console.log('[WebRTC] Data channel closed:', label, 'with peer:', remotePeerId);
					if (label === 'chat') {
						const manager = managerRef.current;
						if (manager) {
							const labels = manager.getDataChannelLabels();
							if (!labels.includes('chat')) {
								setDataChannelOpen(false);
							}
						}
					}
					if (label === 'cursors') {
						// Remove cursor when peer's channel closes
						setRemoteCursors((prev) => {
							const next = new Map(prev);
							next.delete(remotePeerId);
							return next;
						});
					}
				},
				onDataChannelMessage: (remotePeerId, label, data) => {
					if (label === 'chat') {
						console.log('[WebRTC] Chat message from:', remotePeerId, data);
						setMessages((prev) => [
							...prev,
							{
								from: 'remote',
								peerId: remotePeerId,
								data: typeof data === 'string' ? data : JSON.stringify(data),
								timestamp: Date.now(),
							},
						]);
					}
					if (label === 'cursors' && typeof data === 'object' && data !== null) {
						const cursorData = data as { x: number; y: number };
						const color = peerColorsRef.current.get(remotePeerId) || '#999';
						setRemoteCursors((prev) => {
							const next = new Map(prev);
							next.set(remotePeerId, {
								peerId: remotePeerId,
								x: cursorData.x,
								y: cursorData.y,
								color,
							});
							return next;
						});
					}
				},
				onDataChannelError: (remotePeerId, label, err) => {
					console.error('[WebRTC] Data channel error:', label, err, 'peer:', remotePeerId);
					setError(`Data channel error: ${err.message}`);
				},
				onError: (err) => {
					console.error('[WebRTC] Error:', err);
					setError(err.message);
				},
				onScreenShareStart: () => {
					setIsScreenSharing(true);
				},
				onScreenShareStop: () => {
					setIsScreenSharing(false);
				},
				onReconnecting: (attempt: number) => {
					setReconnectAttempt(attempt);
					setReconnectStatus('reconnecting');
				},
				onReconnected: () => {
					setReconnectStatus('reconnected');
				},
				onReconnectFailed: () => {
					setReconnectStatus('failed');
				},
			},
		});

		managerRef.current = manager;
		manager.connect();

		checkPeerIdRef.current = setInterval(() => {
			const managerState = manager.getState();
			if (managerState.peerId) {
				setPeerId(managerState.peerId);
				if (checkPeerIdRef.current) {
					clearInterval(checkPeerIdRef.current);
					checkPeerIdRef.current = null;
				}
			}
		}, 100);
	}, [roomId, enableVideo, enableAudio, autoReconnect, maxReconnectAttempts]);

	const toggleAudioMute = useCallback(() => {
		if (managerRef.current) {
			const newMuted = !isAudioMuted;
			managerRef.current.muteAudio(newMuted);
			setIsAudioMuted(newMuted);
		}
	}, [isAudioMuted]);

	const toggleVideoMute = useCallback(() => {
		if (managerRef.current) {
			const newMuted = !isVideoMuted;
			managerRef.current.muteVideo(newMuted);
			setIsVideoMuted(newMuted);
		}
	}, [isVideoMuted]);

	const startScreenShare = useCallback(async () => {
		if (!managerRef.current) return;
		try {
			await managerRef.current.startScreenShare();
			managerRef.current.sendJSON('chat', { type: 'screen-share', active: true });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			setError(message);
		}
	}, []);

	const stopScreenShare = useCallback(async () => {
		if (!managerRef.current) return;
		try {
			await managerRef.current.stopScreenShare();
			managerRef.current.sendJSON('chat', { type: 'screen-share', active: false });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			setError(message);
		}
	}, []);

	const startRecording = useCallback(() => {
		if (!managerRef.current) return;
		const handle = managerRef.current.startRecording('local');
		if (!handle) {
			setError('Recording failed');
			return;
		}
		recordingHandleRef.current = handle;
		setRecordingState(handle.state);
		setRecordingSize(null);
		setRecordingMimeType(null);
	}, []);

	const stopRecording = useCallback(async () => {
		const handle = recordingHandleRef.current;
		if (!handle) return;
		try {
			const blob = await handle.stop();
			setRecordingState('inactive');
			setRecordingSize(blob.size);
			setRecordingMimeType(blob.type);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			console.error('Recording stop failed:', message);
			setError(message);
			setRecordingState('inactive');
			setRecordingSize(null);
			setRecordingMimeType(null);
		} finally {
			recordingHandleRef.current = null;
		}
	}, []);

	const forceWebSocketClose = useCallback(() => {
		const manager = managerRef.current as unknown as { ws?: WebSocket } | null;
		manager?.ws?.close();
	}, []);

	// Test utility: Set an invalid signal URL to force reconnection failures
	const setInvalidSignalUrl = useCallback(() => {
		const manager = managerRef.current as unknown as { options?: { signalUrl?: string } } | null;
		if (manager?.options) {
			manager.options.signalUrl = 'ws://invalid-host-that-will-not-resolve.local:12345/signal';
		}
	}, []);

	// Handle canvas mouse movement
	const handleCanvasMouseMove = useCallback(
		(e: React.MouseEvent<HTMLCanvasElement>) => {
			if (!managerRef.current || !cursorChannelOpen) return;

			const canvas = canvasRef.current;
			if (!canvas) return;

			const rect = canvas.getBoundingClientRect();
			const x = ((e.clientX - rect.left) / rect.width) * 100;
			const y = ((e.clientY - rect.top) / rect.height) * 100;

			managerRef.current.sendJSON('cursors', { x, y });
		},
		[cursorChannelOpen]
	);

	// Draw cursors on canvas
	const drawCanvas = useCallback(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		// Clear canvas
		ctx.fillStyle = '#1a1a2e';
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		// Draw grid
		ctx.strokeStyle = '#333';
		ctx.lineWidth = 1;
		for (let i = 0; i <= 10; i++) {
			const x = (canvas.width / 10) * i;
			const y = (canvas.height / 10) * i;
			ctx.beginPath();
			ctx.moveTo(x, 0);
			ctx.lineTo(x, canvas.height);
			ctx.stroke();
			ctx.beginPath();
			ctx.moveTo(0, y);
			ctx.lineTo(canvas.width, y);
			ctx.stroke();
		}

		// Draw title
		ctx.fillStyle = '#666';
		ctx.font = '14px system-ui';
		ctx.textAlign = 'center';
		ctx.fillText('Move your cursor here to share position', canvas.width / 2, 20);

		// Draw remote cursors
		remoteCursors.forEach((cursor) => {
			const x = (cursor.x / 100) * canvas.width;
			const y = (cursor.y / 100) * canvas.height;

			// Draw cursor pointer
			ctx.fillStyle = cursor.color;
			ctx.beginPath();
			ctx.moveTo(x, y);
			ctx.lineTo(x + 12, y + 10);
			ctx.lineTo(x + 4, y + 10);
			ctx.lineTo(x + 4, y + 18);
			ctx.lineTo(x, y + 14);
			ctx.closePath();
			ctx.fill();

			// Draw peer label
			ctx.fillStyle = cursor.color;
			ctx.font = 'bold 10px system-ui';
			ctx.textAlign = 'left';
			const label = cursor.peerId.slice(5, 15);
			ctx.fillText(label, x + 14, y + 14);
		});
	}, [remoteCursors]);

	useEffect(() => {
		drawCanvas();
	}, [drawCanvas]);

	const disconnect = useCallback(() => {
		// Clear peer ID check interval
		if (checkPeerIdRef.current) {
			clearInterval(checkPeerIdRef.current);
			checkPeerIdRef.current = null;
		}
		if (managerRef.current) {
			managerRef.current.dispose();
			managerRef.current = null;
		}
		setState('idle');
		setPeerId(null);
		setRemotePeerIds([]);
		setRemoteStreams(new Map());
		setDataChannelOpen(false);
		setCursorChannelOpen(false);
		setRemoteCursors(new Map());
		setIsScreenSharing(false);
		setRecordingState('inactive');
		setRecordingSize(null);
		setRecordingMimeType(null);
		recordingHandleRef.current = null;
		setReconnectStatus('idle');
		setReconnectAttempt(null);
	}, []);

	const sendMessage = useCallback(() => {
		if (!managerRef.current || !inputMessage.trim()) return;

		const success = managerRef.current.sendString('chat', inputMessage);
		if (success) {
			setMessages((prev) => [
				...prev,
				{ from: 'local', data: inputMessage, timestamp: Date.now() },
			]);
			setInputMessage('');
		}
	}, [inputMessage]);

	const sendJSON = useCallback(() => {
		if (!managerRef.current) return;

		const data = { type: 'ping', timestamp: Date.now() };
		const success = managerRef.current.sendJSON('chat', data);
		if (success) {
			setMessages((prev) => [
				...prev,
				{ from: 'local', data: JSON.stringify(data), timestamp: Date.now() },
			]);
		}
	}, []);

	useEffect(() => {
		return () => {
			// Clean up peer ID check interval
			if (checkPeerIdRef.current) {
				clearInterval(checkPeerIdRef.current);
				checkPeerIdRef.current = null;
			}
			if (managerRef.current) {
				managerRef.current.dispose();
			}
		};
	}, []);

	return (
		<div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
			<h1>WebRTC Data Channel Test</h1>

			<div style={{ marginBottom: '1rem' }}>
				<label>
					Room ID:{' '}
					<input
						type="text"
						value={roomId}
						onChange={(e) => setRoomId(e.target.value)}
						disabled={state !== 'idle'}
						data-testid="room-id-input"
						style={{ padding: '0.5rem', marginLeft: '0.5rem' }}
					/>
				</label>
			</div>

			{state !== 'idle' && (
				<div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
					<button
						type="button"
						onClick={forceWebSocketClose}
						data-testid="force-ws-close-btn"
						style={{ padding: '0.5rem 1rem' }}
					>
						Force WS Close
					</button>
					<button
						type="button"
						onClick={setInvalidSignalUrl}
						data-testid="set-invalid-signal-url-btn"
						style={{ padding: '0.5rem 1rem' }}
					>
						Set Invalid Signal URL
					</button>
				</div>
			)}

			<div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem' }}>
				<label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
					<input
						type="checkbox"
						checked={enableVideo}
						onChange={(e) => setEnableVideo(e.target.checked)}
						disabled={state !== 'idle'}
						data-testid="enable-video"
					/>
					Enable Video
				</label>
				<label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
					<input
						type="checkbox"
						checked={enableAudio}
						onChange={(e) => setEnableAudio(e.target.checked)}
						disabled={state !== 'idle'}
						data-testid="enable-audio"
					/>
					Enable Audio
				</label>
			</div>

			<div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
				<label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
					<input
						type="checkbox"
						checked={autoReconnect}
						onChange={(e) => setAutoReconnect(e.target.checked)}
						disabled={state !== 'idle'}
						data-testid="auto-reconnect-toggle"
					/>
					Auto Reconnect
				</label>
				<label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
					Max Attempts
					<input
						type="number"
						min={0}
						value={maxReconnectAttempts}
						onChange={(e) => setMaxReconnectAttempts(Number(e.target.value))}
						disabled={state !== 'idle'}
						data-testid="max-reconnect-input"
						style={{ width: '5rem', padding: '0.25rem' }}
					/>
				</label>
			</div>

			<div style={{ marginBottom: '1rem' }}>
				{state === 'idle' ? (
					<button
						type="button"
						onClick={connect}
						data-testid="connect-btn"
						style={{ padding: '0.5rem 1rem' }}
					>
						Connect
					</button>
				) : (
					<button
						type="button"
						onClick={disconnect}
						data-testid="disconnect-btn"
						style={{ padding: '0.5rem 1rem' }}
					>
						Disconnect
					</button>
				)}
			</div>

			<div
				style={{
					marginBottom: '1rem',
					padding: '1rem',
					background: '#f5f5f5',
					borderRadius: '4px',
				}}
			>
				<div data-testid="connection-state">
					<strong>State:</strong> {state}
				</div>
				<div data-testid="peer-id">
					<strong>My Peer ID:</strong> {peerId || 'N/A'}
				</div>
				<div data-testid="remote-peer-id">
					<strong>Remote Peers:</strong>{' '}
					{remotePeerIds.length > 0 ? remotePeerIds.join(', ') : 'Waiting...'}
				</div>
				<div data-testid="data-channel-state">
					<strong>Data Channel:</strong> {dataChannelOpen ? 'Open' : 'Closed'}
				</div>
				<div data-testid="screen-share-state">
					<strong>Screen Share:</strong> {isScreenSharing ? 'On' : 'Off'}
				</div>
				<div data-testid="reconnect-status">
					<strong>Reconnect:</strong> {reconnectStatus}
				</div>
				{reconnectAttempt !== null && (
					<div data-testid="reconnect-attempt">
						<strong>Reconnect Attempt:</strong> {reconnectAttempt}
					</div>
				)}
				{error && (
					<div data-testid="error" style={{ color: 'red' }}>
						<strong>Error:</strong> {error}
					</div>
				)}
			</div>

			{/* Cursor Tracking Canvas */}
			{state !== 'idle' && (
				<div style={{ marginBottom: '1rem' }}>
					<h3>Cursor Tracking</h3>
					<p style={{ fontSize: '0.875rem', color: '#666', marginBottom: '0.5rem' }}>
						Move your mouse over the canvas to share your cursor position with peers.
						{remoteCursors.size > 0 &&
							` (${remoteCursors.size} remote cursor${remoteCursors.size > 1 ? 's' : ''})`}
					</p>
					<canvas
						ref={canvasRef}
						width={600}
						height={300}
						onMouseMove={handleCanvasMouseMove}
						data-testid="cursor-canvas"
						style={{
							border: '2px solid #333',
							borderRadius: '8px',
							cursor: 'crosshair',
							display: 'block',
						}}
					/>
				</div>
			)}

			{/* Video Section */}
			{(enableVideo || enableAudio) && state !== 'idle' && (
				<div style={{ marginBottom: '1rem' }}>
					<h3>Media</h3>
					<div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
						{/* Local Video */}
						<div>
							<div style={{ marginBottom: '0.5rem', fontWeight: 'bold' }}>You</div>
							<video
								ref={localVideoRef}
								autoPlay
								muted
								playsInline
								data-testid="local-video"
								style={{
									width: '240px',
									height: '180px',
									background: '#000',
									borderRadius: '4px',
								}}
							>
								<track kind="captions" src="data:text/vtt,WEBVTT" label="captions" />
							</video>
							<div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
								{enableAudio && (
									<button
										type="button"
										onClick={toggleAudioMute}
										data-testid="mute-audio-btn"
										style={{
											padding: '0.25rem 0.5rem',
											background: isAudioMuted ? '#f44336' : '#4caf50',
											color: 'white',
											border: 'none',
											borderRadius: '4px',
											cursor: 'pointer',
										}}
									>
										{isAudioMuted ? '🔇 Unmute' : '🔊 Mute'}
									</button>
								)}
								{enableVideo && (
									<button
										type="button"
										onClick={toggleVideoMute}
										data-testid="mute-video-btn"
										style={{
											padding: '0.25rem 0.5rem',
											background: isVideoMuted ? '#f44336' : '#4caf50',
											color: 'white',
											border: 'none',
											borderRadius: '4px',
											cursor: 'pointer',
										}}
									>
										{isVideoMuted ? '📷 Show' : '📷 Hide'}
									</button>
								)}
							</div>
							<div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
								<button
									type="button"
									onClick={startScreenShare}
									disabled={isScreenSharing}
									data-testid="start-screen-share-btn"
									style={{ padding: '0.25rem 0.5rem' }}
								>
									Start Screen Share
								</button>
								<button
									type="button"
									onClick={stopScreenShare}
									disabled={!isScreenSharing}
									data-testid="stop-screen-share-btn"
									style={{ padding: '0.25rem 0.5rem' }}
								>
									Stop Screen Share
								</button>
							</div>
							<div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
								<button
									type="button"
									onClick={startRecording}
									disabled={recordingState === 'recording'}
									data-testid="start-recording-btn"
									style={{ padding: '0.25rem 0.5rem' }}
								>
									Start Recording
								</button>
								<button
									type="button"
									onClick={stopRecording}
									disabled={recordingState !== 'recording'}
									data-testid="stop-recording-btn"
									style={{ padding: '0.25rem 0.5rem' }}
								>
									Stop Recording
								</button>
							</div>
							<div style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}>
								<div data-testid="recording-state">
									<strong>Recording:</strong> {recordingState}
								</div>
								<div data-testid="recording-size">
									<strong>Recording Size:</strong>{' '}
									{recordingSize !== null ? `${recordingSize} bytes` : 'N/A'}
								</div>
								<div data-testid="recording-mime">
									<strong>Recording MIME:</strong> {recordingMimeType ?? 'N/A'}
								</div>
							</div>
						</div>

						{/* Remote Videos */}
						{remotePeerIds.map((remotePeerId) => (
							<div key={remotePeerId}>
								<div style={{ marginBottom: '0.5rem', fontWeight: 'bold' }}>
									{remotePeerId.slice(0, 15)}...
								</div>
								<video
									ref={(el) => {
										if (el) {
											const stream = remoteStreams.get(remotePeerId);
											if (stream && el.srcObject !== stream) {
												el.srcObject = stream;
											}
										}
									}}
									autoPlay
									playsInline
									data-testid={`remote-video-${remotePeerId}`}
									style={{
										width: '240px',
										height: '180px',
										background: '#000',
										borderRadius: '4px',
									}}
								>
									<track kind="captions" src="data:text/vtt,WEBVTT" label="captions" />
								</video>
							</div>
						))}
					</div>
				</div>
			)}

			{dataChannelOpen && (
				<div style={{ marginBottom: '1rem' }}>
					<div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
						<input
							type="text"
							value={inputMessage}
							onChange={(e) => setInputMessage(e.target.value)}
							onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
							placeholder="Type a message..."
							data-testid="message-input"
							style={{ flex: 1, padding: '0.5rem' }}
						/>
						<button
							type="button"
							onClick={sendMessage}
							data-testid="send-btn"
							style={{ padding: '0.5rem 1rem' }}
						>
							Send
						</button>
						<button
							type="button"
							onClick={sendJSON}
							data-testid="send-json-btn"
							style={{ padding: '0.5rem 1rem' }}
						>
							Send JSON
						</button>
					</div>
				</div>
			)}

			<div
				data-testid="messages"
				style={{
					border: '1px solid #ccc',
					borderRadius: '4px',
					padding: '1rem',
					minHeight: '200px',
					maxHeight: '400px',
					overflowY: 'auto',
				}}
			>
				<h3>Messages</h3>
				{messages.length === 0 ? (
					<p style={{ color: '#999' }}>No messages yet</p>
				) : (
					messages.map((msg) => (
						<div
							key={`${msg.timestamp}-${msg.from}-${msg.peerId ?? 'local'}`}
							data-testid={`message-${msg.from}`}
							style={{
								padding: '0.5rem',
								marginBottom: '0.5rem',
								background: msg.from === 'local' ? '#e3f2fd' : '#f3e5f5',
								borderRadius: '4px',
							}}
						>
							<strong>{msg.from === 'local' ? 'You' : `Remote (${msg.peerId})`}:</strong>{' '}
							{msg.data}
						</div>
					))
				)}
			</div>
		</div>
	);
}
