import { desc } from 'drizzle-orm';
import { db, translations } from '../db';

export default defineEventHandler(async () => {
	return db
		.select()
		.from(translations)
		.orderBy(desc(translations.createdAt))
		.limit(10);
});
