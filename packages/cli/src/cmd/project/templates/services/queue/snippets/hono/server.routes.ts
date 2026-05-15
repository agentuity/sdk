// Jobs
app.post('/api/jobs', async (c) => {
	const payload = await c.req.json();
	await jobQueue.createQueue(JOBS_QUEUE, { description: JOBS_QUEUE_DESCRIPTION });
	const job = await jobQueue.publish(JOBS_QUEUE, payload, {
		metadata: { kind: 'translation' },
	});
	return c.json(job);
});
