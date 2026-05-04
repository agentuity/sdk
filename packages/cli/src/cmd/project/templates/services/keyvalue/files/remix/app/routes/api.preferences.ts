import { data } from 'react-router';
import { KeyValueClient } from '@agentuity/keyvalue';
import type { Route } from './+types/api.preferences';

const kv = new KeyValueClient();
const NAMESPACE = 'preferences';
const KEY = 'translate';

interface Preferences {
	language?: string;
	model?: string;
}

export async function loader() {
	const result = await kv.get<Preferences>(NAMESPACE, KEY);
	return data(result.exists ? result.data : {});
}

export async function action({ request }: Route.ActionArgs) {
	const body = (await request.json()) as Preferences;
	await kv.set(NAMESPACE, KEY, body);
	return data({ ok: true });
}
