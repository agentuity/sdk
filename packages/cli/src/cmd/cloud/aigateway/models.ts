import { z } from 'zod';
import { createCommand } from '../../../types';
import * as tui from '../../../tui';
import { getCommand } from '../../../command-prefix';
import { getExecutingAgent } from '../../../agent-detection';
import { createPublicAIGatewayService, getAIGatewayUrl } from './util';
import { getCachedAIGatewayModels, setCachedAIGatewayModels } from './model-cache';

const ModelRowSchema = z.object({
	provider: z.string(),
	id: z.string(),
	name: z.string(),
	api: z.string().optional(),
	inputModalities: z.array(z.string()).optional(),
	outputModalities: z.array(z.string()).optional(),
	pricingUnit: z.string().optional(),
	pricingInput: z.number().optional(),
	pricingOutput: z.number().optional(),
	reasoning: z.boolean().optional(),
	recommended: z.boolean().optional(),
	defaultFor: z.array(z.string()).optional(),
	rank: z.number().optional(),
	contextWindow: z.number().optional(),
	maxOutputTokens: z.number().optional(),
});

const ModelsResponseSchema = z.object({
	models: z.array(ModelRowSchema),
	count: z.number(),
	model: ModelRowSchema.nullable().optional(),
	recommendations: z
		.array(
			z.object({
				use: z.string(),
				model: z.string(),
				name: z.string(),
				rank: z.number().optional(),
			})
		)
		.optional(),
});

function isAgentOutputMode(): boolean {
	return Boolean(getExecutingAgent()) && process.env.AGENTUITY_AIGATEWAY_AGENT_OUTPUT !== 'false';
}

function getRecommendations(rows: z.infer<typeof ModelRowSchema>[]) {
	const recommendations = new Map<string, z.infer<typeof ModelRowSchema>>();
	for (const row of rows) {
		if (!row.recommended || !row.defaultFor || row.defaultFor.length === 0) {
			continue;
		}
		for (const use of row.defaultFor) {
			const existing = recommendations.get(use);
			if (
				!existing ||
				(row.rank ?? Number.MAX_SAFE_INTEGER) < (existing.rank ?? Number.MAX_SAFE_INTEGER)
			) {
				recommendations.set(use, row);
			}
		}
	}
	return Array.from(recommendations.entries())
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([use, model]) => {
			return { use, model: model.id, name: model.name, rank: model.rank };
		});
}

function matchesProviderFilter(
	provider: string,
	modelId: string,
	providerFilter?: string
): boolean {
	if (!providerFilter) {
		return true;
	}
	return provider === providerFilter || modelId.startsWith(`${providerFilter}/`);
}

function matchesModelFilter(provider: string, modelId: string, modelFilter?: string): boolean {
	if (!modelFilter) {
		return true;
	}
	return modelId === modelFilter || `${provider}/${modelId}` === modelFilter;
}

function matchesNameFilter(modelId: string, modelName: string, nameFilter?: string): boolean {
	if (!nameFilter) {
		return true;
	}
	const normalized = nameFilter.toLowerCase();
	return (
		modelId.toLowerCase() === normalized ||
		modelId.split('/').pop()?.toLowerCase() === normalized ||
		modelName.toLowerCase() === normalized
	);
}

