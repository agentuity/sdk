console.log('inside websocket.js');

const ws = new WebSocket('ws://localhost:3000/agent/websocket');
ws.onmessage = (event) => {
	const el = document.getElementById('websocket');
	if (el) {
		el.innerText = `WebSocket message: ${event.data}`;
	}
};

setInterval(() => {
	ws.send(new Date().toISOString());
}, 1_000);
