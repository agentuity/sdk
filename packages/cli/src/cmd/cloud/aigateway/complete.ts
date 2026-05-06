import { z } from 'zod';
import type { AIGatewayModels, AIGatewayService } from '@agentuity/core';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { getCommand } from '../../../command-prefix';
import { getExecutingAgent } from '../../../agent-detection';
import { createAIGatewayService, getAIGatewayUrl, getCompletionText } from './util';
import { getCachedAIGatewayModels, setCachedAIGatewayModels } from './model-cache';

const CompletionResponseSchema = z.object({
	text: z.string(),
	response: z.unknown(),
	cost: z.unknown().optional(),
});

const defaultModel = 'openai/gpt-4o-mini';

function isAgentOutputMode(): boolean {
	return Boolean(getExecutingAgent()) && process.env.AGENTUITY_AIGATEWAY_AGENT_OUTPUT !== 'false';
}

async function readPromptFromStdin(): Promise<string | undefined> {
	if (process.stdin.isTTY) {
		return undefined;
	}
	const text = await Bun.stdin.text();
	const trimmed = text.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

async function readPromptFromFile(filename?: string): Promise<string | undefined> {
	if (!filename) {
		return undefined;
	}
	const text = await Bun.file(filename).text();
	const trimmed = text.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

export function combinePromptInput(opts: {
	explicitPrompt?: string;
	stdinPrompt?: string;
	stdinMode?: 'append' | 'replace';
}): string | undefined {
	if (!opts.stdinPrompt) {
		return opts.explicitPrompt;
	}
	if (!opts.explicitPrompt || opts.stdinMode === 'replace') {
		return opts.stdinPrompt;
	}
	if (!opts.stdinMode || opts.stdinMode === 'append') {
		return `${opts.explicitPrompt}\n\n${opts.stdinPrompt}`;
	}
	return opts.explicitPrompt;
}

function getUsageText(response: unknown): string | undefined {
	if (!response || typeof response !== 'object') {
		return undefined;
	}
	const usage = (response as { usage?: unknown }).usage;
	if (!usage || typeof usage !== 'object') {
		return undefined;
	}
	const input =
		(usage as { prompt_tokens?: unknown; input_tokens?: unknown }).prompt_tokens ??
		(usage as { input_tokens?: unknown }).input_tokens;
	const output =
		(usage as { completion_tokens?: unknown; output_tokens?: unknown }).completion_tokens ??
		(usage as { output_tokens?: unknown }).output_tokens;
	const total = (usage as { total_tokens?: unknown }).total_tokens;
	const parts = [
		typeof input === 'number' ? `input=${input}` : undefined,
		typeof output === 'number' ? `output=${output}` : undefined,
		typeof total === 'number' ? `total=${total}` : undefined,
	].filter(Boolean);
	return parts.length > 0 ? `Usage: ${parts.join(' ')}` : undefined;
}

function getCostInfo(response: unknown): unknown | undefined {
	if (!response || typeof response !== 'object') {
		return undefined;
	}
	const agentuity = (response as { agentuity?: unknown }).agentuity;
	if (!agentuity || typeof agentuity !== 'object') {
		return undefined;
	}
	return (agentuity as { cost?: unknown }).cost;
}

function getCostText(response: unknown): string | undefined {
	const cost = getCostInfo(response);
	if (!cost || typeof cost !== 'object') {
		return undefined;
	}
	const total = (cost as { total?: unknown }).total;
	const promptTokens = (cost as { promptTokens?: unknown }).promptTokens;
	const completionTokens = (cost as { completionTokens?: unknown }).completionTokens;
	const parts = [
		typeof total === 'number' ? `total=$${total.toFixed(6)}` : undefined,
		typeof promptTokens === 'number' ? `prompt=${promptTokens}` : undefined,
		typeof completionTokens === 'number' ? `completion=${completionTokens}` : undefined,
	].filter(Boolean);
	return parts.length > 0 ? `Cost: ${parts.join(' ')}` : undefined;
}

type CompletionModelInfo = {
	id: string;
	api?: string;
	provider?: string;
};

function matchesModel(provider: string, candidateId: string, model: string): boolean {
	return candidateId === model || `${provider}/${candidateId}` === model;
}

async function getCompletionModelInfo(
	model: string,
	models: AIGatewayModels
): Promise<CompletionModelInfo | undefined> {
	for (const [provider, providerModels] of Object.entries(models)) {
		const match = providerModels.find((candidate) => matchesModel(provider, candidate.id, model));
		if (match) {
			return { id: match.id, api: match.api, provider };
		}
	}
	return undefined;
}

async function loadModelsForCompletion(opts: {
	service: AIGatewayService;
	profile: string;
	cacheKey: string;
	refresh?: boolean;
}): Promise<AIGatewayModels> {
	if (!opts.refresh) {
		const cached = await getCachedAIGatewayModels(opts.profile, opts.cacheKey);
		if (cached) {
			return cached;
		}
	}
	const models = await opts.service.listModels();
	await setCachedAIGatewayModels(opts.profile, opts.cacheKey, models);
	return models;
}

function buildCompletionRequest(opts: {
	model: string;
	prompt: string;
	system?: string;
	api?: string;
	temperature?: number;
	maxTokens?: number;
	stream?: boolean;
}) {
	const common = {
		model: opts.model,
		temperature: opts.temperature,
		max_tokens: opts.maxTokens,
		...(opts.stream ? { stream: true } : {}),
	};
	return {
		...common,
		messages: [
			...(opts.system ? [{ role: 'system' as const, content: opts.system }] : []),
			{ role: 'user' as const, content: opts.prompt },
		],
	};
}

async function resolvePrompt(opts: {
	optionPrompt?: string;
	argPrompt?: string;
	file?: string;
	stdinMode?: 'append' | 'replace';
}): Promise<string | undefined> {
	const explicitPrompt =
		opts.optionPrompt ?? opts.argPrompt ?? (await readPromptFromFile(opts.file));
	const stdinPrompt = await readPromptFromStdin();
	return combinePromptInput({ explicitPrompt, stdinPrompt, stdinMode: opts.stdinMode });
}

function getStreamDeltaText(payload: unknown): string {
	if (!payload || typeof payload !== 'object') {
		return '';
	}
	const choices = (payload as { choices?: unknown }).choices;
	if (!Array.isArray(choices)) {
		return '';
	}
	return choices
		.map((choice) => {
			if (!choice || typeof choice !== 'object') {
				return '';
			}
			const delta = (choice as { delta?: { content?: unknown } }).delta;
			if (typeof delta?.content === 'string') {
				return delta.content;
			}
			const text = (choice as { text?: unknown }).text;
			return typeof text === 'string' ? text : '';
		})
		.join('');
}

async function consumeCompletionStream(
	stream: ReadableStream<Uint8Array>,
	options: { json?: boolean; raw?: boolean }
): Promise<string> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	let text = '';

	const consumeFrame = (frame: string) => {
		const dataLines = frame
			.split(/\r?\n/)
			.filter((line) => line.startsWith('data:'))
			.map((line) => line.slice(5).trimStart());
		for (const data of dataLines) {
			if (!data || data === '[DONE]') {
				continue;
			}
			if (options.raw) {
				if (!options.json) {
					console.log(data);
				}
				continue;
			}
			try {
				const delta = getStreamDeltaText(JSON.parse(data));
				if (delta) {
					text += delta;
					if (!options.json) {
						process.stdout.write(delta);
					}
				}
			} catch {
				// Ignore malformed stream frames and continue consuming the stream.
			}
		}
	};

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			buffer += decoder.decode(value, { stream: true });
			const frames = buffer.split(/\r?\n\r?\n/);
			buffer = frames.pop() ?? '';
			for (const frame of frames) {
				consumeFrame(frame);
			}
		}
		buffer += decoder.decode();
		if (buffer.trim()) {
			consumeFrame(buffer);
		}
	} finally {
		reader.releaseLock();
	}
	if (!options.json && !options.raw && text) {
		process.stdout.write('\n');
	}
	return text;
}

