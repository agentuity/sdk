if (url.pathname === '/api/export' && request.method === 'POST') {
	const rows = await db
		.select()
		.from(translations)
		.orderBy(desc(translations.createdAt));
	const body = JSON.stringify(rows, null, 2);
	const filename = `translations-${Date.now()}.json`;
	const file = s3.file(filename);
	await file.write(body, { type: 'application/json' });
	return Response.json({ filename, size: body.length });
}
