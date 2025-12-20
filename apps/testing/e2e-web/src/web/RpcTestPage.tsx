import { type ChangeEvent, useState } from 'react';
import { createAPIClient } from '@agentuity/react';

const api = createAPIClient();

export function RpcTestPage() {
	const [name, setName] = useState('RPC');
	const [apiResult, setApiResult] = useState<string>('');
	const [wsMessages, setWsMessages] = useState<string[]>([]);
	const [sseEvents, setSseEvents] = useState<string[]>([]);
	const [error, setError] = useState<string | null>(null);

	const testAPI = async () => {
		try {
			const result = await api.hello.post({ name });
			setApiResult(result);
		} catch (err) {
			setError(`API Error: ${err instanceof Error ? err.message : String(err)}`);
		}
	};

	const testWebSocket = () => {
		try {
			setWsMessages([]);
			setError(null);

			const ws = api.echo.websocket();

			ws.on('open', () => {
				setWsMessages((prev) => [...prev, 'Connected']);
				ws.send({ message: `Hello from ${name}` });
			});

			ws.on('message', (data: unknown) => {
				setWsMessages((prev) => [...prev, `Received: ${JSON.stringify(data)}`]);
			});

			ws.on('error', () => {
				setWsMessages((prev) => [...prev, 'Error occurred']);
			});

			ws.on('close', () => {
				setWsMessages((prev) => [...prev, 'Disconnected']);
			});
		} catch (err) {
			setError(`WebSocket Error: ${err instanceof Error ? err.message : String(err)}`);
		}
	};

	const testSSE = () => {
		try {
			setSseEvents([]);
			const es = api.events.eventstream();

			es.on('message', (event: MessageEvent) => {
				setSseEvents((prev) => [...prev, event.data]);
			});

			es.on('error', () => {
				setError('SSE error');
			});
		} catch (err) {
			setError(`SSE Error: ${err instanceof Error ? err.message : String(err)}`);
		}
	};

	return (
		<div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
			<h1>RPC Client Test Page</h1>
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
				<h2>1. API (.run)</h2>
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
				<h2>2. WebSocket (.websocket)</h2>
				<button
					onClick={testWebSocket}
					data-testid="ws-button"
					style={{ padding: '0.5rem 1rem' }}
				>
					Test WebSocket
				</button>
				<div data-testid="ws-messages" style={{ marginTop: '1rem', fontFamily: 'monospace' }}>
					{wsMessages.map((msg, i) => (
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
				<h2>3. Server-Sent Events (.eventstream)</h2>
				<button onClick={testSSE} data-testid="sse-button" style={{ padding: '0.5rem 1rem' }}>
					Test SSE
				</button>
				<div data-testid="sse-events" style={{ marginTop: '1rem', fontFamily: 'monospace' }}>
					{sseEvents.map((event, i) => (
						<div key={i}>{event}</div>
					))}
				</div>
			</div>
		</div>
	);
}
