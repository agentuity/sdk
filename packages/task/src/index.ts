export * from './service.ts';
export * from './types.ts';

import {
	TaskStorageService,
	type CreateTaskParams,
	type UpdateTaskParams,
	type ListTasksParams,
	type ListTasksResult,
	type Task,
	type Comment,
	type Tag,
	type TaskChangelogResult,
	type ListCommentsResult,
	type CreateAttachmentParams,
	type PresignUploadResponse,
	type PresignDownloadResponse,
	type ListAttachmentsResult,
	type ListUsersResult,
	type ListProjectsResult,
	type TaskActivityResult,
	type TaskActivityParams,
	type Attachment,
	type EntityRef,
} from './service.ts';
import { getServiceUrls } from '@agentuity/config';
import {
	createServiceAdapter,
	isLogger,
	resolveApiKey,
	resolveRegion,
	resolveServiceUrl,
	type Logger,
} from '@agentuity/client';
import { z } from 'zod';

export const TaskClientOptionsSchema = z.object({
	apiKey: z.string().optional().describe('API key for authentication'),
	url: z.string().optional().describe('Base URL for the Task API'),
	orgId: z.string().optional().describe('Organization ID for multi-tenant operations'),
	logger: z.custom<Logger>(isLogger).optional().describe('Custom logger instance'),
});
export type TaskClientOptions = z.infer<typeof TaskClientOptionsSchema>;

export class TaskClient {
	readonly #service: TaskStorageService;

	constructor(options: TaskClientOptions = {}) {
		const validatedOptions = TaskClientOptionsSchema.parse(options);
		const serviceUrls = getServiceUrls(resolveRegion());
		const url = resolveServiceUrl({
			url: validatedOptions.url,
			envKey: 'AGENTUITY_TASK_URL',
			fallback: serviceUrls.catalyst,
		});
		const { adapter } = createServiceAdapter({
			apiKey: resolveApiKey(validatedOptions.apiKey),
			orgId: validatedOptions.orgId,
			logger: validatedOptions.logger,
		});
		this.#service = new TaskStorageService(url, adapter);
	}

	async create(params: CreateTaskParams): Promise<Task> {
		return this.#service.create(params);
	}

	async get(id: string): Promise<Task | null> {
		return this.#service.get(id);
	}

	async list(params?: ListTasksParams): Promise<ListTasksResult> {
		return this.#service.list(params);
	}

	async update(id: string, params: UpdateTaskParams): Promise<Task> {
		return this.#service.update(id, params);
	}

	async close(id: string): Promise<Task> {
		return this.#service.close(id);
	}

	async softDelete(id: string): Promise<Task> {
		return this.#service.softDelete(id);
	}

	async changelog(
		id: string,
		params?: { limit?: number; offset?: number }
	): Promise<TaskChangelogResult> {
		return this.#service.changelog(id, params);
	}

	async createComment(
		taskId: string,
		body: string,
		userId: string,
		author?: EntityRef
	): Promise<Comment> {
		return this.#service.createComment(taskId, body, userId, author);
	}

	async getComment(commentId: string): Promise<Comment | null> {
		return this.#service.getComment(commentId);
	}

	async updateComment(commentId: string, body: string): Promise<Comment> {
		return this.#service.updateComment(commentId, body);
	}

	async deleteComment(commentId: string): Promise<void> {
		return this.#service.deleteComment(commentId);
	}

	async listComments(
		taskId: string,
		params?: { limit?: number; offset?: number }
	): Promise<ListCommentsResult> {
		return this.#service.listComments(taskId, params);
	}

	async createTag(name: string, color?: string): Promise<Tag> {
		return this.#service.createTag(name, color);
	}

	async getTag(tagId: string): Promise<Tag | null> {
		return this.#service.getTag(tagId);
	}

	async updateTag(tagId: string, name: string, color?: string): Promise<Tag> {
		return this.#service.updateTag(tagId, name, color);
	}

	async deleteTag(tagId: string): Promise<void> {
		return this.#service.deleteTag(tagId);
	}

	async listTags(): Promise<Tag[]> {
		const result = await this.#service.listTags();
		return result.tags;
	}

	async addTagToTask(taskId: string, tagId: string): Promise<void> {
		return this.#service.addTagToTask(taskId, tagId);
	}

	async removeTagFromTask(taskId: string, tagId: string): Promise<void> {
		return this.#service.removeTagFromTask(taskId, tagId);
	}

	async listTagsForTask(taskId: string): Promise<Tag[]> {
		return this.#service.listTagsForTask(taskId);
	}

	async uploadAttachment(
		taskId: string,
		params: CreateAttachmentParams
	): Promise<PresignUploadResponse> {
		return this.#service.uploadAttachment(taskId, params);
	}

	async confirmAttachment(attachmentId: string): Promise<Attachment> {
		return this.#service.confirmAttachment(attachmentId);
	}

	async downloadAttachment(attachmentId: string): Promise<PresignDownloadResponse> {
		return this.#service.downloadAttachment(attachmentId);
	}

	async listAttachments(taskId: string): Promise<ListAttachmentsResult> {
		return this.#service.listAttachments(taskId);
	}

	async deleteAttachment(attachmentId: string): Promise<void> {
		return this.#service.deleteAttachment(attachmentId);
	}

	async listUsers(): Promise<ListUsersResult> {
		return this.#service.listUsers();
	}

	async listProjects(): Promise<ListProjectsResult> {
		return this.#service.listProjects();
	}

	async getActivity(params?: TaskActivityParams): Promise<TaskActivityResult> {
		return this.#service.getActivity(params);
	}
}
