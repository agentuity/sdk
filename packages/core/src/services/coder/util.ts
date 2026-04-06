import { StructuredError } from '../../error.ts';
import { z } from 'zod/v4';

export const CoderErrorCodeSchema = z
	.enum([
		'CODER_SESSION_NOT_FOUND',
		'CODER_SESSION_ARCHIVED',
		'CODER_SESSION_CONFLICT',
		'CODER_INVALID_REQUEST',
	])
	.describe('Machine-readable error codes returned by coder APIs');
export type CoderErrorCode = z.infer<typeof CoderErrorCodeSchema>;

export const CoderResponseError = StructuredError('CoderResponseError')<{
	/** Coder session id involved in the failed operation */
	coderSessionId?: string;
	/** x-session-id header value used for trace correlation */
	requestSessionId?: string | null;
	/** Backend machine-readable error code, if provided */
	code?: CoderErrorCode;
}>();

export const CoderSessionNotFoundError = StructuredError('CoderSessionNotFoundError')<{
	coderSessionId: string;
}>();

export const CoderSessionArchivedError = StructuredError('CoderSessionArchivedError')<{
	coderSessionId?: string;
}>();

export const CoderSessionConflictError = StructuredError('CoderSessionConflictError')<{
	coderSessionId?: string;
}>();

export const CoderErrorContextSchema = z
	.object({
		sessionId: z.string().optional().describe('Coder session id involved in the operation'),
		requestSessionId: z
			.string()
			.nullish()
			.describe('Request trace session id from x-session-id header'),
	})
	.describe('Context used when mapping coder API errors');
export type CoderErrorContext = z.infer<typeof CoderErrorContextSchema>;

export function throwCoderError(
	resp: { message?: string; code?: string },
	context: CoderErrorContext
): never {
	const code = resp.code as CoderErrorCode | undefined;

	switch (code) {
		case 'CODER_SESSION_NOT_FOUND':
			throw new CoderSessionNotFoundError({
				message: resp.message,
				coderSessionId: context.sessionId ?? '',
			});
		case 'CODER_SESSION_ARCHIVED':
			throw new CoderSessionArchivedError({
				message: resp.message,
				coderSessionId: context.sessionId,
			});
		case 'CODER_SESSION_CONFLICT':
			throw new CoderSessionConflictError({
				message: resp.message,
				coderSessionId: context.sessionId,
			});
		default:
			throw new CoderResponseError({
				message: resp.message,
				coderSessionId: context.sessionId,
				requestSessionId: context.requestSessionId,
				code,
			});
	}
}

export function normalizeCoderUrl(url: string): string {
	return url.replace(/\/$/, '');
}

export function withOrgId(params: URLSearchParams, orgId?: string): URLSearchParams {
	if (orgId) {
		params.set('orgId', orgId);
	}
	return params;
}
