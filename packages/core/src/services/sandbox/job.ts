import { type APIClient, APIResponseSchema } from '../api.ts';
import { CreateJobOptionsSchema, JobSchema, type Job, type JobStatus } from './types.ts';
import { throwSandboxError } from './util.ts';
import { z } from 'zod';

export const CreateJobRequestSchema = z.object({
	command: z.array(z.string()).describe('Command and arguments to execute'),
	streams: z
		.object({
			stdout: z.string().optional().describe('Stream ID for stdout output'),
			stderr: z.string().optional().describe('Stream ID for stderr output'),
		})
		.optional()
		.describe('Stream configuration for output redirection'),
});

export const CreateJobDataSchema = JobSchema;

export const CreateJobResponseSchema = APIResponseSchema(CreateJobDataSchema);

export const JobCreateParamsSchema = z.object({
	sandboxId: z.string().describe('Sandbox ID where the job should run'),
	options: CreateJobOptionsSchema.describe('Job creation options'),
	orgId: z.string().optional().describe('Optional org id for CLI auth context'),
	signal: z.custom<AbortSignal>().optional().describe('Optional abort signal for cancellation'),
});
export type JobCreateParams = z.infer<typeof JobCreateParamsSchema>;

export async function jobCreate(client: APIClient, params: JobCreateParams): Promise<Job> {
	const { sandboxId, options, orgId, signal } = params;
	const body: z.infer<typeof CreateJobRequestSchema> = {
		command: options.command,
	};
	if (options.streams) {
		body.streams = options.streams;
	}

	const queryParams = new URLSearchParams();
	if (orgId) {
		queryParams.set('orgId', orgId);
	}
	const queryString = queryParams.toString();
	const url = `/sandbox/sandboxes/${sandboxId}/jobs${queryString ? `?${queryString}` : ''}`;

	const resp = await client.post<z.infer<typeof CreateJobResponseSchema>>(
		url,
		body,
		CreateJobResponseSchema,
		CreateJobRequestSchema,
		signal
	);

	if (resp.success) {
		return {
			jobId: resp.data.jobId,
			sandboxId: resp.data.sandboxId,
			command: resp.data.command,
			status: resp.data.status as JobStatus,
			exitCode: resp.data.exitCode,
			startedAt: resp.data.startedAt,
			completedAt: resp.data.completedAt,
			error: resp.data.error,
			stdoutStreamUrl: resp.data.stdoutStreamUrl,
			stderrStreamUrl: resp.data.stderrStreamUrl,
		};
	}

	throwSandboxError(resp, { sandboxId });
}

export const JobGetDataSchema = JobSchema;

export const JobGetResponseSchema = APIResponseSchema(JobGetDataSchema);

export const JobGetParamsSchema = z.object({
	sandboxId: z.string().describe('Sandbox ID'),
	jobId: z.string().describe('Job ID'),
	orgId: z.string().optional().describe('Organization ID'),
	signal: z.custom<AbortSignal>().optional().describe('Abort signal for cancellation'),
});
export type JobGetParams = z.infer<typeof JobGetParamsSchema>;

export async function jobGet(client: APIClient, params: JobGetParams): Promise<Job> {
	const { sandboxId, jobId, orgId, signal } = params;
	const queryParams = new URLSearchParams();
	if (orgId) {
		queryParams.set('orgId', orgId);
	}
	const queryString = queryParams.toString();
	const url = `/sandbox/sandboxes/${sandboxId}/jobs/${jobId}${queryString ? `?${queryString}` : ''}`;

	const resp = await client.get<z.infer<typeof JobGetResponseSchema>>(
		url,
		JobGetResponseSchema,
		signal
	);

	if (resp.success) {
		return {
			jobId: resp.data.jobId,
			sandboxId: resp.data.sandboxId,
			command: resp.data.command,
			status: resp.data.status as JobStatus,
			exitCode: resp.data.exitCode,
			startedAt: resp.data.startedAt,
			completedAt: resp.data.completedAt,
			error: resp.data.error,
			stdoutStreamUrl: resp.data.stdoutStreamUrl,
			stderrStreamUrl: resp.data.stderrStreamUrl,
		};
	}

	throwSandboxError(resp, { sandboxId, jobId: params.jobId });
}

export const JobListDataSchema = z.object({
	jobs: z.array(JobSchema).describe('List of jobs'),
});
export type JobListResponse = z.infer<typeof JobListDataSchema>;

export const JobListResponseSchema = APIResponseSchema(JobListDataSchema);

export const JobListParamsSchema = z.object({
	sandboxId: z.string().describe('Sandbox ID'),
	orgId: z.string().optional().describe('Organization ID'),
	limit: z.number().optional().describe('Maximum number of results'),
	signal: z.custom<AbortSignal>().optional().describe('Abort signal for cancellation'),
});
export type JobListParams = z.infer<typeof JobListParamsSchema>;

export async function jobList(client: APIClient, params: JobListParams): Promise<JobListResponse> {
	const { sandboxId, orgId, limit, signal } = params;
	const queryParams = new URLSearchParams();
	if (orgId) {
		queryParams.set('orgId', orgId);
	}
	if (limit !== undefined) {
		queryParams.set('limit', String(limit));
	}
	const queryString = queryParams.toString();
	const url = `/sandbox/sandboxes/${sandboxId}/jobs${queryString ? `?${queryString}` : ''}`;

	const resp = await client.get<z.infer<typeof JobListResponseSchema>>(
		url,
		JobListResponseSchema,
		signal
	);

	if (resp.success) {
		return resp.data;
	}

	throwSandboxError(resp, { sandboxId });
}

export const JobStopDataSchema = JobSchema;

export const JobStopResponseSchema = APIResponseSchema(JobStopDataSchema);

export const JobStopParamsSchema = z.object({
	sandboxId: z.string().describe('Sandbox ID'),
	jobId: z.string().describe('Job ID'),
	force: z.boolean().optional().describe('Force termination (SIGKILL)'),
	orgId: z.string().optional().describe('Organization ID'),
	signal: z.custom<AbortSignal>().optional().describe('Abort signal for cancellation'),
});
export type JobStopParams = z.infer<typeof JobStopParamsSchema>;

export async function jobStop(client: APIClient, params: JobStopParams): Promise<Job> {
	const { sandboxId, jobId, force, orgId, signal } = params;
	const queryParams = new URLSearchParams();
	if (orgId) {
		queryParams.set('orgId', orgId);
	}
	if (force) {
		queryParams.set('force', 'true');
	}
	const queryString = queryParams.toString();
	const url = `/sandbox/sandboxes/${sandboxId}/jobs/${jobId}${queryString ? `?${queryString}` : ''}`;

	const resp = await client.delete<z.infer<typeof JobStopResponseSchema>>(
		url,
		JobStopResponseSchema,
		signal
	);

	if (resp.success) {
		return {
			jobId: resp.data.jobId,
			sandboxId: resp.data.sandboxId,
			command: resp.data.command,
			status: resp.data.status as JobStatus,
			exitCode: resp.data.exitCode,
			startedAt: resp.data.startedAt,
			completedAt: resp.data.completedAt,
			error: resp.data.error,
			stdoutStreamUrl: resp.data.stdoutStreamUrl,
			stderrStreamUrl: resp.data.stderrStreamUrl,
		};
	}

	throwSandboxError(resp, { sandboxId, jobId: params.jobId });
}
