import { useWebsocket, useEventStream } from '@agentuity/react';
import { useState } from 'react';

export function StreamsPage() {
	const [message, setMessage] = useState('');
	const { isConnected: wsConnected, send, messages: wsMessages } = useWebsocket('/api/echo');
	const { isConnected: sseConnected, data: sseData } = useEventStream('/api/events');

	const handleSend = () => {
		if (message.trim()) {
			send({ message });
			setMessage('');
		}
	};

	return (
		<div
			style={{
				padding: '2rem',
				fontFamily: 'system-ui',
				color: '#fff',
				background: '#09090b',
				minHeight: '100vh',
			}}
		>
			<h1>WebSocket & EventStream Tests</h1>

			{/* WebSocket Section */}
			<div
				style={{
					marginBottom: '3rem',
					padding: '1.5rem',
					background: '#000',
					borderRadius: '0.5rem',
					border: '1px solid #18181b',
				}}
			>
				<h2 style={{ marginTop: 0 }}>WebSocket Echo</h2>
				<div
					data-testid="ws-status"
					style={{ marginBottom: '1rem', color: wsConnected ? '#00c951' : '#ef4444' }}
				>
					Status: {wsConnected ? 'Connected' : 'Disconnected'}
				</div>

				<div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
					<input
						data-testid="ws-input"
						value={message}
						onChange={(e) => setMessage(e.target.value)}
						onKeyDown={(e) => e.key === 'Enter' && handleSend()}
						placeholder="Type a message..."
						style={{
							flex: 1,
							padding: '0.75rem',
							background: '#09090b',
							border: '1px solid #2b2b30',
							borderRadius: '0.375rem',
							color: '#fff',
						}}
					/>
					<button
						data-testid="ws-send"
						onClick={handleSend}
						disabled={!wsConnected || !message.trim()}
						style={{
							padding: '0.75rem 1.5rem',
							background: wsConnected ? '#0891b2' : '#2b2b30',
							border: 'none',
							borderRadius: '0.375rem',
							color: '#fff',
							cursor: wsConnected && message.trim() ? 'pointer' : 'not-allowed',
						}}
					>
						Send
					</button>
				</div>

				<div
					data-testid="ws-messages"
					style={{
						background: '#09090b',
						border: '1px solid #2b2b30',
						borderRadius: '0.375rem',
						padding: '1rem',
						maxHeight: '200px',
						overflow: 'auto',
					}}
				>
					{wsMessages.length === 0 ? (
						<div style={{ color: '#a1a1aa' }}>No messages yet</div>
					) : (
						wsMessages.map((msg, i) => (
							<div
								key={i}
								style={{
									marginBottom: '0.5rem',
									fontFamily: 'monospace',
									fontSize: '0.875rem',
								}}
							>
								<span style={{ color: '#22d3ee' }}>{msg.echo}</span>
								<span style={{ color: '#a1a1aa', marginLeft: '0.5rem' }}>
									({new Date(msg.timestamp).toLocaleTimeString()})
								</span>
							</div>
						))
					)}
				</div>
			</div>

			{/* EventStream Section */}
			<div
				style={{
					padding: '1.5rem',
					background: '#000',
					borderRadius: '0.5rem',
					border: '1px solid #18181b',
				}}
			>
				<h2 style={{ marginTop: 0 }}>Server-Sent Events</h2>
				<div
					data-testid="sse-status"
					style={{ marginBottom: '1rem', color: sseConnected ? '#00c951' : '#ef4444' }}
				>
					Status: {sseConnected ? 'Connected' : 'Disconnected'}
				</div>

				<div
					data-testid="sse-data"
					style={{
						background: '#09090b',
						border: '1px solid #2b2b30',
						borderRadius: '0.375rem',
						padding: '1rem',
					}}
				>
					{sseData ? (
						<div style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
							<span style={{ color: '#22d3ee' }}>{sseData.event}</span>
							<span style={{ color: '#a1a1aa', marginLeft: '0.5rem' }}>
								Count: {sseData.count}
							</span>
						</div>
					) : (
						<div style={{ color: '#a1a1aa' }}>Waiting for events...</div>
					)}
				</div>
			</div>
		</div>
	);
}
