import { KeyValueClient } from '@agentuity/keyvalue';
import { getCookie, setCookie } from 'hono/cookie';
import { Hono } from 'hono';
import type { Context } from 'hono';
import OpenAI from 'openai';

const HISTORY_NAMESPACE = 'translation-history';
const HISTORY_LIMIT = 5;
const SESSION_COOKIE = 'agentuity_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const DEFAULT_TEXT =
	'Welcome to Agentuity! This starter app translates text, stores recent requests in key-value storage, and shows how a typed framework route can call models through Agentuity’s AI Gateway. Try a few languages or switch models, then check the app session, model, and token details below.';

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

const app = new Hono();
const kv = new KeyValueClient();

function createSessionId(): string {
	return `sess_${crypto.randomUUID().replaceAll('-', '').slice(0, 24)}`;
}

function truncate(value: string, length: number): string {
	return value.length > length ? `${value.slice(0, length)}...` : value;
}

function getSessionId(c: Context): string {
	const sessionId = getCookie(c, SESSION_COOKIE) ?? createSessionId();

	setCookie(c, SESSION_COOKIE, sessionId, {
		httpOnly: true,
		maxAge: SESSION_TTL_SECONDS,
		path: '/',
		sameSite: 'Lax',
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

app.get('/api/translate', async (c) => {
	const sessionId = getSessionId(c);
	const history = await readHistory(sessionId);

	return c.json({
		history: history.history,
		sessionId,
		translationCount: history.translationCount,
	});
});

app.delete('/api/translate', async (c) => {
	const sessionId = getSessionId(c);
	await kv.delete(HISTORY_NAMESPACE, sessionId);

	return c.json({
		history: [],
		sessionId,
		translationCount: 0,
	});
});

app.post('/api/translate', async (c) => {
	const { text, toLanguage, model = 'gpt-5.4-nano' } = await c.req.json();
	const prompt = `Translate to ${toLanguage}:\n\n${text}`;
	const openai = new OpenAI();
	const sessionId = getSessionId(c);

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

	return c.json({
		history: history.history,
		sessionId,
		translation,
		translationCount: history.translationCount,
		tokens,
		model,
		toLanguage,
	});
});

app.get('/', (c) => {
	return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>Agentuity + Hono</title>
	<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
	<style>
		body { background-color: oklch(0.141 0.005 285.823); margin: 0; font-family: system-ui, -apple-system, sans-serif; }
		[data-loading="true"]::after { content: '.'; display: inline-block; width: 1rem; animation: ellipsis 1.5s steps(4, end) infinite; text-align: left; }
		@keyframes ellipsis { 0% { content: '.'; } 25% { content: '..'; } 50% { content: '...'; } 75% { content: ''; } }
	</style>
</head>
<body>
	<div class="flex min-h-screen justify-center font-sans text-white">
		<div class="flex w-full max-w-3xl flex-col gap-4 p-16">
			<div class="relative mb-8 flex flex-col items-center justify-center gap-2 text-center">
				<svg aria-hidden="true" class="mb-4 h-auto w-12" fill="none" height="191" viewBox="0 0 220 191" width="220" xmlns="http://www.w3.org/2000/svg">
					<path clip-rule="evenodd" d="M220 191H0L31.427 136.5H0L8 122.5H180.5L220 191ZM47.5879 136.5L24.2339 177H195.766L172.412 136.5H47.5879Z" fill="var(--color-cyan-500)" fill-rule="evenodd" />
					<path clip-rule="evenodd" d="M110 0L157.448 82.5H189L197 96.5H54.5L110 0ZM78.7021 82.5L110 28.0811L141.298 82.5H78.7021Z" fill="var(--color-cyan-500)" fill-rule="evenodd" />
				</svg>
				<h1 class="text-5xl font-thin">Welcome to <a class="text-white transition-colors hover:text-cyan-400" href="https://agentuity.com" rel="noreferrer" target="_blank">Agentuity</a></h1>
				<p class="text-lg text-gray-400">The <span class="font-serif italic">Full-Stack</span> Platform for AI Agents</p>
			</div>
			<div class="flex flex-col gap-6 rounded-lg border border-gray-900 bg-black p-8 text-gray-400 shadow-2xl">
				<div class="flex flex-wrap items-center gap-1.5">
					Translate to
					<select id="toLanguage" class="-mb-0.5 cursor-pointer appearance-none border-0 border-b border-dashed border-gray-700 bg-transparent font-normal text-white outline-none hover:border-b-cyan-400 focus:border-b-cyan-400">
						<option value="Spanish">Spanish</option><option value="French">French</option><option value="German">German</option><option value="Chinese">Chinese</option>
					</select>
					using
					<select id="model" class="-mb-0.5 cursor-pointer appearance-none border-0 border-b border-dashed border-gray-700 bg-transparent font-normal text-white outline-none hover:border-b-cyan-400 focus:border-b-cyan-400">
						<option value="gpt-5.4-nano">GPT-5.4 Nano</option><option value="gpt-5.4-mini">GPT-5.4 Mini</option><option value="gpt-5.4">GPT-5.4</option>
					</select>
					<div class="group relative z-0 ml-auto">
						<div class="absolute inset-0 rounded-lg bg-linear-to-r from-cyan-700 via-blue-500 to-purple-600 opacity-75 blur-xl transition-all duration-700 group-hover:opacity-100 group-hover:blur-2xl"></div>
						<div class="absolute inset-0 rounded-lg bg-cyan-500/50 opacity-50 blur-3xl"></div>
						<button id="translate-btn" class="relative cursor-pointer rounded-lg bg-gray-950 px-4 py-2 font-semibold text-white shadow-2xl disabled:cursor-not-allowed disabled:opacity-50" type="button">Translate</button>
					</div>
				</div>
				<textarea id="text-input" class="z-10 min-h-28 resize-y rounded-md border border-gray-800 bg-gray-950 px-4 py-3 text-sm text-white focus:outline-2 focus:outline-offset-2 focus:outline-cyan-500" placeholder="Enter text to translate..." rows="4">${DEFAULT_TEXT}</textarea>
				<div id="result" class="output rounded-md border border-gray-800 bg-gray-950 px-4 py-3 text-sm text-gray-600">Translation will appear here</div>
			</div>
			<div class="flex flex-col gap-6 rounded-lg border border-gray-900 bg-black p-8">
				<div class="flex items-center justify-between">
					<h3 class="text-xl font-normal text-white">Recent translations</h3>
					<button id="clear-history" class="hidden rounded border border-gray-900 bg-transparent px-3 py-1.5 text-xs text-gray-500 transition-all duration-200 hover:border-gray-700 hover:bg-gray-900 hover:text-white" type="button">Clear</button>
				</div>
				<div id="history" class="rounded-md bg-gray-950"><div class="px-3 py-2 text-sm text-gray-600">History will appear here</div></div>
				<div id="history-meta" class="hidden gap-4 text-xs text-gray-500"></div>
			</div>
			<div class="rounded-lg border border-gray-900 bg-black p-8">
				<h3 class="m-0 mb-6 text-xl font-normal leading-none text-white">How it works</h3>
				<div class="flex flex-col gap-6">
					<div class="flex items-start gap-3"><div class="flex size-4 shrink-0 items-center justify-center rounded border border-green-500 bg-green-950"><svg aria-hidden="true" class="size-2.5" fill="none" height="24" stroke="var(--color-green-500)" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><path d="M20 6 9 17l-5-5" /></svg></div><div><h4 class="-mt-0.5 mb-0.5 text-sm font-normal text-white">Key-value history</h4><p class="text-xs text-gray-400"><code class="text-white">KeyValueClient</code> stores recent translations for this browser session.</p></div></div>
					<div class="flex items-start gap-3"><div class="flex size-4 shrink-0 items-center justify-center rounded border border-green-500 bg-green-950"><svg aria-hidden="true" class="size-2.5" fill="none" height="24" stroke="var(--color-green-500)" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><path d="M20 6 9 17l-5-5" /></svg></div><div><h4 class="-mt-0.5 mb-0.5 text-sm font-normal text-white">AI Gateway routing</h4><p class="text-xs text-gray-400"><code class="text-white">agentuity dev</code> automatically sets OPENAI_API_KEY and OPENAI_BASE_URL so the OpenAI SDK routes through Agentuity's AI Gateway.</p></div></div>
					<div class="flex items-start gap-3"><div class="flex size-4 shrink-0 items-center justify-center rounded border border-green-500 bg-green-950"><svg aria-hidden="true" class="size-2.5" fill="none" height="24" stroke="var(--color-green-500)" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><path d="M20 6 9 17l-5-5" /></svg></div><div><h4 class="-mt-0.5 mb-0.5 text-sm font-normal text-white">Hono routes</h4><p class="text-xs text-gray-400">Edit <code class="text-white">src/index.ts</code> to change the AI model, prompt, or add new routes.</p></div></div>
				</div>
			</div>
		</div>
	</div>
	<script>
		const btn = document.getElementById('translate-btn');
		const clearBtn = document.getElementById('clear-history');
		const historyDiv = document.getElementById('history');
		const historyMeta = document.getElementById('history-meta');
		const textInput = document.getElementById('text-input');
		const toLangSelect = document.getElementById('toLanguage');
		const modelSelect = document.getElementById('model');
		const resultDiv = document.getElementById('result');

		function renderHistory(data) {
			historyDiv.replaceChildren();

			if (data.history.length === 0) {
				const empty = document.createElement('div');
				empty.className = 'px-3 py-2 text-sm text-gray-600';
				empty.textContent = 'History will appear here';
				historyDiv.append(empty);
				clearBtn.classList.add('hidden');
			} else {
				for (const entry of [...data.history].reverse()) {
					const row = document.createElement('div');
					row.className = 'grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-3 rounded px-3 py-2 text-xs';
					row.innerHTML = '<span class="truncate text-gray-400"></span><span class="text-gray-700">→</span><span class="truncate text-gray-400"></span><span class="rounded border border-gray-800 bg-gray-900 px-1 py-0.5 text-gray-400"></span>';
					row.children[0].textContent = entry.text;
					row.children[2].textContent = entry.translation;
					row.children[3].textContent = entry.toLanguage;
					historyDiv.append(row);
				}
				clearBtn.classList.remove('hidden');
			}

			historyMeta.className = 'flex gap-4 text-xs text-gray-500';
			historyMeta.innerHTML = '<span>App session <strong class="text-gray-400"></strong></span><span>Translations <strong class="text-gray-400"></strong></span>';
			historyMeta.querySelectorAll('strong')[0].textContent = data.sessionId.slice(0, 12) + '...';
			historyMeta.querySelectorAll('strong')[1].textContent = String(data.translationCount);
		}

		function renderResult(data) {
			resultDiv.className = 'output rounded-md border border-gray-800 bg-gray-950 px-4 py-3 text-sm text-cyan-500';
			resultDiv.replaceChildren();
			resultDiv.append(data.translation);

			const meta = document.createElement('div');
			meta.className = 'flex gap-4 text-xs text-gray-500 mt-3';
			meta.innerHTML = (data.tokens > 0 ? '<span>Tokens <strong class="text-gray-400"></strong></span>' : '') + '<span>Model <strong class="text-gray-400"></strong></span><span>Language <strong class="text-gray-400"></strong></span><span>App session <strong class="text-gray-400"></strong></span>';
			const strong = meta.querySelectorAll('strong');
			let index = 0;
			if (data.tokens > 0) strong[index++].textContent = String(data.tokens);
			strong[index++].textContent = data.model;
			strong[index++].textContent = data.toLanguage;
			strong[index].textContent = data.sessionId.slice(0, 12) + '...';
			resultDiv.append(meta);
		}

		async function fetchHistory() {
			const res = await fetch('/api/translate');
			if (!res.ok) throw new Error('API error ' + res.status);
			renderHistory(await res.json());
		}

		btn.addEventListener('click', async () => {
			const text = textInput.value, toLanguage = toLangSelect.value, model = modelSelect.value;
			btn.textContent = 'Translating'; btn.disabled = true;
			resultDiv.textContent = ''; resultDiv.className = 'rounded-md border border-gray-800 bg-gray-950 px-4 py-3 text-sm text-gray-600';
			try {
				const res = await fetch('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, toLanguage, model }) });
				if (!res.ok) throw new Error('API error ' + res.status);
				const data = await res.json();
				renderResult(data);
				renderHistory(data);
			} catch (err) {
				resultDiv.className = 'rounded-md border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-400';
				resultDiv.textContent = err.message || 'Translation failed';
			}
			finally { btn.textContent = 'Translate'; btn.disabled = false; }
		});

		clearBtn.addEventListener('click', async () => {
			const res = await fetch('/api/translate', { method: 'DELETE' });
			if (!res.ok) throw new Error('API error ' + res.status);
			resultDiv.className = 'output rounded-md border border-gray-800 bg-gray-950 px-4 py-3 text-sm text-gray-600';
			resultDiv.textContent = 'Translation will appear here';
			renderHistory(await res.json());
		});

		void fetchHistory();
	</script>
</body>
</html>`);
});

export default app;
