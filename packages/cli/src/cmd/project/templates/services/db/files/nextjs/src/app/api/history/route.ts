import { NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { db, translations } from '@/db';

export async function GET() {
	const rows = await db
		.select()
		.from(translations)
		.orderBy(desc(translations.createdAt))
		.limit(10);
	return NextResponse.json(rows);
}
