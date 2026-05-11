import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import { getCommand } from '../../../command-prefix';
import { createCommand } from '../../../types';
import { createAIGatewayService } from './util';

const GenericResponseSchema = z.object({
	model: z.string(),
	data: z.unknown().optional(),
	metadata: z.unknown().optional(),
	saved: z.string().optional(),
	bytes: z.number().optional(),
	operation: z.string().optional(),
});

async function ensureParent(path: string): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
}

function parseJsonObject(value: string | undefined): Record<string, unknown> | undefined {
	if (!value) return undefined;
	const parsed = JSON.parse(value);
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error('Expected a JSON object');
	}
	return parsed as Record<string, unknown>;
}

async function readTextInput(opts: {
	input?: string;
	file?: string;
	stdin?: boolean;
}): Promise<string> {
	if (opts.input !== undefined) {
		return opts.input;
	}
	if (opts.file) {
		return await Bun.file(opts.file).text();
	}
	if (opts.stdin || !process.stdin.isTTY) {
		const text = await Bun.stdin.text();
		if (text.trim().length > 0) return text;
	}
	throw new Error('Input is required. Pass text, use --file, or pipe stdin.');
}

function firstImageBase64(payload: unknown): string | undefined {
	const data = (payload as { data?: unknown }).data;
	if (!Array.isArray(data)) return undefined;
	for (const item of data) {
		const b64 = (item as { b64_json?: unknown }).b64_json;
		if (typeof b64 === 'string' && b64.length > 0) {
			return b64;
		}
	}
}

function providerlessModel(model: string): string {
	const slash = model.indexOf('/');
	return slash === -1 ? model : model.slice(slash + 1);
}

async function saveBase64(path: string, b64: string): Promise<number> {
	await ensureParent(path);
	const bytes = Buffer.from(b64, 'base64');
	await Bun.write(path, bytes);
	return bytes.byteLength;
}

async function saveBinary(path: string, data: unknown): Promise<number> {
	await ensureParent(path);
	if (data instanceof ArrayBuffer) {
		await Bun.write(path, data);
		return data.byteLength;
	}
	if (data instanceof Uint8Array) {
		await Bun.write(path, data);
		return data.byteLength;
	}
	if (typeof data === 'string') {
		await Bun.write(path, data);
		return Buffer.byteLength(data);
	}
	await Bun.write(path, JSON.stringify(data, null, 2));
	return Buffer.byteLength(JSON.stringify(data));
}

export const embeddingsSubcommand = createCommand({
	name: 'embeddings',
	aliases: ['embed'],
	description: 'Create embeddings through AI Gateway',
	tags: ['write', 'slow', 'requires-auth', 'uses-stdin'],
	requires: { auth: true },
	optional: { project: true, region: true },
	examples: [
		{
			command: getCommand(
				'cloud aigateway embeddings --model openai/text-embedding-3-small "hello"'
			),
			description: 'Create an embedding for text',
		},
	],
	schema: {
		args: z.object({
			input: z.string().optional().describe('text to embed'),
		}),
		options: z.object({
			model: z.string().describe('embedding model id'),
			file: z.string().optional().describe('read input text from a file'),
			dimensions: z.number().optional().describe('embedding dimensions'),
			extra: z
				.string()
				.optional()
				.describe('extra JSON object fields to merge into the request'),
			format: z.enum(['json', 'raw']).optional().describe('output format'),
		}),
		response: GenericResponseSchema,
	},
	async handler(ctx) {
		const service = createAIGatewayService(ctx);
		const input = await readTextInput({ input: ctx.args.input, file: ctx.opts.file });
		const body = {
			...parseJsonObject(ctx.opts.extra),
			model: ctx.opts.model,
			input,
			...(ctx.opts.dimensions ? { dimensions: ctx.opts.dimensions } : {}),
		};
		const response = await service.request({
			path: '/v1/embeddings',
			body,
		});
		const result = {
			model: ctx.opts.model,
			data: response.data,
			metadata: response.metadata,
		};
		if (!ctx.options.json) {
			if (ctx.opts.format === 'raw') {
				console.log(JSON.stringify(response.data));
			} else {
				console.log(JSON.stringify(response.data, null, 2));
			}
		}
		return result;
	},
});

