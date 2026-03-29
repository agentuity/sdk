import { buildUrl, toServiceException } from '../_util.ts';
import { StructuredError } from '../../error.ts';
import type {
	CreateWorkflowRequest,
	ListWorkflowsRequest,
	UpdateWorkflowGraphRequest,
	UpdateWorkflowRequest,
	WorkflowActivity,
	WorkflowCreateResult,
	WorkflowDelivery,
	WorkflowExecution,
	WorkflowGetResult,
	WorkflowListResult,
	WorkflowUpdateResult,
	TestWorkflowRequest,
	TestWorkflowResult,
} from './types.ts';
import type { FetchAdapter } from '../adapter.ts';

/**
 * Thrown when the API returns a success HTTP status but the response body indicates failure.
 */
const WorkflowResponseError = StructuredError('WorkflowResponseError')<{
	status: number;
}>();

/**
 * Creates an {@link AbortSignal} that will abort after the specified timeout.
 *
 * @remarks
 * Falls back to a manual `AbortController` + `setTimeout` if `AbortSignal.timeout`
 * is not available in the runtime.
 *
 * @param ms - Timeout in milliseconds
 * @returns An abort signal that triggers after `ms` milliseconds
 *
 * @default 30000
 */
function createTimeoutSignal(ms = 30_000): AbortSignal {
	if (typeof AbortSignal.timeout === 'function') {
		return AbortSignal.timeout(ms);
	}
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), ms);
	controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
	return controller.signal;
}

/**
 * Internal API success response envelope for workflow operations.
 */
type WorkflowSuccessResponse<T> = { success: true; data: T };

/**
 * Internal API error response envelope for workflow operations.
 */
type WorkflowErrorResponse = { success: false; message: string };

/**
 * Discriminated union of API success and error responses for workflow operations.
 */
type WorkflowResponse<T> = WorkflowSuccessResponse<T> | WorkflowErrorResponse;

/**
 * Client for the Agentuity Workflow service.
 *
 * Provides methods for creating and managing workflows that route events from
 * sources (email, queue, webhook, schedule) to configured destinations. The
 * service supports:
 *
 * - **Workflows**: Named routing configurations with a source and graph
 * - **Executions**: Records of workflow runs with step-level detail
 * - **Deliveries**: Records of destination delivery attempts
 * - **Testing**: Send test payloads through a workflow
 *
 * All methods are instrumented with OpenTelemetry spans for observability.
 *
 * @example
 * ```typescript
 * const workflows = new WorkflowService(baseUrl, adapter);
 *
 * // Create a workflow
 * const { workflow } = await workflows.create({
 *   name: 'GitHub to Slack',
 *   source_type: 'webhook',
 *   source_ref_id: 'wh_abc123',
 * });
 *
 * // List active workflows
 * const { workflows: list } = await workflows.list({ status: 'enabled' });
 * ```
 */
export class WorkflowService {
	#baseUrl: string;
	#adapter: FetchAdapter;

	/**
	 * Creates a new WorkflowService instance.
	 *
	 * @param baseUrl - The base URL of the workflow API
	 * @param adapter - The HTTP fetch adapter used for making API requests
	 */
	constructor(baseUrl: string, adapter: FetchAdapter) {
		this.#baseUrl = baseUrl;
		this.#adapter = adapter;
	}

	#createUrl(path: string): string {
		const url = buildUrl(this.#baseUrl, path);
		return url;
	}

