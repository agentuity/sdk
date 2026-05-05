import { json } from '@sveltejs/kit';
import { desc } from 'drizzle-orm';
import { db, translations } from '$lib/server/db';
import { s3 } from '$lib/server/storage';

export const POST = async () => {
	const rows = await db
		.select()
		.from(translations)
		.orderBy(desc(translations.createdAt));
	const body = JSON.stringify(rows, null, 2);
	const filename = `translations-${Date.now()}.json`;
	const file = s3.file(filename);
	await file.write(body, { type: 'application/json' });
	return json({ filename, size: body.length });
};
