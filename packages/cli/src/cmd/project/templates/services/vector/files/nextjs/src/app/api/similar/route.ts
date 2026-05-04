import { NextResponse } from 'next/server';
import { VectorClient } from '@agentuity/vector';

const vector = new VectorClient();
const NAMESPACE = 'translations';

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const q = searchParams.get('q');
	if (!q) return NextResponse.json([]);
	const results = await vector.search(NAMESPACE, { query: q, limit: 5 });
	return NextResponse.json(results);
}
