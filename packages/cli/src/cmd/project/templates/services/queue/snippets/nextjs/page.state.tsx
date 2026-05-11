interface QueuedJob {
	id: string;
	text: string;
	toLanguage: string;
	model: string;
	offset: number;
	publishedAt: string;
}
const [jobs, setJobs] = useState<QueuedJob[]>([]);

const handleQueue = async () => {
	const res = await fetch('/api/jobs', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ text, toLanguage, model }),
	});
	if (!res.ok) return;
	const job = (await res.json()) as Pick<QueuedJob, 'id' | 'offset' | 'publishedAt'>;
	setJobs((prev) => [{ ...job, text, toLanguage, model }, ...prev]);
};
