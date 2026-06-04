import { z } from 'zod';

// ---------------------------------------------------------------------------
// API-level Zod schemas for the Database HTTP API.
// ---------------------------------------------------------------------------

/** Request body for POST /resource/{orgId}/{region}/{database}/query */
export const DbExecuteQueryRequestSchema = z.object({
	query: z.string().describe('SQL query to execute'),
});

export type DbExecuteQueryRequest = z.infer<typeof DbExecuteQueryRequestSchema>;
