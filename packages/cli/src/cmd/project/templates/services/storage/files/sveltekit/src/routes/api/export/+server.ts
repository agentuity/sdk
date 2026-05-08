import { json } from '@sveltejs/kit';
import { desc } from 'drizzle-orm';
import { getDb, translations } from '$lib/server/db';
import { getS3 } from '$lib/server/storage';

export const POST = async () => {
	const db = getDb();
	const rows = await db
		.select()
		.from(translations)
		.orderBy(desc(translations.createdAt));
	const body = JSON.stringify(rows, null, 2);
	const filename = `translations-${Date.now()}.json`;
	await getS3().write(filename, body, { type: 'application/json' });
	return json({ filename, size: body.length });
};
