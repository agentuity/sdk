import { useWebRTCCall } from '@agentuity/react';
import { useState, useEffect } from 'react';

export function App() {
	const [roomId, setRoomId] = useState('test-room');
	const [joined, setJoined] = useState(false);

	const {
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
	} = useWebRTCCall({
		roomId,
		signalUrl: '/api/call/signal',
		autoConnect: false,
	});

	// Auto-attach streams to video elements when refs are ready
	useEffect(() => {
		if (localVideoRef.current) {
			localVideoRef.current.muted = true;
			localVideoRef.current.playsInline = true;
		}
		if (remoteVideoRef.current) {
			remoteVideoRef.current.playsInline = true;
		}
	}, [localVideoRef, remoteVideoRef]);

	const handleJoin = () => {
		setJoined(true);
		connect();
	};

	const handleLeave = () => {
		hangup();
		setJoined(false);
	};

	return (
		<div className="app">
			<header className="header">
				<h1>WebRTC Video Call Demo</h1>
				<p className="subtitle">Powered by Agentuity</p>
			</header>

			{!joined ? (
				<div className="join-card">
					<h2>Join a Room</h2>
					<div className="input-group">
						<label htmlFor="room-id">Room ID:</label>
						<input
							id="room-id"
							type="text"
							value={roomId}
							onChange={(e) => setRoomId(e.target.value)}
							placeholder="Enter room ID"
						/>
					</div>
					<button className="join-btn" onClick={handleJoin}>
						Join Call
					</button>
					<p className="hint">Open this page in two browser tabs to test</p>
				</div>
			) : (
				<div className="call-container">
					<div className="status-bar">
						<span className={`status status-${status}`}>{status}</span>
						{peerId && <span className="peer-id">You: {peerId}</span>}
						{remotePeerId && <span className="peer-id">Remote: {remotePeerId}</span>}
					</div>

					{error && <div className="error">Error: {error.message}</div>}

					<div className="video-grid">
						<div className="video-container local">
							<video ref={localVideoRef} autoPlay muted playsInline />
							<span className="video-label">You</span>
						</div>
						<div className="video-container remote">
							<video ref={remoteVideoRef} autoPlay playsInline />
							<span className="video-label">
								{remotePeerId ? 'Remote Peer' : 'Waiting for peer...'}
							</span>
						</div>
					</div>

					<div className="controls">
						<button
							className={`control-btn ${isAudioMuted ? 'muted' : ''}`}
							onClick={() => muteAudio(!isAudioMuted)}
						>
							{isAudioMuted ? '🔇 Unmute' : '🔊 Mute'}
						</button>
						<button
							className={`control-btn ${isVideoMuted ? 'muted' : ''}`}
							onClick={() => muteVideo(!isVideoMuted)}
						>
							{isVideoMuted ? '📵 Show Video' : '📹 Hide Video'}
						</button>
						<button className="control-btn hangup" onClick={handleLeave}>
							📞 Leave
						</button>
					</div>
				</div>
			)}

			<style>{`
				* {
					box-sizing: border-box;
					margin: 0;
					padding: 0;
				}

				.app {
					background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #16213e 100%);
					color: #fff;
					min-height: 100vh;
					font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
					padding: 2rem;
				}

				.header {
					text-align: center;
					margin-bottom: 2rem;
				}

				.header h1 {
					font-size: 2.5rem;
					font-weight: 600;
					background: linear-gradient(90deg, #00ffff, #7c3aed, #f472b6);
					-webkit-background-clip: text;
					-webkit-text-fill-color: transparent;
					background-clip: text;
				}

				.subtitle {
					color: #64748b;
					margin-top: 0.5rem;
				}

				.join-card {
					max-width: 400px;
					margin: 4rem auto;
					background: rgba(255, 255, 255, 0.05);
					backdrop-filter: blur(10px);
					border: 1px solid rgba(255, 255, 255, 0.1);
					border-radius: 1rem;
					padding: 2rem;
					text-align: center;
				}

				.join-card h2 {
					margin-bottom: 1.5rem;
					font-weight: 500;
				}

				.input-group {
					margin-bottom: 1.5rem;
					text-align: left;
				}

				.input-group label {
					display: block;
					margin-bottom: 0.5rem;
					color: #94a3b8;
					font-size: 0.875rem;
				}

				.input-group input {
					width: 100%;
					padding: 0.75rem 1rem;
					background: rgba(0, 0, 0, 0.3);
					border: 1px solid rgba(255, 255, 255, 0.1);
					border-radius: 0.5rem;
					color: #fff;
					font-size: 1rem;
					outline: none;
					transition: border-color 0.2s;
				}

				.input-group input:focus {
					border-color: #00ffff;
				}

				.join-btn {
					width: 100%;
					padding: 1rem;
					background: linear-gradient(90deg, #00b4d8, #7c3aed);
					border: none;
					border-radius: 0.5rem;
					color: #fff;
					font-size: 1rem;
					font-weight: 600;
					cursor: pointer;
					transition: transform 0.2s, box-shadow 0.2s;
				}

				.join-btn:hover {
					transform: translateY(-2px);
					box-shadow: 0 10px 40px rgba(0, 180, 216, 0.3);
				}

				.hint {
					margin-top: 1rem;
					color: #64748b;
					font-size: 0.875rem;
				}

				.call-container {
					max-width: 1000px;
					margin: 0 auto;
				}

				.status-bar {
					display: flex;
					align-items: center;
					gap: 1rem;
					margin-bottom: 1rem;
					padding: 0.75rem 1rem;
					background: rgba(0, 0, 0, 0.3);
					border-radius: 0.5rem;
					font-size: 0.875rem;
				}

				.status {
					padding: 0.25rem 0.75rem;
					border-radius: 1rem;
					font-weight: 500;
					text-transform: capitalize;
				}

				.status-disconnected { background: #dc2626; }
				.status-connecting { background: #f59e0b; }
				.status-signaling { background: #3b82f6; }
				.status-connected { background: #10b981; }

				.peer-id {
					color: #94a3b8;
					font-family: monospace;
					font-size: 0.75rem;
				}

				.error {
					background: rgba(220, 38, 38, 0.2);
					border: 1px solid #dc2626;
					border-radius: 0.5rem;
					padding: 1rem;
					margin-bottom: 1rem;
					color: #fca5a5;
				}

				.video-grid {
					display: grid;
					grid-template-columns: 1fr 1fr;
					gap: 1rem;
					margin-bottom: 1rem;
				}

				.video-container {
					position: relative;
					aspect-ratio: 4/3;
					background: rgba(0, 0, 0, 0.5);
					border-radius: 1rem;
					overflow: hidden;
					border: 2px solid rgba(255, 255, 255, 0.1);
				}

				.video-container.local {
					border-color: rgba(0, 255, 255, 0.3);
				}

				.video-container.remote {
					border-color: rgba(124, 58, 237, 0.3);
				}

				.video-container video {
					width: 100%;
					height: 100%;
					object-fit: cover;
				}

				.video-label {
					position: absolute;
					bottom: 0.5rem;
					left: 0.5rem;
					background: rgba(0, 0, 0, 0.7);
					padding: 0.25rem 0.75rem;
					border-radius: 0.25rem;
					font-size: 0.75rem;
				}

				.controls {
					display: flex;
					justify-content: center;
					gap: 1rem;
				}

				.control-btn {
					padding: 0.75rem 1.5rem;
					background: rgba(255, 255, 255, 0.1);
					border: 1px solid rgba(255, 255, 255, 0.2);
					border-radius: 0.5rem;
					color: #fff;
					font-size: 0.875rem;
					cursor: pointer;
					transition: all 0.2s;
				}

				.control-btn:hover {
					background: rgba(255, 255, 255, 0.2);
				}

				.control-btn.muted {
					background: rgba(220, 38, 38, 0.2);
					border-color: #dc2626;
				}

				.control-btn.hangup {
					background: #dc2626;
					border-color: #dc2626;
				}

				.control-btn.hangup:hover {
					background: #b91c1c;
				}

				@media (max-width: 768px) {
					.video-grid {
						grid-template-columns: 1fr;
					}
				}
			`}</style>
		</div>
	);
}
