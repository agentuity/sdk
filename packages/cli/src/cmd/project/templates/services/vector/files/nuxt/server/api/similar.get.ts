import { VectorClient } from '@agentuity/vector';

const vector = new VectorClient();
const NAMESPACE = 'translations';

export default defineEventHandler(async (event) => {
	const q = getQuery(event).q as string | undefined;
	if (!q) return [];
	return vector.search(NAMESPACE, { query: q, limit: 5 });
});
