let history = $state<Translation[]>([]);

async function loadHistory() {
	try {
		const res = await fetch('/api/history');
		if (res.ok) history = await res.json();
	} catch {}
}
