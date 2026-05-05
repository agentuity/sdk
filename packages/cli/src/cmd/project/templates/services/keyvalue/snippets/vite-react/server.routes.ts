if (url.pathname === '/api/preferences' && request.method === 'GET') {
	const result = await kv.get<{ language?: string; model?: string }>(
		PREFS_NAMESPACE,
		PREFS_KEY
	);
	return Response.json(result.exists ? result.data : {});
}

if (url.pathname === '/api/preferences' && request.method === 'POST') {
	const body = await request.json();
	await kv.set(PREFS_NAMESPACE, PREFS_KEY, body);
	return Response.json({ ok: true });
}
