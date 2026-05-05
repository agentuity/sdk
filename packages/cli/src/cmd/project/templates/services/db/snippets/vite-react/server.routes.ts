if (url.pathname === '/api/history' && request.method === 'GET') {
	const rows = await db
		.select()
		.from(translations)
		.orderBy(desc(translations.createdAt))
		.limit(10);
	return Response.json(rows);
}