export const completeSubcommand = createCommand({
	name: 'complete',
	aliases: ['completion', 'chat'],
	description: 'Run an AI Gateway chat completion',
	tags: ['write', 'slow', 'requires-auth', 'uses-stdin'],
	requires: { auth: true },
	optional: { project: true, region: true },
	examples: [
		{
			command: getCommand('cloud aigateway complete --model openai/gpt-4.1-mini "Hello"'),
			description: 'Run a completion',
		},
		{
			command: `echo "Hello" | ${getCommand('cloud aigateway complete --model openai/gpt-4.1-mini')}`,
			description: 'Read the prompt from stdin',
		},
		{
			command: getCommand(
				'cloud aigateway complete --model openai/gpt-4.1-mini --file prompt.txt'
			),
			description: 'Read the prompt from a file',
		},
		{
			command: getCommand(
				'cloud aigateway complete --model openai/gpt-4.1-mini --stream "Hello"'
			),
			description: 'Stream token output as it arrives',
		},
	],
	schema: {
		args: z.object({
			prompt: z.string().optional().describe('prompt text'),
		}),
		options: z.object({
			model: z.string().min(1).optional().describe('model id'),
			prompt: z.string().optional().describe('prompt text'),
			file: z.string().optional().describe('read prompt text from a file'),
			system: z.string().optional().describe('optional system message'),
			systemFile: z.string().optional().describe('read the system message from a file'),
			refreshModels: z
				.boolean()
				.optional()
				.describe('refresh the cached AI Gateway model catalog before choosing request format'),
			temperature: z.number().optional().describe('sampling temperature'),
			maxTokens: z.number().optional().describe('maximum output tokens'),
			stream: z.boolean().optional().describe('stream token output as it arrives'),
			save: z.string().optional().describe('write assistant text to a file'),
			format: z
				.enum(['text', 'json', 'raw'])
				.optional()
				.describe('output format for non-json mode'),
			stdinMode: z
				.enum(['append', 'replace'])
				.optional()
				.describe('how to combine stdin with prompt text'),
			usage: z.boolean().optional().describe('print usage details when available'),
			cost: z.boolean().optional().describe('print AI Gateway cost details when available'),
			raw: z.boolean().optional().describe('print the raw completion response'),
		}),
		response: CompletionResponseSchema,
	},
	async handler(ctx) {
		const prompt = await resolvePrompt({
			optionPrompt: ctx.opts.prompt,
			argPrompt: ctx.args.prompt,
			file: ctx.opts.file,
			stdinMode: ctx.opts.stdinMode,
		});
		if (!prompt) {
			tui.fatal(
				'Prompt is required. Pass it as an argument, use --prompt, use --file, or pipe it through stdin.'
			);
		}

		const service = createAIGatewayService(ctx);
		const model = ctx.opts.model ?? process.env.AGENTUITY_AIGATEWAY_MODEL ?? defaultModel;
		const system = ctx.opts.system ?? (await readPromptFromFile(ctx.opts.systemFile));
		const profile = ctx.config?.name ?? 'default';
		const cacheKey = getAIGatewayUrl(ctx.region, ctx.config?.overrides);
		let models = await loadModelsForCompletion({
			service,
			profile,
			cacheKey,
			refresh: ctx.opts.refreshModels,
		});
		let modelInfo = await getCompletionModelInfo(model, models);
		if (!modelInfo && !ctx.opts.refreshModels) {
			models = await loadModelsForCompletion({ service, profile, cacheKey, refresh: true });
			modelInfo = await getCompletionModelInfo(model, models);
		}
		const request = buildCompletionRequest({
			model,
			prompt,
			system,
			api: modelInfo?.api,
			temperature: ctx.opts.temperature,
			maxTokens: ctx.opts.maxTokens,
		});
		const format = ctx.opts.raw
			? 'raw'
			: (ctx.opts.format ?? (isAgentOutputMode() ? 'json' : 'text'));

		if (ctx.opts.stream) {
			const streamed = await service.streamCompleteWithMetadata({ ...request, stream: true });
			const text = await consumeCompletionStream(streamed.stream, {
				json: ctx.options.json || format === 'json',
				raw: format === 'raw',
			});
			const metadata = await streamed.metadata;
			const cost = metadata.cost;
			if (ctx.opts.save) {
				await Bun.write(ctx.opts.save, text);
			}
			if (!ctx.options.json && format === 'json') {
				console.log(JSON.stringify({ text, cost, response: { stream: true, model } }, null, 2));
			}
			if (!ctx.options.json && ctx.opts.cost) {
				const costText = getCostText({ agentuity: metadata });
				if (costText) {
					console.error(costText);
				}
			}
			return { text, response: { stream: true }, cost };
		}

		const response = await service.complete(request);
		const text = getCompletionText(response);
		const cost = getCostInfo(response);
		if (ctx.opts.save) {
			await Bun.write(ctx.opts.save, text);
		}

		if (!ctx.options.json) {
			if (format === 'raw') {
				console.log(JSON.stringify(response, null, 2));
			} else if (format === 'json') {
				console.log(
					JSON.stringify(
						{ text, model, usage: (response as { usage?: unknown }).usage, cost, response },
						null,
						2
					)
				);
			} else {
				console.log(text);
			}
			if (ctx.opts.usage) {
				const usage = getUsageText(response);
				if (usage) {
					console.error(usage);
				}
			}
			if (ctx.opts.cost) {
				const costText = getCostText(response);
				if (costText) {
					console.error(costText);
				}
			}
		}

		return { text, response, cost };
	},
});
