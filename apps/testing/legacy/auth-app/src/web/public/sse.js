const evtSource = new EventSource('http://localhost:3500/agent/sse');

evtSource.onmessage = (event) => {
	const el = document.getElementById('sse');
	if (el) {
		el.innerText = `SSE message: ${event.data}`;
	}
};
