import { AIGatewayService, type Logger } from '@agentuity/core';
import { createServerFetchAdapter, getServiceUrls } from '@agentuity/server';
import * as tui from '../../../tui';
import type { AuthData, Config, GlobalOptions, ProjectConfig } from '../../../types';

const defaultAIGatewayRegion = 'usc';

export function getAIGatewayUrl(
	region?: string,
	overrides?: { aigateway_url?: string } | null
): string {
	if (process.env.AGENTUITY_AIGATEWAY_URL) {
		return process.env.AGENTUITY_AIGATEWAY_URL;
	}
	if (overrides?.aigateway_url) {
		return overrides.aigateway_url;
	}
	return getServiceUrls(region || process.env.AGENTUITY_REGION || defaultAIGatewayRegion)
		.aigateway;
}

export function createAIGatewayService(ctx: {
	logger: Logger;
	auth: AuthData;
	region?: string;
	project?: ProjectConfig;
	config: Config | null;
	options: GlobalOptions;
}) {
	const orgId =
		ctx.project?.orgId ??
		ctx.options.orgId ??
		(process.env.AGENTUITY_CLOUD_ORG_ID || ctx.config?.preferences?.orgId);
	if (!orgId) {
		tui.fatal(
			'Organization ID is required. Either run from a project directory or use --org-id flag.'
		);
	}

	const adapter = createServerFetchAdapter(
		{
			headers: {
				Authorization: `Bearer ${ctx.auth.apiKey}`,
				'x-agentuity-orgid': orgId,
			},
		},
		ctx.logger
	);

	return new AIGatewayService(getAIGatewayUrl(ctx.region, ctx.config?.overrides), adapter);
}

export function createPublicAIGatewayService(ctx: {
	logger: Logger;
	region?: string;
	config: Config | null;
}) {
	const adapter = createServerFetchAdapter({ headers: {} }, ctx.logger);
	return new AIGatewayService(getAIGatewayUrl(ctx.region, ctx.config?.overrides), adapter);
}

export function getCompletionText(response: unknown): string {
	const choices = (response as { choices?: unknown }).choices;
	const first =
		Array.isArray(choices) && choices.length > 0
			? (choices[0] as { message?: { content?: unknown }; text?: unknown; delta?: unknown })
			: undefined;
	const content =
		first?.message?.content ?? first?.text ?? (response as { content?: unknown }).content;
	if (typeof content === 'string') {
		return content;
	}
	if (Array.isArray(content)) {
		return content
			.map((part) => {
				if (typeof part === 'string') return part;
				if (part && typeof part === 'object' && 'text' in part) {
					const text = (part as { text?: unknown }).text;
					return typeof text === 'string' ? text : '';
				}
				return '';
			})
			.join('');
	}
	return '';
}
