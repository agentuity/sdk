import { json } from '@sveltejs/kit';
import { desc } from 'drizzle-orm';
import { getDb, translations } from '$lib/server/db';

export const GET = async () => {
	const db = getDb();
	const rows = await db
		.select()
		.from(translations)
		.orderBy(desc(translations.createdAt))
		.limit(10);
	return json(rows);
};