export const modelsSubcommand = createCommand({
	name: 'models',
	aliases: ['list', 'ls'],
	description: 'List AI Gateway models',
	tags: ['read-only', 'fast'],
	idempotent: true,
	examples: [
		{ command: getCommand('cloud aigateway models'), description: 'List all models' },
		{
			command: getCommand('cloud aigateway models --provider openai'),
			description: 'List OpenAI models',
		},
		{
			command: getCommand('cloud aigateway models --model anthropic/claude-opus-4-7'),
			description: 'Show one model by id',
		},
	],
	schema: {
		options: z.object({
			model: z.string().optional().describe('show one model by full provider/id'),
			provider: z.string().optional().describe('filter by provider'),
			name: z
				.string()
				.optional()
				.describe('show one model by id or display name with --provider'),
			reasoning: z.boolean().optional().describe('only show reasoning models'),
			inputModality: z
				.string()
				.optional()
				.describe('filter by input modality, such as text or image'),
			outputModality: z
				.string()
				.optional()
				.describe('filter by output modality, such as text or image'),
			ids: z.boolean().optional().describe('only print model ids'),
			simple: z.boolean().optional().describe('print a compact model list'),
			recommended: z.boolean().optional().describe('show recommended models for common uses'),
			refreshModels: z
				.boolean()
				.optional()
				.describe('refresh the cached AI Gateway model catalog'),
		}),
		response: ModelsResponseSchema,
	},
	async handler(ctx) {
		const service = createPublicAIGatewayService(ctx);
		const profile = ctx.config?.name ?? 'default';
		const cacheKey = getAIGatewayUrl(ctx.region, ctx.config?.overrides);
		const cached = ctx.opts.refreshModels
			? null
			: await getCachedAIGatewayModels(profile, cacheKey);
		const catalog = cached ?? (await service.listModels());
		if (!cached) {
			await setCachedAIGatewayModels(profile, cacheKey, catalog);
		}
		const rows = Object.entries(catalog).flatMap(([provider, models]) =>
			models
				.filter((model) => matchesProviderFilter(provider, model.id, ctx.opts.provider))
				.filter((model) => matchesModelFilter(provider, model.id, ctx.opts.model))
				.filter((model) => matchesNameFilter(model.id, model.name, ctx.opts.name))
				.filter((model) => !ctx.opts.reasoning || model.reasoning)
				.filter(
					(model) =>
						!ctx.opts.inputModality ||
						model.input_modalities?.includes(ctx.opts.inputModality)
				)
				.filter(
					(model) =>
						!ctx.opts.outputModality ||
						model.output_modalities?.includes(ctx.opts.outputModality)
				)
				.map((model) => ({
					provider,
					id: model.id,
					name: model.name,
					api: model.api,
					inputModalities: model.input_modalities,
					outputModalities: model.output_modalities,
					pricingUnit: model.pricing?.unit,
					pricingInput: model.pricing?.input,
					pricingOutput: model.pricing?.output,
					reasoning: model.reasoning,
					recommended: model.recommended,
					defaultFor: model.default_for,
					rank: model.rank,
					contextWindow: model.context_window,
					maxOutputTokens: model.max_output_tokens,
				}))
		);
		const singleLookup = Boolean(ctx.opts.model || ctx.opts.name);
		const selectedModel = singleLookup ? (rows[0] ?? null) : undefined;

		const agentOutput = isAgentOutputMode();
		if (ctx.options.json || agentOutput) {
			if (agentOutput && !ctx.options.json) {
				if (ctx.opts.ids) {
					console.log(
						JSON.stringify({ ids: rows.map((row) => row.id), count: rows.length }, null, 2)
					);
				} else if (ctx.opts.recommended) {
					console.log(JSON.stringify({ recommendations: getRecommendations(rows) }, null, 2));
				} else if (singleLookup) {
					console.log(
						JSON.stringify(
							{ model: selectedModel, models: rows, count: rows.length },
							null,
							2
						)
					);
				} else {
					console.log(JSON.stringify({ models: rows, count: rows.length }, null, 2));
				}
			}
		} else {
			if (rows.length === 0) {
				tui.info('No AI Gateway models found');
			} else if (ctx.opts.ids) {
				for (const row of rows) {
					console.log(row.id);
				}
			} else if (ctx.opts.recommended) {
				const recommendations = getRecommendations(rows).map((row) => ({
					Use: row.use,
					Model: row.model,
					Name: row.name,
					Rank: row.rank ?? '-',
				}));
				if (recommendations.length === 0) {
					tui.info('No recommended AI Gateway models found');
				} else {
					tui.table(recommendations, ['Use', 'Model', 'Name', 'Rank']);
				}
			} else if (ctx.opts.simple) {
				tui.table(
					rows.map((row) => ({
						Model: row.id,
						Name: row.name,
					})),
					['Model', 'Name']
				);
			} else {
				tui.info(`Found ${rows.length} AI Gateway model(s):`);
				tui.table(
					rows.map((row) => ({
						Provider: row.provider,
						Model: row.id,
						Name: row.name,
						API: row.api ?? '-',
						Input: row.inputModalities?.join(',') ?? '-',
						Output: row.outputModalities?.join(',') ?? '-',
						Unit: row.pricingUnit ?? '-',
						Reasoning: row.reasoning ? 'yes' : 'no',
						Default: row.defaultFor?.join(',') ?? '-',
						Context: row.contextWindow ?? '-',
					})),
					[
						'Provider',
						'Model',
						'Name',
						'API',
						'Input',
						'Output',
						'Unit',
						'Reasoning',
						'Default',
						'Context',
					]
				);
			}
		}

		return {
			models: rows,
			count: rows.length,
			model: selectedModel,
			...(ctx.opts.recommended ? { recommendations: getRecommendations(rows) } : {}),
		};
	},
});
