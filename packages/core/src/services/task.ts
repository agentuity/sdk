import { FetchAdapter } from './adapter.ts';
import { buildUrl, toServiceException } from './_util.ts';
import { StructuredError } from '../error.ts';
import { safeStringify } from '../json.ts';

// Task type enums
export type TaskPriority = 'high' | 'medium' | 'low' | 'none';
export type TaskType = 'epic' | 'feature' | 'enhancement' | 'bug' | 'task';
export type TaskStatus = 'open' | 'in_progress' | 'closed' | 'done' | 'cancelled';

// Entity reference (user/project with id + name)
export interface EntityRef {
	id: string;
	name: string;
}

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
	creator?: EntityRef;
	assignee?: EntityRef;
	closer?: EntityRef;
	project?: EntityRef;
	cancelled_date?: string;
	deleted: boolean;
	tags?: Tag[];
	comments?: Comment[];
}

// Comment object (returned from API)
export interface Comment {
	id: string;
	created_at: string;
	updated_at: string;
	task_id: string;
	user_id: string;
	author?: EntityRef;
	body: string;
}

// Tag object (returned from API)
export interface Tag {
	id: string;
	created_at: string;
	name: string;
	color?: string;
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
	creator?: EntityRef;
	assignee?: EntityRef;
	project?: EntityRef;
	tag_ids?: string[];
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
	assignee?: EntityRef;
	closer?: EntityRef;
	project?: EntityRef;
}

