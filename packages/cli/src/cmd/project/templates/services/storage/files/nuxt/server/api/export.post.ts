import { desc } from 'drizzle-orm';
import { db, translations } from '../db';
import { getS3 } from '../storage';

export default defineEventHandler(async () => {
	const rows = await db
		.select()
		.from(translations)
		.orderBy(desc(translations.createdAt));
	const body = JSON.stringify(rows, null, 2);
	const filename = `translations-${Date.now()}.json`;
	await getS3().write(filename, body, { type: 'application/json' });
	return { filename, size: body.length };
});
