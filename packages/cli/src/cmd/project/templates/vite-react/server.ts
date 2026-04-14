import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

Bun.serve({
	port: process.env.PORT ?? 3000,
	async fetch(request) {
		const url = new URL(request.url);

		if (url.pathname === '/api/translate' && request.method === 'POST') {
			const { text, toLanguage, model = 'gpt-4o-mini' } = await request.json();

			const { text: translation, usage } = await generateText({
				model: openai(model),
				prompt: `Translate the following text to ${toLanguage}. Return only the translation, nothing else.\n\n${text}`,
			});

			return Response.json({
				translation,
				tokens: usage?.totalTokens ?? 0,
				model,
				toLanguage,
			});
		}

		// Proxy all other requests to Vite dev server
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

console.log('Server running on http://localhost:' + (process.env.PORT ?? 3000));
