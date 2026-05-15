// History route
app.get('/api/history', async (c) => {
	const db = getDb();
	const rows = await db
		.select()
		.from(translations)
		.orderBy(desc(translations.createdAt))
		.limit(10);
	return c.json(rows);
});
