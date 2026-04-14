import { Hono } from 'hono';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

const app = new Hono();

// API route
app.post('/api/translate', async (c) => {
	const { text, toLanguage, model = 'gpt-4o-mini' } = await c.req.json();

	const { text: translation, usage } = await generateText({
		model: openai(model),
		prompt: `Translate the following text to ${toLanguage}. Return only the translation, nothing else.\n\n${text}`,
	});

	return c.json({
		translation,
		tokens: usage?.totalTokens ?? 0,
		model,
		toLanguage,
	});
});

// Landing page
app.get('/', (c) => {
	return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>Agentuity + Hono</title>
	<link href="https://cdn.jsdelivr.net/npm/tailwindcss@4/@tailwindcss/postcss@4/index.min.css" rel="stylesheet" />
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
				<h1 class="text-5xl font-thin">Welcome to Agentuity</h1>
				<p class="text-lg text-gray-400"><span class="font-serif italic">Hono</span> + AI Gateway</p>
			</div>
			<div class="flex flex-col gap-6 rounded-lg border border-gray-900 bg-black p-8 text-gray-400 shadow-2xl">
				<div class="flex flex-wrap items-center gap-1.5">
					Translate to
					<select id="toLanguage" class="-mb-0.5 cursor-pointer appearance-none border-0 border-b border-dashed border-gray-700 bg-transparent font-normal text-white outline-none hover:border-b-cyan-400 focus:border-b-cyan-400">
						<option value="Spanish">Spanish</option><option value="French">French</option><option value="German">German</option><option value="Chinese">Chinese</option>
					</select>
					using
					<select id="model" class="-mb-0.5 cursor-pointer appearance-none border-0 border-b border-dashed border-gray-700 bg-transparent font-normal text-white outline-none hover:border-b-cyan-400 focus:border-b-cyan-400">
						<option value="gpt-4o-mini">gpt-4o-mini</option><option value="gpt-4o">gpt-4o</option><option value="gpt-4.1-nano">gpt-4.1-nano</option>
					</select>
					<div class="group relative z-0 ml-auto">
						<div class="absolute inset-0 rounded-lg bg-linear-to-r from-cyan-700 via-blue-500 to-purple-600 opacity-75 blur-xl transition-all duration-700 group-hover:opacity-100 group-hover:blur-2xl" />
						<div class="absolute inset-0 rounded-lg bg-cyan-500/50 opacity-50 blur-3xl" />
						<button id="translate-btn" class="relative cursor-pointer rounded-lg bg-gray-950 px-4 py-2 font-semibold text-white shadow-2xl disabled:cursor-not-allowed disabled:opacity-50" type="button">Translate</button>
					</div>
				</div>
				<textarea id="text-input" class="z-10 min-h-28 resize-y rounded-md border border-gray-800 bg-gray-950 px-4 py-3 text-sm text-white focus:outline-2 focus:outline-offset-2 focus:outline-cyan-500" placeholder="Enter text to translate..." rows="4">Welcome to Agentuity! This translation demo shows what you can build with the platform. It connects to AI models through our gateway — no separate API keys needed. Try translating this text into different languages to see it in action.</textarea>
				<div id="result" class="output rounded-md border border-gray-800 bg-gray-950 px-4 py-3 text-sm text-gray-600">Translation will appear here</div>
			</div>
			<div class="rounded-lg border border-gray-900 bg-black p-8">
				<h3 class="m-0 mb-6 text-xl font-normal leading-none text-white">How it works</h3>
				<div class="flex flex-col gap-6">
					<div class="flex items-start gap-3"><div class="flex size-4 shrink-0 items-center justify-center rounded border border-green-500 bg-green-950"><svg aria-hidden="true" class="size-2.5" fill="none" height="24" stroke="var(--color-green-500)" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><path d="M20 6 9 17l-5-5" /></svg></div><div><h4 class="-mt-0.5 mb-0.5 text-sm font-normal text-white">AI Gateway routing</h4><p class="text-xs text-gray-400"><code class="text-white">agentuity dev</code> automatically sets OPENAI_API_KEY and OPENAI_BASE_URL so the AI SDK routes through the Agentuity gateway.</p></div></div>
					<div class="flex items-start gap-3"><div class="flex size-4 shrink-0 items-center justify-center rounded border border-green-500 bg-green-950"><svg aria-hidden="true" class="size-2.5" fill="none" height="24" stroke="var(--color-green-500)" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><path d="M20 6 9 17l-5-5" /></svg></div><div><h4 class="-mt-0.5 mb-0.5 text-sm font-normal text-white">API routes</h4><p class="text-xs text-gray-400">Edit <code class="text-white">src/index.ts</code> to change the AI model, prompt, or add new routes.</p></div></div>
					<div class="flex items-start gap-3"><div class="flex size-4 shrink-0 items-center justify-center rounded border border-green-500 bg-green-950"><svg aria-hidden="true" class="size-2.5" fill="none" height="24" stroke="var(--color-green-500)" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><path d="M20 6 9 17l-5-5" /></svg></div><div><h4 class="-mt-0.5 mb-0.5 text-sm font-normal text-white">Hono</h4><p class="text-xs text-gray-400">Lightweight, fast web framework for the edge. Add routes in <code class="text-white">src/index.ts</code>.</p></div></div>
				</div>
			</div>
		</div>
	</div>
	<script>
		const btn = document.getElementById('translate-btn');
		const textInput = document.getElementById('text-input');
		const toLangSelect = document.getElementById('toLanguage');
		const modelSelect = document.getElementById('model');
		const resultDiv = document.getElementById('result');
		btn.addEventListener('click', async () => {
			const text = textInput.value, toLanguage = toLangSelect.value, model = modelSelect.value;
			btn.textContent = 'Translating'; btn.disabled = true;
			resultDiv.textContent = ''; resultDiv.className = 'rounded-md border border-gray-800 bg-gray-950 px-4 py-3 text-sm text-gray-600';
			try {
				const res = await fetch('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, toLanguage, model }) });
				if (!res.ok) throw new Error('API error ' + res.status);
				const data = await res.json();
				resultDiv.className = 'output rounded-md border border-gray-800 bg-gray-950 px-4 py-3 text-sm text-cyan-500';
				resultDiv.innerHTML = data.translation + '<div class="flex gap-4 text-xs text-gray-500 mt-3">' + (data.tokens > 0 ? '<span>Tokens <strong class="text-gray-400">' + data.tokens + '</strong></span>' : '') + '<span>Model <strong class="text-gray-400">' + data.model + '</strong></span><span>Language <strong class="text-gray-400">' + data.toLanguage + '</strong></span></div>';
			} catch (err) { resultDiv.className = 'rounded-md border border-red-800 bg-red-950 px-4 py-3 text-sm text-red-400'; resultDiv.textContent = err.message || 'Translation failed'; }
			finally { btn.textContent = 'Translate'; btn.disabled = false; }
		});
	</script>
</body>
</html>`);
});

export default app;
