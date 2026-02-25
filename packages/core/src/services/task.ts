import { FetchAdapter } from './adapter.ts';
import { buildUrl, toServiceException } from './_util.ts';
import { StructuredError } from '../error.ts';
import { safeStringify } from '../json.ts';

// Task type enums
export type TaskPriority = 'high' | 'medium' | 'low' | 'none';
export type TaskType = 'epic' | 'feature' | 'enhancement' | 'bug' | 'task';
export type TaskStatus = 'open' | 'in_progress' | 'closed';

// Task object (returned from API)
export interface Task {
	id: string;
	created_at: string;
	updated_at: string;
	title: string;
	description?: string;
	metadata?: Record<string, unknown>;
	priority: TaskPriority;
	parent_id?: string;
	type: TaskType;
	status: TaskStatus;
	open_date?: string;
	in_progress_date?: string;
	closed_date?: string;
	created_id: string;
	assigned_id?: string;
	closed_id?: string;
}

// Changelog entry
export interface TaskChangelogEntry {
	id: string;
	created_at: string;
	task_id: string;
	field: string;
	old_value?: string;
	new_value?: string;
}

// Request params
export interface CreateTaskParams {
	title: string;
	description?: string;
	metadata?: Record<string, unknown>;
	priority?: TaskPriority;
	parent_id?: string;
	type: TaskType;
	status?: TaskStatus;
	created_id: string;
	assigned_id?: string;
}

export interface UpdateTaskParams {
	title?: string;
	description?: string;
	metadata?: Record<string, unknown>;
	priority?: TaskPriority;
	parent_id?: string;
	type?: TaskType;
	status?: TaskStatus;
	assigned_id?: string;
	closed_id?: string;
}

export interface ListTasksParams {
	status?: TaskStatus;
	type?: TaskType;
	priority?: TaskPriority;
	assigned_id?: string;
	parent_id?: string;
	sort?: string;
	order?: 'asc' | 'desc';
	limit?: number;
	offset?: number;
}

export interface ListTasksResult {
	tasks: Task[];
	total: number;
	limit: number;
	offset: number;
}

export interface TaskChangelogResult {
	changelog: TaskChangelogEntry[];
	total: number;
	limit: number;
	offset: number;
}

export interface TaskStorage {
	create(params: CreateTaskParams): Promise<Task>;
	get(id: string): Promise<Task | null>;
	list(params?: ListTasksParams): Promise<ListTasksResult>;
	update(id: string, params: UpdateTaskParams): Promise<Task>;
	close(id: string): Promise<Task>;
	changelog(
		id: string,
		params?: { limit?: number; offset?: number }
	): Promise<TaskChangelogResult>;
}

const TASK_API_VERSION = '2026-02-24';

const TaskIdRequiredError = StructuredError(
	'TaskIdRequiredError',
	'Task ID is required and must be a non-empty string'
);

const TaskTitleRequiredError = StructuredError(
	'TaskTitleRequiredError',
	'Task title is required and must be a non-empty string'
);

const TaskStorageResponseError = StructuredError('TaskStorageResponseError')<{
	status: number;
}>();

interface TaskSuccessResponse<T> {
	success: true;
	data: T;
}

interface TaskErrorResponse {
	success: false;
	message: string;
}

type TaskResponse<T> = TaskSuccessResponse<T> | TaskErrorResponse;

export class TaskStorageService implements TaskStorage {
	#adapter: FetchAdapter;
	#baseUrl: string;

	constructor(baseUrl: string, adapter: FetchAdapter) {
		this.#adapter = adapter;
		this.#baseUrl = baseUrl;
	}

	async create(params: CreateTaskParams): Promise<Task> {
		if (!params?.title || typeof params.title !== 'string' || params.title.trim().length === 0) {
			throw new TaskTitleRequiredError();
		}

		const url = buildUrl(this.#baseUrl, `/task/${TASK_API_VERSION}`);
		const signal = AbortSignal.timeout(30_000);

		const res = await this.#adapter.invoke<TaskResponse<Task>>(url, {
			method: 'POST',
			body: safeStringify(params),
			contentType: 'application/json',
			signal,
			telemetry: {
				name: 'agentuity.task.create',
				attributes: {
					type: params.type,
					priority: params.priority ?? 'none',
					status: params.status ?? 'open',
				},
			},
		});

		if (res.ok) {
			if (res.data.success) {
				return res.data.data;
			}
			throw new TaskStorageResponseError({
				status: res.response.status,
				message: res.data.message,
			});
		}

