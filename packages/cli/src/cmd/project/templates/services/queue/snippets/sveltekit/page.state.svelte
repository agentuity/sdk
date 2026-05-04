interface QueuedJob {
	id: string;
	text: string;
	toLanguage: string;
	model: string;
	at: number;
}
let jobs = $state<QueuedJob[]>([]);

async function handleQueue() {
	const res = await fetch('/api/jobs', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ text, toLanguage, model }),
	});
	if (!res.ok) return;
	const { id } = (await res.json()) as { id: string };
	jobs = [{ id, text, toLanguage, model, at: Date.now() }, ...jobs];
}
