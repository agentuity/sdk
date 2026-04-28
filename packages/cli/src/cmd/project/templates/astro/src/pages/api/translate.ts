import { KeyValueClient } from '@agentuity/keyvalue';
import type { APIContext, APIRoute } from 'astro';
import OpenAI from 'openai';

const HISTORY_NAMESPACE = 'translation-history';
const HISTORY_LIMIT = 5;
const SESSION_COOKIE = 'agentuity_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

interface HistoryEntry {
	readonly model: string;
	readonly sessionId: string;
	readonly text: string;
	readonly timestamp: string;
	readonly tokens: number;
	readonly toLanguage: string;
	readonly translation: string;
}

interface HistoryState {
	readonly history: readonly HistoryEntry[];
	readonly translationCount: number;
}

const kv = new KeyValueClient();

function createSessionId(): string {
	return `sess_${crypto.randomUUID().replaceAll('-', '').slice(0, 24)}`;
}

function truncate(value: string, length: number): string {
	return value.length > length ? `${value.slice(0, length)}...` : value;
}

function getSessionId(cookies: APIContext['cookies']): string {
	const sessionId = cookies.get(SESSION_COOKIE)?.value ?? createSessionId();

	cookies.set(SESSION_COOKIE, sessionId, {
		httpOnly: true,
		maxAge: SESSION_TTL_SECONDS,
		path: '/',
		sameSite: 'lax',
		secure: import.meta.env.PROD,
	});

	return sessionId;
}

function json(data: unknown): Response {
	return new Response(JSON.stringify(data), {
		headers: { 'Content-Type': 'application/json' },
	});
}

async function readHistory(sessionId: string): Promise<HistoryState> {
	const result = await kv.get<HistoryState>(HISTORY_NAMESPACE, sessionId);
	return result.exists ? result.data : { history: [], translationCount: 0 };
}

async function saveHistory(sessionId: string, entry: HistoryEntry): Promise<HistoryState> {
	const previous = await readHistory(sessionId);
	const history = [...previous.history, entry].slice(-HISTORY_LIMIT);
	const next = {
		history,
		translationCount: previous.translationCount + 1,
	};

	await kv.set(HISTORY_NAMESPACE, sessionId, next, { ttl: SESSION_TTL_SECONDS });

	return next;
}

export const GET: APIRoute = async ({ cookies }) => {
	const sessionId = getSessionId(cookies);
	const history = await readHistory(sessionId);

	return json({
		history: history.history,
		sessionId,
		translationCount: history.translationCount,
	});
};

export const DELETE: APIRoute = async ({ cookies }) => {
	const sessionId = getSessionId(cookies);
	await kv.delete(HISTORY_NAMESPACE, sessionId);

	return json({
		history: [],
		sessionId,
		translationCount: 0,
	});
};

export const POST: APIRoute = async ({ cookies, request }) => {
	const { text, toLanguage, model = 'gpt-5.4-nano' } = await request.json();
	const prompt = `Translate to ${toLanguage}:\n\n${text}`;
	const openai = new OpenAI();
	const sessionId = getSessionId(cookies);

	const completion = await openai.chat.completions.create({
		model,
		messages: [{ role: 'user', content: prompt }],
	});
	const translation = completion.choices[0]?.message?.content ?? '';
	const tokens = completion.usage?.total_tokens ?? 0;
	const history = await saveHistory(sessionId, {
		model,
		sessionId,
		text: truncate(text, 50),
		timestamp: new Date().toISOString(),
		tokens,
		toLanguage,
		translation: truncate(translation, 50),
	});

	return json({
		history: history.history,
		sessionId,
		translation,
		translationCount: history.translationCount,
		tokens,
		model,
		toLanguage,
	});
};