		throw await toServiceException('POST', url, res.response);
	}

	async get(id: string): Promise<Task | null> {
		if (!id || typeof id !== 'string' || id.trim().length === 0) {
			throw new TaskIdRequiredError();
		}

		const url = buildUrl(this.#baseUrl, `/task/${TASK_API_VERSION}/${encodeURIComponent(id)}`);
		const signal = AbortSignal.timeout(30_000);

		const res = await this.#adapter.invoke<TaskResponse<Task>>(url, {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.task.get',
				attributes: { id },
			},
		});

		if (res.response.status === 404) {
			return null;
		}

		if (res.ok) {
			if (res.data.success) {
				return res.data.data;
			}
			throw new TaskStorageResponseError({
				status: res.response.status,
				message: res.data.message,
			});
		}

		throw await toServiceException('GET', url, res.response);
	}

	async list(params?: ListTasksParams): Promise<ListTasksResult> {
		const queryParams = new URLSearchParams();
		if (params?.status) queryParams.set('status', params.status);
		if (params?.type) queryParams.set('type', params.type);
		if (params?.priority) queryParams.set('priority', params.priority);
		if (params?.assigned_id) queryParams.set('assigned_id', params.assigned_id);
		if (params?.parent_id) queryParams.set('parent_id', params.parent_id);
		if (params?.sort) queryParams.set('sort', params.sort);
		if (params?.order) queryParams.set('order', params.order);
		if (params?.limit !== undefined) queryParams.set('limit', String(params.limit));
		if (params?.offset !== undefined) queryParams.set('offset', String(params.offset));

		const queryString = queryParams.toString();
		const url = buildUrl(
			this.#baseUrl,
			`/task/${TASK_API_VERSION}${queryString ? `?${queryString}` : ''}`
		);
		const signal = AbortSignal.timeout(30_000);

		const res = await this.#adapter.invoke<TaskResponse<ListTasksResult>>(url, {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.task.list',
				attributes: {
					...(params?.status ? { status: params.status } : {}),
					...(params?.type ? { type: params.type } : {}),
					...(params?.priority ? { priority: params.priority } : {}),
				},
			},
		});

		if (res.ok) {
			if (res.data.success) {
				return res.data.data;
			}
			throw new TaskStorageResponseError({
				status: res.response.status,
				message: res.data.message,
			});
		}

		throw await toServiceException('GET', url, res.response);
	}

	async update(id: string, params: UpdateTaskParams): Promise<Task> {
		if (!id || typeof id !== 'string' || id.trim().length === 0) {
			throw new TaskIdRequiredError();
		}

		const url = buildUrl(this.#baseUrl, `/task/${TASK_API_VERSION}/${encodeURIComponent(id)}`);
		const signal = AbortSignal.timeout(30_000);

		const res = await this.#adapter.invoke<TaskResponse<Task>>(url, {
			method: 'PATCH',
			body: safeStringify(params),
			contentType: 'application/json',
			signal,
			telemetry: {
				name: 'agentuity.task.update',
				attributes: { id },
			},
		});

		if (res.ok) {
			if (res.data.success) {
				return res.data.data;
			}
			throw new TaskStorageResponseError({
				status: res.response.status,
				message: res.data.message,
			});
		}

		throw await toServiceException('PATCH', url, res.response);
	}

	async close(id: string): Promise<Task> {
		if (!id || typeof id !== 'string' || id.trim().length === 0) {
			throw new TaskIdRequiredError();
		}

		const url = buildUrl(this.#baseUrl, `/task/${TASK_API_VERSION}/${encodeURIComponent(id)}`);
		const signal = AbortSignal.timeout(30_000);

		const res = await this.#adapter.invoke<TaskResponse<Task>>(url, {
			method: 'DELETE',
			signal,
			telemetry: {
				name: 'agentuity.task.close',
				attributes: { id },
			},
		});

		if (res.ok) {
			if (res.data.success) {
				return res.data.data;
			}
			throw new TaskStorageResponseError({
				status: res.response.status,
				message: res.data.message,
			});
		}

		throw await toServiceException('DELETE', url, res.response);
	}

	async changelog(
		id: string,
		params?: { limit?: number; offset?: number }
	): Promise<TaskChangelogResult> {
		if (!id || typeof id !== 'string' || id.trim().length === 0) {
			throw new TaskIdRequiredError();
		}

		const queryParams = new URLSearchParams();
		if (params?.limit !== undefined) queryParams.set('limit', String(params.limit));
		if (params?.offset !== undefined) queryParams.set('offset', String(params.offset));
		const queryString = queryParams.toString();

		const url = buildUrl(
			this.#baseUrl,
			`/task-changelog/${TASK_API_VERSION}/${encodeURIComponent(id)}${
				queryString ? `?${queryString}` : ''
			}`
		);
		const signal = AbortSignal.timeout(30_000);

		const res = await this.#adapter.invoke<TaskResponse<TaskChangelogResult>>(url, {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.task.changelog',
				attributes: { id },
			},
		});

		if (res.ok) {
			if (res.data.success) {
				return res.data.data;
			}
			throw new TaskStorageResponseError({
				status: res.response.status,
				message: res.data.message,
			});
		}

		throw await toServiceException('GET', url, res.response);
	}
}
