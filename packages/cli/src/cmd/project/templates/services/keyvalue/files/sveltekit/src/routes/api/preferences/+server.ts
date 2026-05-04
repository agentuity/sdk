import { json } from '@sveltejs/kit';
import { KeyValueClient } from '@agentuity/keyvalue';

const kv = new KeyValueClient();
const NAMESPACE = 'preferences';
const KEY = 'translate';

export const GET = async () => {
	const result = await kv.get<{ language?: string; model?: string }>(NAMESPACE, KEY);
	return json(result.exists ? result.data : {});
};

export const POST = async ({ request }: { request: Request }) => {
	const body = (await request.json()) as { language?: string; model?: string };
	await kv.set(NAMESPACE, KEY, body);
	return json({ ok: true });
};
