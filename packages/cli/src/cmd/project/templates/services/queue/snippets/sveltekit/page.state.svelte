interface QueuedJob {
	id: string;
	text: string;
	toLanguage: string;
	model: string;
	offset: number;
	publishedAt: string;
}
let jobs = $state<QueuedJob[]>([]);

async function handleQueue() {
	const res = await fetch('/api/jobs', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ text, toLanguage, model }),
	});
	if (!res.ok) return;
	const job = (await res.json()) as Pick<QueuedJob, 'id' | 'offset' | 'publishedAt'>;
	jobs = [{ ...job, text, toLanguage, model }, ...jobs];
}
