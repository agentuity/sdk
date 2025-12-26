import { z } from 'zod';
import { APIClient, APIResponseSchema } from '../api';
import { SandboxResponseError, API_VERSION } from './util';
import type { ExecutionStatus } from '@agentuity/core';

const ExecutionDataSchema = z.object({
	executionId: z.string(),
	sandboxId: z.string(),
	status: z.enum(['queued', 'running', 'completed', 'failed', 'timeout', 'cancelled']),
	exitCode: z.number().optional(),
	durationMs: z.number().optional(),
	startedAt: z.string().optional(),
	completedAt: z.string().optional(),
	error: z.string().optional(),
});

const ExecutionGetResponseSchema = APIResponseSchema(ExecutionDataSchema);

export interface ExecutionInfo {
	executionId: string;
	sandboxId: string;
	status: ExecutionStatus;
	exitCode?: number;
	durationMs?: number;
	startedAt?: string;
	completedAt?: string;
	error?: string;
}

export interface ExecutionGetParams {
	executionId: string;
	orgId?: string;
}

export async function executionGet(
	client: APIClient,
	params: ExecutionGetParams
): Promise<ExecutionInfo> {
	const { executionId, orgId } = params;
	const queryParams = new URLSearchParams();
	if (orgId) {
		queryParams.set('orgId', orgId);
	}
	const queryString = queryParams.toString();
	const url = `/sandbox/${API_VERSION}/executions/${executionId}${queryString ? `?${queryString}` : ''}`;

	const resp = await client.get<z.infer<typeof ExecutionGetResponseSchema>>(
		url,
		ExecutionGetResponseSchema
	);

	if (resp.success) {
		return {
			executionId: resp.data.executionId,
			sandboxId: resp.data.sandboxId,
			status: resp.data.status as ExecutionStatus,
			exitCode: resp.data.exitCode,
			durationMs: resp.data.durationMs,
			startedAt: resp.data.startedAt,
			completedAt: resp.data.completedAt,
			error: resp.data.error,
		};
	}

	throw new SandboxResponseError({ message: resp.message, executionId });
}
