// Jobs
app.post('/api/jobs', async (c) => {
	const payload = await c.req.json();
	const { id } = await jobQueue.publish(JOBS_QUEUE, payload);
	return c.json({ id });
});
