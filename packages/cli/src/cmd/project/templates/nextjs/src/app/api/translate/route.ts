import { NextResponse } from 'next/server';
import { translate } from '@/lib/translate';

export async function POST(request: Request) {
	const { text, toLanguage, model = 'gpt-4o-mini' } = await request.json();
	const result = await translate({ text, toLanguage, model });
	return NextResponse.json(result);
}