export const imageSubcommand = createCommand({
	name: 'image',
	description: 'Generate an image through AI Gateway',
	tags: ['write', 'slow', 'requires-auth', 'uses-stdin'],
	requires: { auth: true },
	optional: { project: true, region: true },
	examples: [
		{
			command: getCommand(
				'cloud aigateway image --model openai/gpt-image-1 --save out.png "A neon triangle logo"'
			),
			description: 'Generate and save an image when the provider returns base64 data',
		},
	],
	schema: {
		args: z.object({
			prompt: z.string().optional().describe('image prompt'),
		}),
		options: z.object({
			model: z.string().describe('image model id'),
			file: z.string().optional().describe('read prompt from a file'),
			save: z.string().optional().describe('write first base64 image to this file'),
			size: z.string().optional().describe('provider image size, such as 1024x1024'),
			quality: z.string().optional().describe('provider image quality'),
			extra: z
				.string()
				.optional()
				.describe('extra JSON object fields to merge into the request'),
		}),
		response: GenericResponseSchema,
	},
	async handler(ctx) {
		const service = createAIGatewayService(ctx);
		const prompt = await readTextInput({ input: ctx.args.prompt, file: ctx.opts.file });
		const body = {
			...parseJsonObject(ctx.opts.extra),
			model: ctx.opts.model,
			prompt,
			...(ctx.opts.size ? { size: ctx.opts.size } : {}),
			...(ctx.opts.quality ? { quality: ctx.opts.quality } : {}),
		};
		const response = await service.request({
			path: '/v1/images/generations',
			body,
		});
		let bytes: number | undefined;
		if (ctx.opts.save) {
			const b64 = firstImageBase64(response.data);
			if (!b64) {
				throw new Error('Response did not include a base64 image to save.');
			}
			bytes = await saveBase64(ctx.opts.save, b64);
		}
		const result = {
			model: ctx.opts.model,
			data: response.data,
			metadata: response.metadata,
			...(ctx.opts.save ? { saved: ctx.opts.save } : {}),
			...(bytes !== undefined ? { bytes } : {}),
		};
		if (!ctx.options.json) {
			console.log(JSON.stringify(result, null, 2));
		}
		return result;
	},
});

export const speechSubcommand = createCommand({
	name: 'speech',
	aliases: ['tts'],
	description: 'Generate speech audio through AI Gateway',
	tags: ['write', 'slow', 'requires-auth', 'uses-stdin'],
	requires: { auth: true },
	optional: { project: true, region: true },
	examples: [
		{
			command: getCommand(
				'cloud aigateway speech --model openai/gpt-4o-mini-tts --voice alloy --save out.mp3 "hello"'
			),
			description: 'Generate speech and save it to a file',
		},
	],
	schema: {
		args: z.object({
			input: z.string().optional().describe('text to synthesize'),
		}),
		options: z.object({
			model: z.string().describe('speech model id'),
			voice: z.string().default('alloy').describe('provider voice id'),
			file: z.string().optional().describe('read input text from a file'),
			save: z.string().optional().describe('write audio output to this file'),
			format: z.string().optional().describe('provider audio format, such as mp3 or wav'),
			extra: z
				.string()
				.optional()
				.describe('extra JSON object fields to merge into the request'),
		}),
		response: GenericResponseSchema,
	},
	async handler(ctx) {
		const service = createAIGatewayService(ctx);
		const input = await readTextInput({ input: ctx.args.input, file: ctx.opts.file });
		const response = await service.request({
			path: '/v1/audio/speech',
			body: {
				...parseJsonObject(ctx.opts.extra),
				model: ctx.opts.model,
				voice: ctx.opts.voice,
				input,
				...(ctx.opts.format ? { response_format: ctx.opts.format } : {}),
			},
		});
		const bytes = ctx.opts.save ? await saveBinary(ctx.opts.save, response.data) : undefined;
		const result = {
			model: ctx.opts.model,
			metadata: response.metadata,
			...(ctx.opts.save ? { saved: ctx.opts.save } : {}),
			...(bytes !== undefined ? { bytes } : {}),
		};
		if (!ctx.options.json) {
			console.log(JSON.stringify(result, null, 2));
		}
		return result;
	},
});

