import { z } from 'zod';

const OptionalModelRequestSchema = z
	.object({
		model: z.string().trim().min(1).optional(),
	})
	.passthrough();

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

export function modelFromRequestBody(body: unknown, fallback: string): string {
	const parsed = OptionalModelRequestSchema.safeParse(body);
	if (!parsed.success) {
		return fallback;
	}

	return parsed.data.model ?? fallback;
}

export function requiredStringFromRequestBody(body: unknown, key: string): string | undefined {
	if (!isRecord(body)) {
		return undefined;
	}

	const value = body[key];
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}
