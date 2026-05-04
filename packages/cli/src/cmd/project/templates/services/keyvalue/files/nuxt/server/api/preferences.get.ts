import { KeyValueClient } from '@agentuity/keyvalue';

const kv = new KeyValueClient();

export default defineEventHandler(async () => {
	const result = await kv.get<{ language?: string; model?: string }>(
		'preferences',
		'translate'
	);
	return result.exists ? result.data : {};
});
