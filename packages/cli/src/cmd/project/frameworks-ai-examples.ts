/**
 * AI SDK example generators for each framework.
 *
 * Each function returns a map of relative file paths to file contents
 * that demonstrate a simple AI chat endpoint using the Vercel AI SDK
 * with the Agentuity AI Gateway.
 */

export function nextjsAiExample(): Record<string, string> {
	return {
		'app/api/chat/route.ts': `import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
\tconst { message } = await request.json();

\tconst { text } = await generateText({
\t\tmodel: openai('gpt-4o-mini'),
\t\tprompt: message,
\t});

\treturn NextResponse.json({ reply: text });
}
`,
	};
}

export function nuxtAiExample(): Record<string, string> {
	return {
		'server/api/chat.post.ts': `import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

export default defineEventHandler(async (event) => {
\tconst { message } = await readBody(event);

\tconst { text } = await generateText({
\t\tmodel: openai('gpt-4o-mini'),
\t\tprompt: message,
\t});

\treturn { reply: text };
});
`,
	};
}

export function remixAiExample(): Record<string, string> {
	return {
		'app/routes/api.chat.ts': `import { type ActionFunctionArgs, json } from '@remix-run/node';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

export async function action({ request }: ActionFunctionArgs) {
\tconst { message } = await request.json();

\tconst { text } = await generateText({
\t\tmodel: openai('gpt-4o-mini'),
\t\tprompt: message,
\t});

\treturn json({ reply: text });
}
`,
	};
}

export function sveltekitAiExample(): Record<string, string> {
	return {
		'src/routes/api/chat/+server.ts': `import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

export const POST: RequestHandler = async ({ request }) => {
\tconst { message } = await request.json();

\tconst { text } = await generateText({
\t\tmodel: openai('gpt-4o-mini'),
\t\tprompt: message,
\t});

\treturn json({ reply: text });
};
`,
	};
}

export function astroAiExample(): Record<string, string> {
	return {
		'src/pages/api/chat.ts': `import type { APIRoute } from 'astro';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

export const POST: APIRoute = async ({ request }) => {
\tconst { message } = await request.json();

\tconst { text } = await generateText({
\t\tmodel: openai('gpt-4o-mini'),
\t\tprompt: message,
\t});

\treturn new Response(
\t\tJSON.stringify({ reply: text }),
\t\t{ headers: { 'Content-Type': 'application/json' } }
\t);
};
`,
	};
}

export function honoAiExample(): Record<string, string> {
	return {
		'src/index.ts': `import { Hono } from 'hono';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

const app = new Hono();

app.get('/', (c) => c.text('Hello from Hono + Agentuity!'));

app.post('/api/chat', async (c) => {
\tconst { message } = await c.req.json();

\tconst { text } = await generateText({
\t\tmodel: openai('gpt-4o-mini'),
\t\tprompt: message,
\t});

\treturn c.json({ reply: text });
});

export default app;
`,
	};
}

export function viteReactAiExample(): Record<string, string> {
	return {
		'server.ts': `import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

Bun.serve({
\tport: process.env.PORT ?? 3000,
\tasync fetch(request) {
\t\tconst url = new URL(request.url);

\t\tif (url.pathname === '/api/chat' && request.method === 'POST') {
\t\t\tconst { message } = await request.json();

\t\t\tconst { text } = await generateText({
\t\t\t\tmodel: openai('gpt-4o-mini'),
\t\t\t\tprompt: message,
\t\t\t});

\t\t\treturn Response.json({ reply: text });
\t\t}

\t\treturn new Response('Not Found', { status: 404 });
\t},
});

console.log('Server running on http://localhost:' + (process.env.PORT ?? 3000));
`,
	};
}
