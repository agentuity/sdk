import type { APIRoute } from 'astro';
import { VectorClient } from '@agentuity/vector';

const vector = new VectorClient();
const NAMESPACE = 'translations';

export const GET: APIRoute = async ({ url }) => {
	const q = url.searchParams.get('q');
	if (!q) {
		return new Response(JSON.stringify([]), {
			headers: { 'Content-Type': 'application/json' },
		});
	}
	const results = await vector.search(NAMESPACE, { query: q, limit: 5 });
	return new Response(JSON.stringify(results), {
		headers: { 'Content-Type': 'application/json' },
	});
};
