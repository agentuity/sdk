import type { APIRoute } from 'astro';
import { translate } from '../../lib/translate';

export const POST: APIRoute = async ({ request }) => {
	const { text, toLanguage, model = 'gpt-4o-mini' } = await request.json();
	const result = await translate({ text, toLanguage, model });
	return new Response(JSON.stringify(result), {
		headers: { 'Content-Type': 'application/json' },
	});
};
