import type { APIRoute } from 'astro';
import { desc } from 'drizzle-orm';
import { db, translations } from '../../db';

export const GET: APIRoute = async () => {
	const rows = await db
		.select()
		.from(translations)
		.orderBy(desc(translations.createdAt))
		.limit(10);
	return new Response(JSON.stringify(rows), {
		headers: { 'Content-Type': 'application/json' },
	});
};
