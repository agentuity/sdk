import { data } from 'react-router';
import { desc } from 'drizzle-orm';
import { db, translations } from '~/db';

export async function loader() {
	const rows = await db
		.select()
		.from(translations)
		.orderBy(desc(translations.createdAt))
		.limit(10);
	return data(rows);
}
