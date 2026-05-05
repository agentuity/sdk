import { NextResponse } from 'next/server';
import { KeyValueClient } from '@agentuity/keyvalue';

const kv = new KeyValueClient();
const NAMESPACE = 'preferences';
const KEY = 'translate';

interface Preferences {
	language?: string;
	model?: string;
}

export async function GET() {
	const result = await kv.get<Preferences>(NAMESPACE, KEY);
	return NextResponse.json(result.exists ? result.data : {});
}

export async function POST(request: Request) {
	const body = (await request.json()) as Preferences;
	await kv.set(NAMESPACE, KEY, body);
	return NextResponse.json({ ok: true });
}
