import type { APIRoute } from 'astro';
import { KeyValueClient } from '@agentuity/keyvalue';

const kv = new KeyValueClient();
const NAMESPACE = 'preferences';
const KEY = 'translate';

export const GET: APIRoute = async () => {
	const result = await kv.get<{ language?: string; model?: string }>(NAMESPACE, KEY);
	return new Response(JSON.stringify(result.exists ? result.data : {}), {
		headers: { 'Content-Type': 'application/json' },
	});
};

export const POST: APIRoute = async ({ request }) => {
	const body = (await request.json()) as { language?: string; model?: string };
	await kv.set(NAMESPACE, KEY, body);
	return new Response(JSON.stringify({ ok: true }), {
		headers: { 'Content-Type': 'application/json' },
	});
};