	/**
	 * Lists all workflows for the authenticated organization.
	 *
	 * @param params - Optional filter and pagination parameters
	 * @returns A promise resolving to the paginated list of workflows
	 * @throws {@link WorkflowResponseError} If the API returns a failure response body
	 * @throws {@link ServiceException} If the HTTP request fails
	 *
	 * @example
	 * ```typescript
	 * const result = await service.list({ status: 'enabled', limit: 10 });
	 * console.log(`Found ${result.total} workflows`);
	 * for (const wf of result.workflows) {
	 *   console.log(`${wf.name} (${wf.source_type})`);
	 * }
	 * ```
	 */
	async list(params?: ListWorkflowsRequest): Promise<WorkflowListResult> {
		const url = this.#createUrl('/workflow/list');
		const signal = createTimeoutSignal();
		const queryParams: Record<string, string> = {};
		if (params?.limit !== undefined) queryParams['limit'] = String(params.limit);
		if (params?.offset !== undefined) queryParams['offset'] = String(params.offset);
		if (params?.status) queryParams['status'] = params.status;
		if (params?.source_type) queryParams['source_type'] = params.source_type;
		if (params?.filter) queryParams['filter'] = params.filter;

		const qs = new URLSearchParams(queryParams);
		const finalUrl = qs.toString() ? `${url}?${qs.toString()}` : url;
		const res = await this.#adapter.invoke<WorkflowResponse<WorkflowListResult>>(finalUrl, {
			method: 'GET',
			signal,
			contentType: 'application/json',
			telemetry: {
				name: 'agentuity.workflow.list',
			},
		});

		if (res.ok) {
			if (res.data.success) {
				return res.data.data;
			}
			throw new WorkflowResponseError({
				status: res.response.status,
				message: res.data.message || 'Failed to list workflows',
			});
		}

		throw await toServiceException('GET', url, res.response);
	}

	/**
	 * Gets a single workflow by its ID.
	 *
	 * @param workflowId - The unique workflow identifier (prefixed with wf_)
	 * @returns A promise resolving to the workflow details
	 * @throws {@link WorkflowResponseError} If the API returns a failure response body
	 * @throws {@link ServiceException} If the HTTP request fails
	 *
	 * @example
	 * ```typescript
	 * const result = await service.get('wf_abc123');
	 * console.log(result.workflow.name);
	 * ```
	 */
	async get(workflowId: string): Promise<WorkflowGetResult> {
		const url = this.#createUrl(`/workflow/${encodeURIComponent(workflowId)}`);
		const signal = createTimeoutSignal();

		const res = await this.#adapter.invoke<WorkflowResponse<WorkflowGetResult>>(url, {
			method: 'GET',
			signal,
			contentType: 'application/json',
			telemetry: {
				name: 'agentuity.workflow.get',
				attributes: {
					workflowId,
				},
			},
		});

		if (res.ok) {
			if (res.data.success) {
				return res.data.data;
			}
			throw new WorkflowResponseError({
				status: res.response.status,
				message: res.data.message || 'Failed to get workflow',
			});
		}

		throw await toServiceException('GET', url, res.response);
	}

	/**
	 * Creates a new workflow.
	 *
	 * @param params - The workflow creation parameters including name, source type, and source reference
	 * @returns A promise resolving to the newly created workflow
	 * @throws {@link WorkflowResponseError} If the API returns a failure response body
	 * @throws {@link ServiceException} If the HTTP request fails
	 *
	 * @example
	 * ```typescript
	 * const result = await service.create({
	 *   name: 'Email to Slack',
	 *   source_type: 'email',
	 *   source_ref_id: 'user@example.com',
	 * });
	 * console.log('Created:', result.workflow.id);
	 * ```
	 */
	async create(params: CreateWorkflowRequest): Promise<WorkflowCreateResult> {
		const url = this.#createUrl('/workflow/create');
		const signal = createTimeoutSignal();

		const res = await this.#adapter.invoke<WorkflowResponse<WorkflowCreateResult>>(url, {
			method: 'POST',
			signal,
			body: JSON.stringify(params),
			contentType: 'application/json',
			telemetry: {
				name: 'agentuity.workflow.create',
				attributes: {
					name: params.name,
					source_type: params.source_type,
				},
			},
		});

		if (res.ok) {
			if (res.data.success) {
				return res.data.data;
			}
			throw new WorkflowResponseError({
				status: res.response.status,
				message: res.data.message || 'Failed to create workflow',
			});
		}

		throw await toServiceException('POST', url, res.response);
	}

	/**
	 * Updates an existing workflow's name, description, or status.
	 *
	 * @param workflowId - The unique workflow identifier
	 * @param params - Fields to update; only provided fields are changed
	 * @returns A promise resolving to the updated workflow
	 * @throws {@link WorkflowResponseError} If the API returns a failure response body
	 * @throws {@link ServiceException} If the HTTP request fails
	 *
	 * @example
	 * ```typescript
	 * const result = await service.update('wf_abc123', {
	 *   name: 'Updated Workflow Name',
	 *   status: 'disabled',
	 * });
	 * console.log('Updated:', result.workflow.name);
	 * ```
	 */
	async update(workflowId: string, params: UpdateWorkflowRequest): Promise<WorkflowUpdateResult> {
		const url = this.#createUrl(`/workflow/${encodeURIComponent(workflowId)}`);
		const signal = createTimeoutSignal();

		const res = await this.#adapter.invoke<WorkflowResponse<WorkflowUpdateResult>>(url, {
			method: 'PATCH',
			signal,
			body: JSON.stringify(params),
			contentType: 'application/json',
			telemetry: {
				name: 'agentuity.workflow.update',
				attributes: {
					workflowId,
				},
			},
		});

		if (res.ok) {
			if (res.data.success) {
				return res.data.data;
			}
			throw new WorkflowResponseError({
				status: res.response.status,
				message: res.data.message || 'Failed to update workflow',
			});
		}

		throw await toServiceException('PATCH', url, res.response);
	}

	/**
	 * Updates the workflow graph (nodes and edges) for a workflow.
	 *
	 * @param workflowId - The unique workflow identifier
	 * @param params - The new graph definition with nodes and edges
	 * @returns A promise resolving to the updated workflow
	 * @throws {@link WorkflowResponseError} If the API returns a failure response body
	 * @throws {@link ServiceException} If the HTTP request fails
	 *
	 * @example
	 * ```typescript
	 * const result = await service.updateGraph('wf_abc123', {
	 *   nodes: [{ id: 'n1', type: 'filter', data: { expr: '...' } }],
	 *   edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
	 * });
	 * ```
	 */
	async updateGraph(
		workflowId: string,
		params: UpdateWorkflowGraphRequest
	): Promise<WorkflowUpdateResult> {
		const url = this.#createUrl(`/workflow/${encodeURIComponent(workflowId)}/graph`);
		const signal = createTimeoutSignal();

		const res = await this.#adapter.invoke<WorkflowResponse<WorkflowUpdateResult>>(url, {
			method: 'PUT',
			signal,
			body: JSON.stringify(params),
			contentType: 'application/json',
			telemetry: {
				name: 'agentuity.workflow.updateGraph',
				attributes: {
					workflowId,
				},
			},
		});

		if (res.ok) {
			if (res.data.success) {
				return res.data.data;
			}
			throw new WorkflowResponseError({
				status: res.response.status,
				message: res.data.message || 'Failed to update workflow graph',
			});
		}

		throw await toServiceException('PUT', url, res.response);
	}

	/**
	 * Deletes a workflow and all associated data.
	 *
	 * @param workflowId - The unique workflow identifier
	 * @throws {@link WorkflowResponseError} If the API returns a failure response body
	 * @throws {@link ServiceException} If the HTTP request fails
	 *
	 * @example
	 * ```typescript
	 * await service.delete('wf_abc123');
	 * console.log('Workflow deleted');
	 * ```
	 */
	async delete(workflowId: string): Promise<void> {
		const url = this.#createUrl(`/workflow/${encodeURIComponent(workflowId)}`);
		const signal = createTimeoutSignal();

		const res = await this.#adapter.invoke<WorkflowResponse<void>>(url, {
			method: 'DELETE',
			signal,
			contentType: 'application/json',
			telemetry: {
				name: 'agentuity.workflow.delete',
				attributes: {
					workflowId,
				},
			},
		});

		if (res.ok) {
			if (res.data.success) {
				return;
			}
			throw new WorkflowResponseError({
				status: res.response.status,
				message: res.data.message || 'Failed to delete workflow',
			});
		}

		throw await toServiceException('DELETE', url, res.response);
	}

	/**
	 * Tests a workflow with a sample payload.
	 *
	 * Sends the provided payload through the workflow and returns the execution
	 * result including individual step outcomes.
	 *
	 * @param workflowId - The unique workflow identifier
	 * @param params - The test parameters including the payload to send
	 * @returns A promise resolving to the test execution result
	 * @throws {@link WorkflowResponseError} If the API returns a failure response body
	 * @throws {@link ServiceException} If the HTTP request fails
	 *
	 * @example
	 * ```typescript
	 * const result = await service.test('wf_abc123', {
	 *   payload: { event: 'push', repo: 'my-repo' },
	 * });
	 * console.log('Test status:', result.status);
	 * ```
	 */
	async test(workflowId: string, params: TestWorkflowRequest): Promise<TestWorkflowResult> {
		const url = this.#createUrl(`/workflow/${encodeURIComponent(workflowId)}/test`);
		const signal = createTimeoutSignal();

		const res = await this.#adapter.invoke<WorkflowResponse<TestWorkflowResult>>(url, {
			method: 'POST',
			signal,
			body: JSON.stringify(params),
			contentType: 'application/json',
			telemetry: {
				name: 'agentuity.workflow.test',
				attributes: {
					workflowId,
				},
			},
		});

		if (res.ok) {
			if (res.data.success) {
				return res.data.data;
			}
			throw new WorkflowResponseError({
				status: res.response.status,
				message: res.data.message || 'Failed to test workflow',
			});
		}

		throw await toServiceException('POST', url, res.response);
	}

	/**
	 * Gets workflow activity statistics for the authenticated organization.
	 *
	 * Returns aggregate counts of workflows, executions, and their statuses.
	 *
	 * @param days - Optional number of days to look back for activity (default: server-side default)
	 * @returns A promise resolving to the activity statistics
	 * @throws {@link WorkflowResponseError} If the API returns a failure response body
	 * @throws {@link ServiceException} If the HTTP request fails
	 *
	 * @example
	 * ```typescript
	 * const activity = await service.activity(7);
	 * console.log(`${activity.total_workflows} workflows, ${activity.total_executions} executions`);
	 * ```
	 */
	async activity(days?: number): Promise<WorkflowActivity> {
		const url = this.#createUrl('/workflow/activity');
		const signal = createTimeoutSignal();
		const queryParams: Record<string, string> = {};
		if (days !== undefined) queryParams['days'] = String(days);

		const qs = new URLSearchParams(queryParams);
		const finalUrl = qs.toString() ? `${url}?${qs.toString()}` : url;
		const res = await this.#adapter.invoke<WorkflowResponse<WorkflowActivity>>(finalUrl, {
			method: 'GET',
			signal,
			contentType: 'application/json',
			telemetry: {
				name: 'agentuity.workflow.activity',
			},
		});

		if (res.ok) {
			if (res.data.success) {
				return res.data.data;
			}
			throw new WorkflowResponseError({
				status: res.response.status,
				message: res.data.message || 'Failed to get workflow activity',
			});
		}

		throw await toServiceException('GET', url, res.response);
	}

	/**
	 * Lists execution records for a specific workflow.
	 *
	 * @param workflowId - The unique workflow identifier
	 * @returns A promise resolving to the list of executions
	 * @throws {@link WorkflowResponseError} If the API returns a failure response body
	 * @throws {@link ServiceException} If the HTTP request fails
	 *
	 * @example
	 * ```typescript
	 * const executions = await service.listExecutions('wf_abc123');
	 * for (const exec of executions) {
	 *   console.log(`${exec.id}: ${exec.status}`);
	 * }
	 * ```
	 */
	async listExecutions(workflowId: string): Promise<WorkflowExecution[]> {
		const url = this.#createUrl(`/workflow/${encodeURIComponent(workflowId)}/executions`);
		const signal = createTimeoutSignal();

		const res = await this.#adapter.invoke<WorkflowResponse<WorkflowExecution[]>>(url, {
			method: 'GET',
			signal,
			contentType: 'application/json',
			telemetry: {
				name: 'agentuity.workflow.listExecutions',
				attributes: {
					workflowId,
				},
			},
		});

		if (res.ok) {
			if (res.data.success) {
				return res.data.data;
			}
			throw new WorkflowResponseError({
				status: res.response.status,
				message: res.data.message || 'Failed to list workflow executions',
			});
		}

		throw await toServiceException('GET', url, res.response);
	}

	/**
	 * Lists delivery records for a specific workflow execution.
	 *
	 * @param executionId - The unique execution identifier
	 * @returns A promise resolving to the list of deliveries
	 * @throws {@link WorkflowResponseError} If the API returns a failure response body
	 * @throws {@link ServiceException} If the HTTP request fails
	 *
	 * @example
	 * ```typescript
	 * const deliveries = await service.listDeliveries('exec_abc123');
	 * for (const d of deliveries) {
	 *   console.log(`${d.destination_type}: ${d.status}`);
	 * }
	 * ```
	 */
	async listDeliveries(executionId: string): Promise<WorkflowDelivery[]> {
		const url = this.#createUrl(
			`/workflow/executions/${encodeURIComponent(executionId)}/deliveries`
		);
		const signal = createTimeoutSignal();

		const res = await this.#adapter.invoke<WorkflowResponse<WorkflowDelivery[]>>(url, {
			method: 'GET',
			signal,
			contentType: 'application/json',
			telemetry: {
				name: 'agentuity.workflow.listDeliveries',
				attributes: {
					executionId,
				},
			},
		});

		if (res.ok) {
			if (res.data.success) {
				return res.data.data;
			}
			throw new WorkflowResponseError({
				status: res.response.status,
				message: res.data.message || 'Failed to list workflow deliveries',
			});
		}

		throw await toServiceException('GET', url, res.response);
	}

	/**
	 * Gets the most recent payload received by a workflow.
	 *
	 * Useful for inspecting the last event that triggered the workflow, e.g.
	 * when building or debugging workflow graphs.
	 *
	 * @param workflowId - The unique workflow identifier
	 * @returns A promise resolving to the recent payload data
	 * @throws {@link WorkflowResponseError} If the API returns a failure response body
	 * @throws {@link ServiceException} If the HTTP request fails
	 *
	 * @example
	 * ```typescript
	 * const payload = await service.getRecentPayload('wf_abc123');
	 * console.log('Last payload:', JSON.stringify(payload, null, 2));
	 * ```
	 */
	async getRecentPayload(workflowId: string): Promise<unknown> {
		const url = this.#createUrl(`/workflow/${encodeURIComponent(workflowId)}/recent-payload`);
		const signal = createTimeoutSignal();

		const res = await this.#adapter.invoke<WorkflowResponse<unknown>>(url, {
			method: 'GET',
			signal,
			contentType: 'application/json',
			telemetry: {
				name: 'agentuity.workflow.getRecentPayload',
				attributes: {
					workflowId,
				},
			},
		});

		if (res.ok) {
			if (res.data.success) {
				return res.data.data;
			}
			throw new WorkflowResponseError({
				status: res.response.status,
				message: res.data.message || 'Failed to get recent payload',
			});
		}

		throw await toServiceException('GET', url, res.response);
	}
}
