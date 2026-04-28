import { KeyValueClient } from '@agentuity/keyvalue';
import OpenAI from 'openai';

const HISTORY_NAMESPACE = 'translation-history';
const HISTORY_LIMIT = 5;
const SESSION_COOKIE = 'agentuity_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);

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

function getSessionId(request: Request): string {
	const cookie = request.headers.get('cookie') ?? '';
	const match = cookie.match(new RegExp(`(?:^|; )${SESSION_COOKIE}=([^;]+)`));
	return match?.[1] ? decodeURIComponent(match[1]) : createSessionId();
}

function jsonWithSessionCookie(data: unknown, sessionId: string): Response {
	const cookieParts = [
		`${SESSION_COOKIE}=${encodeURIComponent(sessionId)}`,
		'HttpOnly',
		'Path=/',
		'SameSite=Lax',
		`Max-Age=${SESSION_TTL_SECONDS}`,
	];

	if (process.env.NODE_ENV === 'production') {
		cookieParts.push('Secure');
	}

	return Response.json(data, {
		headers: {
			'Set-Cookie': cookieParts.join('; '),
		},
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

Bun.serve({
	port: PORT,
	hostname: '0.0.0.0',
	async fetch(request) {
		const url = new URL(request.url);

		if (url.pathname === '/api/translate' && request.method === 'POST') {
			const { text, toLanguage, model = 'gpt-5.4-nano' } = await request.json();
			const prompt = `Translate to ${toLanguage}:\n\n${text}`;
			const openai = new OpenAI();
			const sessionId = getSessionId(request);

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

			return jsonWithSessionCookie({
				history: history.history,
				sessionId,
				translation,
				translationCount: history.translationCount,
				tokens,
				model,
				toLanguage,
			}, sessionId);
		}

		if (url.pathname === '/api/translate' && request.method === 'GET') {
			const sessionId = getSessionId(request);
			const history = await readHistory(sessionId);

			return jsonWithSessionCookie({
				history: history.history,
				sessionId,
				translationCount: history.translationCount,
			}, sessionId);
		}

		if (url.pathname === '/api/translate' && request.method === 'DELETE') {
			const sessionId = getSessionId(request);
			await kv.delete(HISTORY_NAMESPACE, sessionId);

			return jsonWithSessionCookie({
				history: [],
				sessionId,
				translationCount: 0,
			}, sessionId);
		}

		if (process.env.NODE_ENV === 'production') {
			const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
			const file = Bun.file(import.meta.dir + pathname);

			if (await file.exists()) {
				return new Response(file);
			}

			return new Response(Bun.file(import.meta.dir + '/index.html'));
		}

		const viteUrl = 'http://localhost:5173' + url.pathname + url.search;
		const viteRes = await fetch(viteUrl, {
			method: request.method,
			headers: request.headers,
			body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
		});
		return new Response(viteRes.body, {
			status: viteRes.status,
			headers: viteRes.headers,
		});
	},
});

console.log('Server running on http://localhost:' + PORT);
