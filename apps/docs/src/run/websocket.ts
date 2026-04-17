/**
 * Standalone run script for WebSocket demo
 *
 * Protocol simulation for the WebSocket Explorer demo
 *
 * Usage: bun run src/run/websocket.ts '{}'
 */

try {
	const messages: string[] = [];

	const server = Bun.serve({
		port: 0,
		fetch(req, server) {
			if (server.upgrade(req)) {
				return;
			}
			return new Response('WebSocket server running');
		},
		websocket: {
			open(ws) {
				messages.push('[Server] Client connected');
				ws.send(JSON.stringify({ type: 'system', message: 'Connected to WebSocket server' }));
			},
			message(ws, msg) {
				const text = typeof msg === 'string' ? msg : new TextDecoder().decode(msg);
				messages.push(`[Server] Received: "${text}"`);
				const timestamp = new Date().toLocaleTimeString();
				const response = JSON.stringify({
					type: 'echo',
					message: `[${timestamp}] Echo: ${text}`,
					original: text,
				});
				ws.send(response);
				messages.push(`[Server] Sent echo: "[${timestamp}] Echo: ${text}"`);
			},
			close() {
				messages.push('[Server] Client disconnected');
			},
		},
	});

	const clientMessages: string[] = [];
	const ws = new WebSocket(`ws://localhost:${server.port}`);

	ws.onmessage = (event) => {
		const raw = event.data;
		if (typeof raw !== 'string') {
			clientMessages.push(String(raw));
			return;
		}

		try {
			const data: unknown = JSON.parse(raw);
			const message =
				typeof data === 'object' &&
				data !== null &&
				'message' in data &&
				typeof data.message === 'string'
					? data.message
					: raw;
			clientMessages.push(message);
		} catch {
			clientMessages.push(raw);
		}
	};

	await new Promise<void>((resolve, reject) => {
		const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5_000);

		ws.onopen = () => {
			clearTimeout(timeout);
			messages.push('[Client] Connected to server');
			resolve();
		};

		ws.onerror = () => {
			clearTimeout(timeout);
			reject(new Error('WebSocket connection failed'));
		};
	});

	await Bun.sleep(100);

	for (const msg of ['Hello, WebSocket!', 'How are you?', 'Goodbye!']) {
		messages.push(`[Client] Sending: "${msg}"`);
		ws.send(msg);
		await Bun.sleep(100);
	}

	ws.close();
	await Bun.sleep(100);
	server.stop();

	console.log('---OUTPUT---');
	console.log('WebSocket Echo Demo');
	console.log('===================');
	console.log('');
	for (const msg of messages) {
		console.log(msg);
	}
	console.log('');
	console.log(`Client received ${clientMessages.length} messages:`);
	for (const msg of clientMessages) {
		console.log(`  ${msg}`);
	}
	console.log('');
	console.log('This simulates the protocol flow behind websocket() route handlers');
	console.log('---OUTPUT---');
} catch (error) {
	console.log('---OUTPUT---');
	console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
	console.log('---OUTPUT---');
}
