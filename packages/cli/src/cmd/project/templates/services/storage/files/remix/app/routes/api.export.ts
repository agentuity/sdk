import { data } from 'react-router';
import { desc } from 'drizzle-orm';
import { db, translations } from '~/db';
import { getS3 } from '~/storage';

export async function action() {
	const rows = await db
		.select()
		.from(translations)
		.orderBy(desc(translations.createdAt));
	const body = JSON.stringify(rows, null, 2);
	const filename = `translations-${Date.now()}.json`;
	await getS3().write(filename, body, { type: 'application/json' });
	return data({ filename, size: body.length });
}
