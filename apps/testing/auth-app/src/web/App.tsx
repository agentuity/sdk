import React, { useEffect, useState } from 'react';
import {
	AgentuityProvider,
	useWebsocket,
	useAgentWebsocket,
	useAgent,
	useAgentEventStream,
} from '@agentuity/react';

export function App() {
	const [count, setCount] = useState(0);
	// const {
	// 	connected,
	// 	send: wsSend,
	// 	setHandler,
	// 	data: wsMessage,
	// } = useWebsocket<string, string>('/agent/websocket');
	const { connected, send: wsSend, data: wsMessage } = useAgentWebsocket('websocket');
	const {
		connected: sseConnected,
		data: sseMessage,
		error: sseError,
	} = useAgentEventStream('sse');
	const { run, data: agentResult } = useAgent('simple');

	useEffect(() => {
		const interval = setInterval(() => {
			wsSend(`Hello at ${new Date().toISOString()}`);
		}, 1_000);
		return () => clearInterval(interval);
	}, []);

	return (
		<div style={{ fontFamily: 'sans-serif', padding: '2rem' }}>
			<AgentuityProvider>
				<h1>Hello from Agentuity v1 prototype</h1>
				<div style={{ marginBottom: '1rem' }}>
					<p>Count: {count}</p>
					<button onClick={() => setCount((c) => c + 1)}>Increment</button>
				</div>
				<div style={{ marginBottom: '1rem' }}>
					<div>{agentResult}</div>
					<button onClick={() => run({ age: 30, name: 'Jeff' })}>Call Agent</button>
				</div>
				<div style={{ marginBottom: '1rem' }} id="websocket">
					<strong>WebSocket:</strong>{' '}
					{connected ? JSON.stringify(wsMessage) : <>Not connected</>}
				</div>
				<div style={{ marginBottom: '1rem' }} id="sse">
					<strong>SSE (EventStream):</strong>{' '}
					{sseConnected ? (
						sseError ? (
							<span style={{ color: 'red' }}>Error: {sseError.message}</span>
						) : (
							<span>{sseMessage ?? ''}</span>
						)
					) : (
						<>Not connected</>
					)}
				</div>
				{/* <script async src="/public/websocket.js" /> */}
				{/* <script async src="/public/sse.js" /> */}
			</AgentuityProvider>
		</div>
	);
}
