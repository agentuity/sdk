// Preferences
app.get('/api/preferences', async (c) => {
	const result = await kv.get<{ language?: string; model?: string }>(
		PREFS_NAMESPACE,
		PREFS_KEY
	);
	return c.json(result.exists ? result.data : {});
});

app.post('/api/preferences', async (c) => {
	const body = await c.req.json();
	await kv.set(PREFS_NAMESPACE, PREFS_KEY, body);
	return c.json({ ok: true });
});
