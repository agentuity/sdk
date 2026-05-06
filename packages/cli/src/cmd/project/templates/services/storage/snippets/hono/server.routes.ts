// Export
app.post('/api/export', async (c) => {
	const rows = await db
		.select()
		.from(translations)
		.orderBy(desc(translations.createdAt));
	const body = JSON.stringify(rows, null, 2);
	const filename = `translations-${Date.now()}.json`;
	await getS3().write(filename, body, { type: 'application/json' });
	return c.json({ filename, size: body.length });
});
