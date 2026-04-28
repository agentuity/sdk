import { KeyValueClient } from '@agentuity/keyvalue';
import OpenAI from 'openai';
import type { H3Event } from 'h3';

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

function getSessionId(event: H3Event): string {
	const sessionId = getCookie(event, SESSION_COOKIE) ?? createSessionId();

	setCookie(event, SESSION_COOKIE, sessionId, {
		httpOnly: true,
		maxAge: SESSION_TTL_SECONDS,
		path: '/',
		sameSite: 'lax',
		secure: process.env.NODE_ENV === 'production',
	});

	return sessionId;
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

export default defineEventHandler(async (event) => {
	const sessionId = getSessionId(event);

	if (event.method === 'GET') {
		const history = await readHistory(sessionId);

		return {
			history: history.history,
			sessionId,
			translationCount: history.translationCount,
		};
	}

	if (event.method === 'DELETE') {
		await kv.delete(HISTORY_NAMESPACE, sessionId);

		return {
			history: [],
			sessionId,
			translationCount: 0,
		};
	}

	const { text, toLanguage, model = 'gpt-5.4-nano' } = await readBody(event);
	const prompt = `Translate to ${toLanguage}:\n\n${text}`;
	const openai = new OpenAI();

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

	return {
		history: history.history,
		sessionId,
		translation,
		translationCount: history.translationCount,
		tokens,
		model,
		toLanguage,
	};
});