export const transcriptionSubcommand = createCommand({
	name: 'transcription',
	aliases: ['transcribe'],
	description: 'Transcribe audio through AI Gateway',
	tags: ['write', 'slow', 'requires-auth'],
	requires: { auth: true },
	optional: { project: true, region: true },
	examples: [
		{
			command: getCommand(
				'cloud aigateway transcribe --model openai/gpt-4o-mini-transcribe --file audio.mp3'
			),
			description: 'Transcribe an audio file',
		},
	],
	schema: {
		args: z.object({}),
		options: z.object({
			model: z.string().describe('transcription model id'),
			file: z.string().describe('audio file to upload'),
			language: z.string().optional().describe('input language'),
			prompt: z.string().optional().describe('optional transcription prompt'),
			format: z.string().optional().describe('provider response format, such as json or text'),
			extra: z
				.string()
				.optional()
				.describe('extra JSON object fields to merge into the request'),
		}),
		response: GenericResponseSchema,
	},
	async handler(ctx) {
		const service = createAIGatewayService(ctx);
		const form = new FormData();
		form.set('model', ctx.opts.model);
		form.set('file', Bun.file(ctx.opts.file));
		if (ctx.opts.language) form.set('language', ctx.opts.language);
		if (ctx.opts.prompt) form.set('prompt', ctx.opts.prompt);
		if (ctx.opts.format) form.set('response_format', ctx.opts.format);
		for (const [key, value] of Object.entries(parseJsonObject(ctx.opts.extra) ?? {})) {
			form.set(key, typeof value === 'string' ? value : JSON.stringify(value));
		}
		const response = await service.request({
			path: '/v1/audio/transcriptions',
			body: form,
		});
		const result = {
			model: ctx.opts.model,
			data: response.data,
			metadata: response.metadata,
		};
		if (!ctx.options.json) {
			console.log(
				typeof response.data === 'string'
					? response.data
					: JSON.stringify(response.data, null, 2)
			);
		}
		return result;
	},
});

export const videoSubcommand = createCommand({
	name: 'video',
	description: 'Start or poll a video generation request through AI Gateway',
	tags: ['write', 'slow', 'requires-auth', 'uses-stdin'],
	requires: { auth: true },
	optional: { project: true, region: true },
	examples: [
		{
			command: getCommand(
				'cloud aigateway video --model google/veo-3.1-fast-generate-preview "A robot drawing a triangle"'
			),
			description: 'Start a Google long-running video generation operation',
		},
	],
	schema: {
		args: z.object({
			prompt: z.string().optional().describe('video prompt'),
		}),
		options: z.object({
			model: z.string().describe('video model id'),
			file: z.string().optional().describe('read prompt from a file'),
			operation: z.string().optional().describe('poll an existing operation name instead'),
			poll: z.boolean().optional().describe('poll until the operation is done'),
			interval: z.number().default(10).describe('poll interval in seconds'),
			timeout: z.number().default(300).describe('poll timeout in seconds'),
			aspectRatio: z.string().optional().describe('video aspect ratio'),
			resolution: z.string().optional().describe('video resolution'),
			duration: z.number().optional().describe('duration in seconds'),
			extra: z
				.string()
				.optional()
				.describe('extra JSON object fields to merge into the request'),
		}),
		response: GenericResponseSchema,
	},
	async handler(ctx) {
		const service = createAIGatewayService(ctx);
		let operation = ctx.opts.operation;
		let data: unknown;
		let metadata: unknown;

		if (!operation) {
			const prompt = await readTextInput({ input: ctx.args.prompt, file: ctx.opts.file });
			const response = await service.request<{ name?: string }>({
				path: `/v1beta/models/${encodeURIComponent(providerlessModel(ctx.opts.model))}:predictLongRunning`,
				body: {
					...parseJsonObject(ctx.opts.extra),
					instances: [{ prompt }],
					parameters: {
						...(ctx.opts.aspectRatio ? { aspectRatio: ctx.opts.aspectRatio } : {}),
						...(ctx.opts.resolution ? { resolution: ctx.opts.resolution } : {}),
						...(ctx.opts.duration ? { durationSeconds: ctx.opts.duration } : {}),
					},
				},
			});
			data = response.data;
			metadata = response.metadata;
			operation = response.data.name;
		}

		if (ctx.opts.poll && operation) {
			const started = Date.now();
			while (Date.now() - started < ctx.opts.timeout * 1000) {
				const response = await service.request<{ done?: boolean }>({
					path: `/v1beta/${operation}`,
					method: 'GET',
				});
				data = response.data;
				metadata = response.metadata;
				if (response.data.done) {
					break;
				}
				await Bun.sleep(ctx.opts.interval * 1000);
			}
		}

		const result = {
			model: ctx.opts.model,
			...(operation ? { operation } : {}),
			data,
			metadata,
		};
		if (!ctx.options.json) {
			console.log(JSON.stringify(result, null, 2));
		}
		return result;
	},
});
