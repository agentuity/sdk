import React, { useState } from 'react';
import { AgentuityProvider, useAgent } from '@agentuity/react';

export function App() {
	const [count, setCount] = useState(0);
	const { run, data: agentResult } = useAgent('simple');

	return (
		<div style={{ fontFamily: 'sans-serif', padding: '2rem' }}>
			<AgentuityProvider>
				<h1>Hello from Agentuity v1 prototype</h1>
				<div style={{ marginBottom: '1rem' }}>
					<p>Count: {count}</p>
					<button onClick={() => setCount((c) => c + 1)}>Increment</button>
				</div>
				<div style={{ marginBottom: '1rem' }}>
					<div>{agentResult ?? ''}</div>
					<button onClick={() => run({ age: 30, name: 'Jeff' })}>Call Agent</button>
				</div>
				{/* <script async src="/public/websocket.js" /> */}
				{/* <script async src="/public/sse.js" /> */}
			</AgentuityProvider>
		</div>
	);
}
