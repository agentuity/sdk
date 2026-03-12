import { type ChangeEvent, useState } from 'react';
import { hc } from 'hono/client';
import type { AppRouter } from '../api/router';

export function RpcTestPage() {
	const client = hc<AppRouter>(`${window.location.origin}/api`);
	const [name, setName] = useState('RPC');
	const [apiResult, setApiResult] = useState<string>('');
	const [wsMessages, setWsMessages] = useState<string[]>([]);
	const [sseEvents, setSseEvents] = useState<string[]>([]);
	const [error, setError] = useState<string | null>(null);

	const testAPI = async () => {
		try {
			const res = await client.hello.$post({ json: { name } });
			const result = await res.text();
			setApiResult(result);
		} catch (err) {
			setError(`API Error: ${err instanceof Error ? err.message : String(err)}`);
		}
	};

	const testWebSocket = () => {
		try {
			setWsMessages([]);
			setError(null);

			const ws = client.echo.$ws();

			ws.addEventListener('open', () => {
				setWsMessages((prev) => [...prev, 'Connected']);
				ws.send(JSON.stringify({ message: `Hello from ${name}` }));
			});

			ws.addEventListener('message', (event: MessageEvent) => {
				setWsMessages((prev) => [...prev, `Received: ${event.data}`]);
			});

			ws.addEventListener('error', () => {
				setWsMessages((prev) => [...prev, 'Error occurred']);
			});

			ws.addEventListener('close', () => {
				setWsMessages((prev) => [...prev, 'Disconnected']);
			});
		} catch (err) {
			setError(`WebSocket Error: ${err instanceof Error ? err.message : String(err)}`);
		}
	};

	const testSSE = () => {
		try {
			setSseEvents([]);

			// SSE uses native EventSource — Hono doesn't have a typed SSE client
			const baseUrl = window.location.origin;
			const es = new EventSource(`${baseUrl}/api/events`);

			es.addEventListener('message', (event: MessageEvent) => {
				setSseEvents((prev) => [...prev, event.data]);
			});

			es.addEventListener('error', () => {
				setError('SSE error');
				es.close();
			});
		} catch (err) {
			setError(`SSE Error: ${err instanceof Error ? err.message : String(err)}`);
		}
	};

	return (
		<div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
			<h1>Hono Client Test Page</h1>
			<a href="/">← Back to Home</a>

			{error && (
				<div
					style={{
						background: '#fca5a5',
						color: '#7f1d1d',
						padding: '1rem',
						margin: '1rem 0',
						borderRadius: '0.25rem',
					}}
				>
					{error}
				</div>
			)}

			<div style={{ marginTop: '2rem' }}>
				<input
					type="text"
					value={name}
					onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
					style={{ padding: '0.5rem', marginRight: '1rem' }}
					data-testid="name-input"
				/>
			</div>

			{/* API Test */}
			<div
				style={{
					marginTop: '2rem',
					padding: '1rem',
					border: '1px solid #ccc',
					borderRadius: '0.5rem',
				}}
			>
				<h2>1. API (hc client.$post)</h2>
				<button onClick={testAPI} data-testid="api-button" style={{ padding: '0.5rem 1rem' }}>
					Test API
				</button>
				<div data-testid="api-result" style={{ marginTop: '1rem', fontFamily: 'monospace' }}>
					{apiResult || 'No result yet'}
				</div>
			</div>

			{/* WebSocket Test */}
			<div
				style={{
					marginTop: '2rem',
					padding: '1rem',
					border: '1px solid #ccc',
					borderRadius: '0.5rem',
				}}
			>
				<h2>2. WebSocket (hc client.$ws)</h2>
				<button
					onClick={testWebSocket}
					data-testid="ws-button"
					style={{ padding: '0.5rem 1rem' }}
				>
					Test WebSocket
				</button>
				<div data-testid="ws-messages" style={{ marginTop: '1rem', fontFamily: 'monospace' }}>
					{wsMessages.map((msg, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: messages are append-only with no stable id
						<div key={i}>{msg}</div>
					))}
				</div>
			</div>

			{/* SSE Test */}
			<div
				style={{
					marginTop: '2rem',
					padding: '1rem',
					border: '1px solid #ccc',
					borderRadius: '0.5rem',
				}}
			>
				<h2>3. Server-Sent Events (native EventSource)</h2>
				<button onClick={testSSE} data-testid="sse-button" style={{ padding: '0.5rem 1rem' }}>
					Test SSE
				</button>
				<div data-testid="sse-events" style={{ marginTop: '1rem', fontFamily: 'monospace' }}>
					{sseEvents.map((event, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: events are append-only with no stable id
						<div key={i}>{event}</div>
					))}
				</div>
			</div>
		</div>
	);
}
