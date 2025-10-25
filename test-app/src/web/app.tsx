import React from 'react';
import { useEffect, useState } from 'react';
import { AgentuityProvider, useAgentWebsocket, useAgent } from '@agentuity/react';

export function App() {
	const [count, setCount] = useState(0);
	// const { connected, send, setHandler } = useWebsocket<string,string>("/agent/websocket");
	const { connected, send: wsSend, data: wsMessage } = useAgentWebsocket('websocket');
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
					{connected ? JSON.stringify(wsMessage) : <>WebSocket not connected</>}
				</div>
				<div style={{ marginBottom: '1rem' }} id="sse">
					loading ...
				</div>
				{/* <script async src="/public/websocket.js" /> */}
				<script async src="/public/sse.js" />
			</AgentuityProvider>
		</div>
	);
}
