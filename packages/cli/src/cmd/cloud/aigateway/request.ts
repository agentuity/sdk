import { z } from 'zod';
import { createCommand } from '../../../types';
import { getCommand } from '../../../command-prefix';
import { createAIGatewayService } from './util';

const RequestResponseSchema = z.object({
	path: z.string(),
	method: z.string(),
	stream: z.boolean().optional(),
	data: z.unknown().optional(),
	metadata: z.unknown().optional(),
});

async function readStdin(): Promise<string | undefined> {
	if (process.stdin.isTTY) {
		return undefined;
	}
	const text = await Bun.stdin.text();
	const trimmed = text.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

async function readBody(opts: { body?: string; file?: string; raw?: boolean }): Promise<unknown> {
	const text = opts.body ?? (opts.file ? await Bun.file(opts.file).text() : await readStdin());
	if (text === undefined) {
		return undefined;
	}
	if (opts.raw) {
		return text;
	}
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

async function consumeRawStream(stream: ReadableStream<Uint8Array>): Promise<string> {
	const text = await new Response(stream).text();
	if (text) {
		process.stdout.write(text);
		if (!text.endsWith('\n')) {
			process.stdout.write('\n');
		}
	}
	return text;
}

export const requestSubcommand = createCommand({
	name: 'request',
	aliases: ['raw'],
	description: 'Send an upstream-shaped request through the AI Gateway',
	tags: ['write', 'slow', 'requires-auth', 'uses-stdin'],
	requires: { auth: true },
	optional: { project: true, region: true },
	examples: [
		{
			command: getCommand(
				'cloud aigateway request /v1/embeddings --body \'{"model":"openai/text-embedding-3-small","input":"hello"}\''
			),
			description: 'Run an embeddings request',
		},
		{
			command: getCommand(
				'cloud aigateway request /v1beta/models/gemini-3.1-flash-lite:streamGenerateContent --stream --body \'{"contents":[{"role":"user","parts":[{"text":"hello"}]}]}\''
			),
			description: 'Stream a Google Generative AI request',
		},
	],
	schema: {
		args: z.object({
			path: z.string().min(1).describe('gateway-relative upstream path'),
		}),
		options: z.object({
			method: z
				.enum(['GET', 'PUT', 'POST', 'DELETE', 'HEAD', 'OPTIONS', 'PATCH'])
				.optional()
				.describe('HTTP method'),
			body: z.string().optional().describe('request body; JSON is parsed automatically'),
			file: z.string().optional().describe('read request body from a file'),
			header: z.array(z.string()).optional().describe('additional header as name:value'),
			rawBody: z.boolean().optional().describe('send body as plain text without JSON parsing'),
			stream: z.boolean().optional().describe('treat the response as an SSE stream'),
			format: z.enum(['json', 'raw']).optional().describe('output format'),
		}),
		response: RequestResponseSchema,
	},
	async handler(ctx) {
		const service = createAIGatewayService(ctx);
		const method = ctx.opts.method ?? 'POST';
		const headers = Object.fromEntries(
			(ctx.opts.header ?? []).map((header) => {
				const index = header.indexOf(':');
				return index === -1
					? [header.trim(), '']
					: [header.slice(0, index).trim(), header.slice(index + 1).trim()];
			})
		);
		const body = await readBody({
			body: ctx.opts.body,
			file: ctx.opts.file,
			raw: ctx.opts.rawBody,
		});

		if (ctx.opts.stream) {
			const streamed = await service.streamRequest({
				path: ctx.args.path,
				method,
				body,
				...(Object.keys(headers).length > 0 ? { headers } : {}),
			});
			const text = await consumeRawStream(streamed.stream);
			const metadata = await streamed.metadata;
			const result = { path: ctx.args.path, method, stream: true, data: text, metadata };
			if (!ctx.options.json && ctx.opts.format === 'json') {
				console.log(JSON.stringify(result, null, 2));
			}
			return result;
		}

		const response = await service.request({
			path: ctx.args.path,
			method,
			body,
			...(Object.keys(headers).length > 0 ? { headers } : {}),
		});
		const result = {
			path: ctx.args.path,
			method,
			data: response.data,
			metadata: response.metadata,
		};
		if (!ctx.options.json) {
			if (ctx.opts.format === 'raw' && typeof response.data === 'string') {
				console.log(response.data);
			} else {
				console.log(JSON.stringify(response.data, null, 2));
			}
		}
		return result;
	},
});
