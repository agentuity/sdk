if (url.pathname === '/api/jobs' && request.method === 'POST') {
	const payload = await request.json();
	const { id } = await jobQueue.publish(JOBS_QUEUE, payload);
	return Response.json({ id });
}