export interface ListTasksParams {
	status?: TaskStatus;
	type?: TaskType;
	priority?: TaskPriority;
	assigned_id?: string;
	parent_id?: string;
	project_id?: string;
	tag_id?: string;
	deleted?: boolean;
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

export interface ListCommentsResult {
	comments: Comment[];
	total: number;
	limit: number;
	offset: number;
}

export interface ListTagsResult {
	tags: Tag[];
}

// Attachment types
export interface Attachment {
	id: string;
	created_at: string;
	task_id: string;
	user_id: string;
	author?: EntityRef;
	filename: string;
	content_type?: string;
	size?: number;
}

export interface CreateAttachmentParams {
	filename: string;
	content_type?: string;
	size?: number;
}

export interface PresignUploadResponse {
	attachment: Attachment;
	presigned_url: string;
	expiry_seconds: number;
}

export interface PresignDownloadResponse {
	presigned_url: string;
	expiry_seconds: number;
}

export interface ListAttachmentsResult {
	attachments: Attachment[];
	total: number;
}

export interface ListUsersResult {
	users: EntityRef[];
}

export interface ListProjectsResult {
	projects: EntityRef[];
}

export interface TaskActivityParams {
	days?: number; // min 7, max 365, default 90
}

export interface TaskActivityDataPoint {
	date: string; // "2026-02-28"
	open: number;
	inProgress: number;
	done: number;
	closed: number;
	cancelled: number;
}

export interface TaskActivityResult {
	activity: TaskActivityDataPoint[];
	days: number;
}

export interface TaskStorage {
	create(params: CreateTaskParams): Promise<Task>;
	get(id: string): Promise<Task | null>;
	list(params?: ListTasksParams): Promise<ListTasksResult>;
	update(id: string, params: UpdateTaskParams): Promise<Task>;
	close(id: string): Promise<Task>;
	softDelete(id: string): Promise<Task>;
	changelog(
		id: string,
		params?: { limit?: number; offset?: number }
	): Promise<TaskChangelogResult>;
	createComment(
		taskId: string,
		body: string,
		userId: string,
		author?: EntityRef
	): Promise<Comment>;
	getComment(commentId: string): Promise<Comment>;
	updateComment(commentId: string, body: string): Promise<Comment>;
	deleteComment(commentId: string): Promise<void>;
	listComments(
		taskId: string,
		params?: { limit?: number; offset?: number }
	): Promise<ListCommentsResult>;
	createTag(name: string, color?: string): Promise<Tag>;
	getTag(tagId: string): Promise<Tag>;
	updateTag(tagId: string, name: string, color?: string): Promise<Tag>;
	deleteTag(tagId: string): Promise<void>;
	listTags(): Promise<ListTagsResult>;
	addTagToTask(taskId: string, tagId: string): Promise<void>;
	removeTagFromTask(taskId: string, tagId: string): Promise<void>;
	listTagsForTask(taskId: string): Promise<Tag[]>;
	uploadAttachment(taskId: string, params: CreateAttachmentParams): Promise<PresignUploadResponse>;
	confirmAttachment(attachmentId: string): Promise<Attachment>;
	downloadAttachment(attachmentId: string): Promise<PresignDownloadResponse>;
	listAttachments(taskId: string): Promise<ListAttachmentsResult>;
	deleteAttachment(attachmentId: string): Promise<void>;
	listUsers(): Promise<ListUsersResult>;
	listProjects(): Promise<ListProjectsResult>;
	getActivity(params?: TaskActivityParams): Promise<TaskActivityResult>;
}

const TASK_API_VERSION = '2026-02-24';
const TASK_ACTIVITY_API_VERSION = '2026-02-28';

const TaskIdRequiredError = StructuredError(
	'TaskIdRequiredError',
	'Task ID is required and must be a non-empty string'
);

const TaskTitleRequiredError = StructuredError(
	'TaskTitleRequiredError',
	'Task title is required and must be a non-empty string'
);

const CommentIdRequiredError = StructuredError(
	'CommentIdRequiredError',
	'Comment ID is required and must be a non-empty string'
);

const CommentBodyRequiredError = StructuredError(
	'CommentBodyRequiredError',
	'Comment body is required and must be a non-empty string'
);

const TagIdRequiredError = StructuredError(
	'TagIdRequiredError',
	'Tag ID is required and must be a non-empty string'
);

const TagNameRequiredError = StructuredError(
	'TagNameRequiredError',
	'Tag name is required and must be a non-empty string'
);

const AttachmentIdRequiredError = StructuredError(
	'AttachmentIdRequiredError',
	'Attachment ID is required and must be a non-empty string'
);

const UserIdRequiredError = StructuredError(
	'UserIdRequiredError',
	'User ID is required and must be a non-empty string'
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
		if (params?.project_id) queryParams.set('project_id', params.project_id);
		if (params?.tag_id) queryParams.set('tag_id', params.tag_id);
		if (params?.deleted !== undefined) queryParams.set('deleted', String(params.deleted));
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
		if (
			params.title !== undefined &&
			(typeof params.title !== 'string' || params.title.trim().length === 0)
		) {
			throw new TaskTitleRequiredError();
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
			`/task/changelog/${TASK_API_VERSION}/${encodeURIComponent(id)}${
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

	async softDelete(id: string): Promise<Task> {
		if (!id || typeof id !== 'string' || id.trim().length === 0) {
			throw new TaskIdRequiredError();
		}

		const url = buildUrl(
			this.#baseUrl,
			`/task/delete/${TASK_API_VERSION}/${encodeURIComponent(id)}`
		);
		const signal = AbortSignal.timeout(30_000);

		const res = await this.#adapter.invoke<TaskResponse<Task>>(url, {
			method: 'POST',
			signal,
			telemetry: {
				name: 'agentuity.task.softDelete',
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

		throw await toServiceException('POST', url, res.response);
	}

	async createComment(
		taskId: string,
		body: string,
		userId: string,
		author?: EntityRef
	): Promise<Comment> {
		if (!taskId || typeof taskId !== 'string' || taskId.trim().length === 0) {
			throw new TaskIdRequiredError();
		}
		if (!body || typeof body !== 'string' || body.trim().length === 0) {
			throw new CommentBodyRequiredError();
		}
		if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
			throw new UserIdRequiredError();
		}

		const url = buildUrl(
			this.#baseUrl,
			`/task/comments/create/${TASK_API_VERSION}/${encodeURIComponent(taskId)}`
		);
		const signal = AbortSignal.timeout(30_000);

		const commentBody: Record<string, unknown> = { body, user_id: userId };
		if (author) commentBody.author = author;

		const res = await this.#adapter.invoke<TaskResponse<Comment>>(url, {
			method: 'POST',
			body: safeStringify(commentBody),
			contentType: 'application/json',
			signal,
			telemetry: {
				name: 'agentuity.task.createComment',
				attributes: { taskId },
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

	async getComment(commentId: string): Promise<Comment> {
		if (!commentId || typeof commentId !== 'string' || commentId.trim().length === 0) {
			throw new CommentIdRequiredError();
		}

		const url = buildUrl(
			this.#baseUrl,
			`/task/comments/get/${TASK_API_VERSION}/${encodeURIComponent(commentId)}`
		);
		const signal = AbortSignal.timeout(30_000);

		const res = await this.#adapter.invoke<TaskResponse<Comment>>(url, {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.task.getComment',
				attributes: { commentId },
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

	async updateComment(commentId: string, body: string): Promise<Comment> {
		if (!commentId || typeof commentId !== 'string' || commentId.trim().length === 0) {
			throw new CommentIdRequiredError();
		}
		if (!body || typeof body !== 'string' || body.trim().length === 0) {
			throw new CommentBodyRequiredError();
		}

		const url = buildUrl(
			this.#baseUrl,
			`/task/comments/update/${TASK_API_VERSION}/${encodeURIComponent(commentId)}`
		);
		const signal = AbortSignal.timeout(30_000);

		const res = await this.#adapter.invoke<TaskResponse<Comment>>(url, {
			method: 'PATCH',
			body: safeStringify({ body }),
			contentType: 'application/json',
			signal,
			telemetry: {
				name: 'agentuity.task.updateComment',
				attributes: { commentId },
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

	async deleteComment(commentId: string): Promise<void> {
		if (!commentId || typeof commentId !== 'string' || commentId.trim().length === 0) {
			throw new CommentIdRequiredError();
		}

		const url = buildUrl(
			this.#baseUrl,
			`/task/comments/delete/${TASK_API_VERSION}/${encodeURIComponent(commentId)}`
		);
		const signal = AbortSignal.timeout(30_000);

		const res = await this.#adapter.invoke<TaskResponse<void>>(url, {
			method: 'DELETE',
			signal,
			telemetry: {
				name: 'agentuity.task.deleteComment',
				attributes: { commentId },
			},
		});

		if (res.ok) {
			if (res.data?.success === false) {
				throw new TaskStorageResponseError({
					status: res.response.status,
					message: res.data.message ?? 'Operation failed',
				});
			}
			return;
		}

		throw await toServiceException('DELETE', url, res.response);
	}

	async listComments(
		taskId: string,
		params?: { limit?: number; offset?: number }
	): Promise<ListCommentsResult> {
		if (!taskId || typeof taskId !== 'string' || taskId.trim().length === 0) {
			throw new TaskIdRequiredError();
		}

		const queryParams = new URLSearchParams();
		if (params?.limit !== undefined) queryParams.set('limit', String(params.limit));
		if (params?.offset !== undefined) queryParams.set('offset', String(params.offset));
		const queryString = queryParams.toString();

		const url = buildUrl(
			this.#baseUrl,
			`/task/comments/list/${TASK_API_VERSION}/${encodeURIComponent(taskId)}${
				queryString ? `?${queryString}` : ''
			}`
		);
		const signal = AbortSignal.timeout(30_000);

		const res = await this.#adapter.invoke<TaskResponse<ListCommentsResult>>(url, {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.task.listComments',
				attributes: { taskId },
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

	async createTag(name: string, color?: string): Promise<Tag> {
		if (!name || typeof name !== 'string' || name.trim().length === 0) {
			throw new TagNameRequiredError();
		}

		const url = buildUrl(this.#baseUrl, `/task/tags/create/${TASK_API_VERSION}`);
		const signal = AbortSignal.timeout(30_000);

		const body: Record<string, string> = { name };
		if (color !== undefined) body.color = color;

		const res = await this.#adapter.invoke<TaskResponse<Tag>>(url, {
			method: 'POST',
			body: safeStringify(body),
			contentType: 'application/json',
			signal,
			telemetry: {
				name: 'agentuity.task.createTag',
				attributes: { tagName: name },
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

	async getTag(tagId: string): Promise<Tag> {
		if (!tagId || typeof tagId !== 'string' || tagId.trim().length === 0) {
			throw new TagIdRequiredError();
		}

		const url = buildUrl(
			this.#baseUrl,
			`/task/tags/get/${TASK_API_VERSION}/${encodeURIComponent(tagId)}`
		);
		const signal = AbortSignal.timeout(30_000);

		const res = await this.#adapter.invoke<TaskResponse<Tag>>(url, {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.task.getTag',
				attributes: { tagId },
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

	async updateTag(tagId: string, name: string, color?: string): Promise<Tag> {
		if (!tagId || typeof tagId !== 'string' || tagId.trim().length === 0) {
			throw new TagIdRequiredError();
		}
		if (!name || typeof name !== 'string' || name.trim().length === 0) {
			throw new TagNameRequiredError();
		}

		const url = buildUrl(
			this.#baseUrl,
			`/task/tags/update/${TASK_API_VERSION}/${encodeURIComponent(tagId)}`
		);
		const signal = AbortSignal.timeout(30_000);

		const body: Record<string, string> = { name };
		if (color !== undefined) body.color = color;

		const res = await this.#adapter.invoke<TaskResponse<Tag>>(url, {
			method: 'PATCH',
			body: safeStringify(body),
			contentType: 'application/json',
			signal,
			telemetry: {
				name: 'agentuity.task.updateTag',
				attributes: { tagId },
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

	async deleteTag(tagId: string): Promise<void> {
		if (!tagId || typeof tagId !== 'string' || tagId.trim().length === 0) {
			throw new TagIdRequiredError();
		}

		const url = buildUrl(
			this.#baseUrl,
			`/task/tags/delete/${TASK_API_VERSION}/${encodeURIComponent(tagId)}`
		);
		const signal = AbortSignal.timeout(30_000);

		const res = await this.#adapter.invoke<TaskResponse<void>>(url, {
			method: 'DELETE',
			signal,
			telemetry: {
				name: 'agentuity.task.deleteTag',
				attributes: { tagId },
			},
		});

		if (res.ok) {
			if (res.data?.success === false) {
				throw new TaskStorageResponseError({
					status: res.response.status,
					message: res.data.message ?? 'Operation failed',
				});
			}
			return;
		}

		throw await toServiceException('DELETE', url, res.response);
	}

	async listTags(): Promise<ListTagsResult> {
		const url = buildUrl(this.#baseUrl, `/task/tags/list/${TASK_API_VERSION}`);
		const signal = AbortSignal.timeout(30_000);

		const res = await this.#adapter.invoke<TaskResponse<ListTagsResult>>(url, {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.task.listTags',
				attributes: {},
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

	async addTagToTask(taskId: string, tagId: string): Promise<void> {
		if (!taskId || typeof taskId !== 'string' || taskId.trim().length === 0) {
			throw new TaskIdRequiredError();
		}
		if (!tagId || typeof tagId !== 'string' || tagId.trim().length === 0) {
			throw new TagIdRequiredError();
		}

		const url = buildUrl(
			this.#baseUrl,
			`/task/tags/add/${TASK_API_VERSION}/${encodeURIComponent(taskId)}/${encodeURIComponent(tagId)}`
		);
		const signal = AbortSignal.timeout(30_000);

		const res = await this.#adapter.invoke<TaskResponse<void>>(url, {
			method: 'POST',
			signal,
			telemetry: {
				name: 'agentuity.task.addTagToTask',
				attributes: { taskId, tagId },
			},
		});

		if (res.ok) {
			if (res.data?.success === false) {
				throw new TaskStorageResponseError({
					status: res.response.status,
					message: res.data.message ?? 'Operation failed',
				});
			}
			return;
		}

		throw await toServiceException('POST', url, res.response);
	}

	async removeTagFromTask(taskId: string, tagId: string): Promise<void> {
		if (!taskId || typeof taskId !== 'string' || taskId.trim().length === 0) {
			throw new TaskIdRequiredError();
		}
		if (!tagId || typeof tagId !== 'string' || tagId.trim().length === 0) {
			throw new TagIdRequiredError();
		}

		const url = buildUrl(
			this.#baseUrl,
			`/task/tags/remove/${TASK_API_VERSION}/${encodeURIComponent(taskId)}/${encodeURIComponent(tagId)}`
		);
		const signal = AbortSignal.timeout(30_000);

		const res = await this.#adapter.invoke<TaskResponse<void>>(url, {
			method: 'DELETE',
			signal,
			telemetry: {
				name: 'agentuity.task.removeTagFromTask',
				attributes: { taskId, tagId },
			},
		});

		if (res.ok) {
			if (res.data?.success === false) {
				throw new TaskStorageResponseError({
					status: res.response.status,
					message: res.data.message ?? 'Operation failed',
				});
			}
			return;
		}

		throw await toServiceException('DELETE', url, res.response);
	}

	async listTagsForTask(taskId: string): Promise<Tag[]> {
		if (!taskId || typeof taskId !== 'string' || taskId.trim().length === 0) {
			throw new TaskIdRequiredError();
		}

		const url = buildUrl(
			this.#baseUrl,
			`/task/tags/task/${TASK_API_VERSION}/${encodeURIComponent(taskId)}`
		);
		const signal = AbortSignal.timeout(30_000);

		const res = await this.#adapter.invoke<TaskResponse<Tag[]>>(url, {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.task.listTagsForTask',
				attributes: { taskId },
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

	// Attachment methods

	async uploadAttachment(
		taskId: string,
		params: CreateAttachmentParams
	): Promise<PresignUploadResponse> {
		if (!taskId || typeof taskId !== 'string' || taskId.trim().length === 0) {
			throw new TaskIdRequiredError();
		}

		const url = buildUrl(
			this.#baseUrl,
			`/task/attachments/presign-upload/${TASK_API_VERSION}/${encodeURIComponent(taskId)}`
		);
		const signal = AbortSignal.timeout(30_000);

		const res = await this.#adapter.invoke<TaskResponse<PresignUploadResponse>>(url, {
			method: 'POST',
			body: safeStringify(params),
			contentType: 'application/json',
			signal,
			telemetry: {
				name: 'agentuity.task.uploadAttachment',
				attributes: { taskId },
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

	async confirmAttachment(attachmentId: string): Promise<Attachment> {
		if (!attachmentId || typeof attachmentId !== 'string' || attachmentId.trim().length === 0) {
			throw new AttachmentIdRequiredError();
		}

		const url = buildUrl(
			this.#baseUrl,
			`/task/attachments/confirm/${TASK_API_VERSION}/${encodeURIComponent(attachmentId)}`
		);
		const signal = AbortSignal.timeout(30_000);

		const res = await this.#adapter.invoke<TaskResponse<Attachment>>(url, {
			method: 'POST',
			signal,
			telemetry: {
				name: 'agentuity.task.confirmAttachment',
				attributes: { attachmentId },
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

	async downloadAttachment(attachmentId: string): Promise<PresignDownloadResponse> {
		if (!attachmentId || typeof attachmentId !== 'string' || attachmentId.trim().length === 0) {
			throw new AttachmentIdRequiredError();
		}

		const url = buildUrl(
			this.#baseUrl,
			`/task/attachments/presign-download/${TASK_API_VERSION}/${encodeURIComponent(attachmentId)}`
		);
		const signal = AbortSignal.timeout(30_000);

		const res = await this.#adapter.invoke<TaskResponse<PresignDownloadResponse>>(url, {
			method: 'POST',
			signal,
			telemetry: {
				name: 'agentuity.task.downloadAttachment',
				attributes: { attachmentId },
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

	async listAttachments(taskId: string): Promise<ListAttachmentsResult> {
		if (!taskId || typeof taskId !== 'string' || taskId.trim().length === 0) {
			throw new TaskIdRequiredError();
		}

		const url = buildUrl(
			this.#baseUrl,
			`/task/attachments/list/${TASK_API_VERSION}/${encodeURIComponent(taskId)}`
		);
		const signal = AbortSignal.timeout(30_000);

		const res = await this.#adapter.invoke<TaskResponse<ListAttachmentsResult>>(url, {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.task.listAttachments',
				attributes: { taskId },
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

	async deleteAttachment(attachmentId: string): Promise<void> {
		if (!attachmentId || typeof attachmentId !== 'string' || attachmentId.trim().length === 0) {
			throw new AttachmentIdRequiredError();
		}

		const url = buildUrl(
			this.#baseUrl,
			`/task/attachments/delete/${TASK_API_VERSION}/${encodeURIComponent(attachmentId)}`
		);
		const signal = AbortSignal.timeout(30_000);

		const res = await this.#adapter.invoke<TaskResponse<void>>(url, {
			method: 'DELETE',
			signal,
			telemetry: {
				name: 'agentuity.task.deleteAttachment',
				attributes: { attachmentId },
			},
		});

		if (res.ok) {
			if (res.data?.success === false) {
				throw new TaskStorageResponseError({
					status: res.response.status,
					message: res.data.message ?? 'Operation failed',
				});
			}
			return;
		}

		throw await toServiceException('DELETE', url, res.response);
	}

	async listUsers(): Promise<ListUsersResult> {
		const url = buildUrl(this.#baseUrl, `/task/users/${TASK_API_VERSION}`);
		const signal = AbortSignal.timeout(30_000);

		const res = await this.#adapter.invoke<TaskResponse<ListUsersResult>>(url, {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.task.listUsers',
				attributes: {},
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

	async listProjects(): Promise<ListProjectsResult> {
		const url = buildUrl(this.#baseUrl, `/task/projects/${TASK_API_VERSION}`);
		const signal = AbortSignal.timeout(30_000);

		const res = await this.#adapter.invoke<TaskResponse<ListProjectsResult>>(url, {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.task.listProjects',
				attributes: {},
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

	async getActivity(params?: TaskActivityParams): Promise<TaskActivityResult> {
		const queryParams = new URLSearchParams();
		if (params?.days !== undefined) queryParams.set('days', String(params.days));

		const queryString = queryParams.toString();
		const url = buildUrl(
			this.#baseUrl,
			`/task/activity/${TASK_ACTIVITY_API_VERSION}${queryString ? `?${queryString}` : ''}`
		);
		const signal = AbortSignal.timeout(30_000);

		const res = await this.#adapter.invoke<TaskResponse<TaskActivityResult>>(url, {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.task.activity',
				attributes: {
					...(params?.days !== undefined ? { days: String(params.days) } : {}),
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
}
