import { z } from 'zod';

export function isCliApiKey(apiKey: string): boolean {
	return apiKey.startsWith('ck_');
}

export const AIGatewayWSFrameType = {
	request: 'request',
	response: 'response',
	error: 'error',
	cancel: 'cancel',
	draining: 'draining',
} as const;

export const AIGatewayWSResponseStatus = {
	complete: 'complete',
	delta: 'delta',
	thinkingDelta: 'thinking_delta',
} as const;

export const AIGatewayWSUsageSchema = z.object({
	prompt: z.number(),
	completion: z.number(),
	total: z.number(),
	cached: z.number().optional(),
});

export type AIGatewayWSUsage = z.infer<typeof AIGatewayWSUsageSchema>;

export const AIGatewayWSServerResponseSchema = z.looseObject({
	type: z.literal(AIGatewayWSFrameType.response),
	id: z.string(),
	compact: z.boolean().optional(),
	status: z.string(),
	status_code: z.number().optional(),
	content: z.string().optional(),
	delta: z.string().optional(),
	thinking: z.string().optional(),
	usage: AIGatewayWSUsageSchema.optional(),
	cost: z.number().optional(),
	unit: z.string().optional(),
	input_qty: z.number().optional(),
	output_qty: z.number().optional(),
	event: z.string().optional(),
	data: z.unknown().optional(),
});

export type AIGatewayWSServerResponse = z.infer<typeof AIGatewayWSServerResponseSchema>;

export const AIGatewayWSServerErrorSchema = z.object({
	type: z.literal(AIGatewayWSFrameType.error),
	id: z.string().optional(),
	status_code: z.number(),
	message: z.string(),
});

export type AIGatewayWSServerError = z.infer<typeof AIGatewayWSServerErrorSchema>;

export const AIGatewayWSDrainingSchema = z.object({
	type: z.literal(AIGatewayWSFrameType.draining),
	message: z.string().optional(),
});

export type AIGatewayWSDraining = z.infer<typeof AIGatewayWSDrainingSchema>;

export type AIGatewayWSServerFrame =
	| AIGatewayWSServerResponse
	| AIGatewayWSServerError
	| AIGatewayWSDraining;

export function parseAIGatewayWSServerFrame(raw: unknown): AIGatewayWSServerFrame | null {
	if (!raw || typeof raw !== 'object') {
		return null;
	}
	const frame = raw as Record<string, unknown>;
	const type = frame.type;
	if (type === AIGatewayWSFrameType.draining) {
		const parsed = AIGatewayWSDrainingSchema.safeParse(raw);
		return parsed.success ? parsed.data : null;
	}
	if (type === AIGatewayWSFrameType.error) {
		const parsed = AIGatewayWSServerErrorSchema.safeParse(raw);
		return parsed.success ? parsed.data : null;
	}
	if (type === AIGatewayWSFrameType.response) {
		const parsed = AIGatewayWSServerResponseSchema.safeParse(raw);
		return parsed.success ? parsed.data : null;
	}
	return null;
}

export function buildAIGatewayWebSocketUrl(baseUrl: string): string {
	const trimmed = baseUrl.trim().replace(/\/$/, '');
	const wsBase = trimmed.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://');
	return `${wsBase}/v1/ws`;
}
