import { data } from 'react-router';
import { VectorClient } from '@agentuity/vector';
import type { Route } from './+types/api.similar';

const vector = new VectorClient();
const NAMESPACE = 'translations';

export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url);
	const q = url.searchParams.get('q');
	if (!q) return data([]);
	const results = await vector.search(NAMESPACE, { query: q, limit: 5 });
	return data(results);
}
