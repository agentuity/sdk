import { KeyValueClient } from '@agentuity/keyvalue';

const kv = new KeyValueClient();

export default defineEventHandler(async (event) => {
	const body = await readBody<{ language?: string; model?: string }>(event);
	await kv.set('preferences', 'translate', body);
	return { ok: true };
});
