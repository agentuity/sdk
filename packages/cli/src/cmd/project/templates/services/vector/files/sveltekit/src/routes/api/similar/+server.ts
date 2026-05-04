import { json } from '@sveltejs/kit';
import { VectorClient } from '@agentuity/vector';

const vector = new VectorClient();
const NAMESPACE = 'translations';

export const GET = async ({ url }: { url: URL }) => {
	const q = url.searchParams.get('q');
	if (!q) return json([]);
	const results = await vector.search(NAMESPACE, { query: q, limit: 5 });
	return json(results);
};
