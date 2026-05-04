// Similar
app.get('/api/similar', async (c) => {
	const q = c.req.query('q');
	if (!q) return c.json([]);
	const results = await similarVector.search(SIMILAR_NAMESPACE, { query: q, limit: 5 });
	return c.json(results);
});
