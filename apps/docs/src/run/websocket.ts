/**
 * Standalone run script for WebSocket demo
 *
 * Route pattern demo - demonstrates real-time bidirectional communication.
 * See src/run/README.md for architecture details.
 *
 * Demonstrates: WebSocket server + client using Bun.serve()
 * In a real app, the websocket() middleware handles the upgrade automatically.
 *
 * Usage: bun run src/run/websocket.ts
 */

try {
	const messages: string[] = [];

	// Start a WebSocket echo server on a random port
	const server = Bun.serve({
		port: 0,
		fetch(req, server) {
			if (server.upgrade(req)) return;
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

	const port = server.port;
	messages.push(`[Setup] WebSocket server started on port ${port}`);

	// Connect a WebSocket client
	const ws = new WebSocket(`ws://localhost:${port}`);
	const clientMessages: string[] = [];

	await new Promise<void>((resolve, reject) => {
		const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);

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

	ws.onmessage = (event) => {
		try {
			const data = JSON.parse(event.data);
			clientMessages.push(data.message);
		} catch {
			clientMessages.push(event.data);
		}
	};

	// Wait for the system message
	await new Promise((resolve) => setTimeout(resolve, 100));

	// Exchange 3 messages
	const testMessages = ['Hello, WebSocket!', 'How are you?', 'Goodbye!'];
	for (const msg of testMessages) {
		messages.push(`[Client] Sending: "${msg}"`);
		ws.send(msg);
		await new Promise((resolve) => setTimeout(resolve, 100));
	}

	// Close
	ws.close();
	await new Promise((resolve) => setTimeout(resolve, 100));
	server.stop();

	// Output
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
	console.log('Note: In a real app, the websocket() middleware handles the');
	console.log('upgrade automatically. You just define onOpen/onMessage/onClose.');
} catch (error) {
	console.log('---OUTPUT---');
	console.log(`Error: ${error instanceof Error ? error.message : String(error)}`);
}
