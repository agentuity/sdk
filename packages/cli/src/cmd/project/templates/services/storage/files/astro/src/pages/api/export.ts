import type { APIRoute } from 'astro';
import { desc } from 'drizzle-orm';
import { db, translations } from '../../db';
import { s3 } from '../../storage';

export const POST: APIRoute = async () => {
	const rows = await db
		.select()
		.from(translations)
		.orderBy(desc(translations.createdAt));
	const body = JSON.stringify(rows, null, 2);
	const filename = `translations-${Date.now()}.json`;
	const file = s3.file(filename);
	await file.write(body, { type: 'application/json' });
	return new Response(JSON.stringify({ filename, size: body.length }), {
		headers: { 'Content-Type': 'application/json' },
	});
};
