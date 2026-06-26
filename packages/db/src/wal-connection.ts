import { z } from 'zod';
import { type APIClient, APIError, APIResponseSchema } from '@agentuity/api';
import { DbInvalidArgumentError, DbResponseError, DbWALNotEnabledError } from './util.ts';

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
type DbWALConnectionAPIResponse = z.infer<typeof DbWALConnectionAPIResponseSchema>;

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
		const resp = await client.get<DbWALConnectionAPIResponse>(
			url,
			DbWALConnectionAPIResponseSchema
		);

		if (resp.success && resp.data) {
			return resp.data;
		}

		const message =
			'success' in resp && resp.success === false
				? resp.message
				: 'Failed to fetch WAL connection string';
		throw new DbResponseError({ database, message });
	} catch (ex) {
		if (ex instanceof APIError && ex.status === 412) {
			throw new DbWALNotEnabledError({
				database,
				message:
					ex.message ??
					'Logical replication is not enabled for this database. Retry with enable: true (irreversible).',
			});
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
