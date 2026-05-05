if (url.pathname === '/api/similar' && request.method === 'GET') {
	const q = url.searchParams.get('q');
	if (!q) return Response.json([]);
	const results = await similarVector.search(SIMILAR_NAMESPACE, { query: q, limit: 5 });
	return Response.json(results);
}
