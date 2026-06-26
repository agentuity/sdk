import { z } from 'zod';
import { type APIClient, APIError, APIResponseSchema, ValidationOutputError } from '@agentuity/api';
import { DbInvalidArgumentError, DbResponseError, DbWALNotEnabledError } from './util.ts';

const WAL_NOT_ENABLED_CODE = 'wal_not_enabled';

export const DbWALConnectionRequestSchema = z.object({
	database: z.string().describe('the database name'),
	orgId: z.string().describe('the organization ID'),
	region: z.string().describe('the region'),
	enable: z.boolean().optional().describe('enable logical replication if not already enabled'),
});

export const DbWALConnectionResponseSchema = z.object({
	url: z.string().describe('Ion postgres URL for WAL/replication connections'),
	username: z.string().describe('replication role username'),
	logical_replication_enabled: z.boolean().describe('whether logical replication is enabled'),
	upstream_mode: z.string().describe('upstream routing mode (direct for WAL)'),
	wal_marker: z.string().describe('startup option marker embedded in the connection URL'),
});

export const DbWALConnectionAPIResponseSchema = APIResponseSchema(DbWALConnectionResponseSchema);

type DbWALConnectionRequest = z.infer<typeof DbWALConnectionRequestSchema>;

export type DbWALConnection = z.infer<typeof DbWALConnectionResponseSchema>;

/**
 * Get a WAL/replication connection string for a managed Postgres database.
 *
 * Requires SDK key authentication (`sk_...` / `AGENTUITY_SDK_KEY`).
 * When `enable` is false or omitted and logical replication is not enabled, returns 412.
 */
export async function dbWALConnection(
	client: APIClient,
	request: DbWALConnectionRequest
): Promise<DbWALConnection> {
	const { database, orgId, region, enable } = request;

	if (!orgId || !region) {
		throw new DbInvalidArgumentError({ message: 'orgId and region are required', orgId, region });
	}

	const query = enable ? '?enable=true' : '';
	const url = `/resource/${orgId}/${region}/${database}/connection/wal${query}`;

	try {
		const response = await client.rawGet(url);
		const body: unknown = await response.json().catch(() => undefined);

		if (response.ok) {
			const resp = DbWALConnectionAPIResponseSchema.parse(body);
			if (resp.success && resp.data) {
				return resp.data;
			}

			throw new DbResponseError({
				database,
				message: extractAPIErrorMessage(body) ?? 'Failed to fetch WAL connection string',
			});
		}

		const message =
			extractAPIErrorMessage(body) ??
			`Failed to fetch WAL connection string (${response.status})`;

		if (response.status === 412 && extractAPIPreconditionCode(body) === WAL_NOT_ENABLED_CODE) {
			throw new DbWALNotEnabledError({
				database,
				message:
					message ??
					'Logical replication is not enabled for this database. Retry with enable: true (irreversible).',
			});
		}

		throw new DbResponseError({ database, message });
	} catch (ex) {
		if (
			ex instanceof DbWALNotEnabledError ||
			ex instanceof DbResponseError ||
			ex instanceof ValidationOutputError
		) {
			throw ex;
		}
		if (ex instanceof APIError) {
			throw new DbResponseError({
				database,
				message: ex.message ?? 'Failed to fetch WAL connection string',
			});
		}
		throw ex;
	}
}

function extractAPIErrorMessage(body: unknown): string | undefined {
	if (typeof body !== 'object' || body === null) {
		return undefined;
	}

	const record = body as Record<string, unknown>;
	if (typeof record.message === 'string') {
		return record.message;
	}
	if (typeof record.error === 'string') {
		return record.error;
	}
	if (
		typeof record.error === 'object' &&
		record.error !== null &&
		'message' in record.error &&
		typeof (record.error as { message?: unknown }).message === 'string'
	) {
		return (record.error as { message: string }).message;
	}

	return undefined;
}

function extractAPIPreconditionCode(body: unknown): string | undefined {
	if (typeof body !== 'object' || body === null) {
		return undefined;
	}

	const record = body as Record<string, unknown>;
	if (typeof record.code === 'string') {
		return record.code;
	}
	if (
		typeof record.error === 'object' &&
		record.error !== null &&
		'code' in record.error &&
		typeof (record.error as { code?: unknown }).code === 'string'
	) {
		return (record.error as { code: string }).code;
	}

	return undefined;
}
