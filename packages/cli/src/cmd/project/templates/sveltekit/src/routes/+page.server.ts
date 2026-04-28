import { KeyValueClient } from '@agentuity/keyvalue';
import OpenAI from 'openai';
import type { Cookies } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

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

function getSessionId(cookies: Cookies): string {
	const sessionId = cookies.get(SESSION_COOKIE) ?? createSessionId();

	cookies.set(SESSION_COOKIE, sessionId, {
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

export const load: PageServerLoad = async ({ cookies }) => {
	const sessionId = getSessionId(cookies);
	const history = await readHistory(sessionId);

	return {
		history: history.history,
		sessionId,
		translationCount: history.translationCount,
	};
};

export const actions: Actions = {
	default: async ({ cookies, request }) => {
		const formData = await request.formData();
		const text = formData.get('text') as string;
		const toLanguage = formData.get('toLanguage') as string;
		const model = (formData.get('model') as string) || 'gpt-5.4-nano';
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

		return {
			history: history.history,
			sessionId,
			translation,
			translationCount: history.translationCount,
			tokens,
			model,
			toLanguage,
		};
	},
	clear: async ({ cookies }) => {
		const sessionId = getSessionId(cookies);
		await kv.delete(HISTORY_NAMESPACE, sessionId);

		return {
			history: [],
			sessionId,
			translationCount: 0,
		};
	},
};
