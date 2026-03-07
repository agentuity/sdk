import { FetchAdapter } from '../adapter.ts';
import { buildUrl, toServiceException } from '../_util.ts';
import { StructuredError } from '../../error.ts';
import { safeStringify } from '../../json.ts';
import { z } from 'zod';

/**
 * Priority level for a task, from highest (`'high'`) to no priority (`'none'`).
 */
export const TaskPrioritySchema = z.enum(['high', 'medium', 'low', 'none']);

export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

/**
 * The classification of a task.
 *
 * - `'epic'` — Large initiatives that span multiple features or tasks.
 * - `'feature'` — New capabilities to be built.
 * - `'enhancement'` — Improvements to existing features.
 * - `'bug'` — Defects to be fixed.
 * - `'task'` — General work items.
 */
export const TaskTypeSchema = z.enum(['epic', 'feature', 'enhancement', 'bug', 'task']);

export type TaskType = z.infer<typeof TaskTypeSchema>;

/**
 * The lifecycle status of a task.
 *
 * - `'open'` — Created, not yet started.
 * - `'in_progress'` — Actively being worked on.
 * - `'done'` — Work completed.
 * - `'closed'` — Resolved and closed.
 * - `'cancelled'` — Abandoned.
 */
export const TaskStatusSchema = z.enum(['open', 'in_progress', 'closed', 'done', 'cancelled']);

export type TaskStatus = z.infer<typeof TaskStatusSchema>;

/**
 * A lightweight reference to a user or project entity, containing just the ID
 * and display name. Used for creator, assignee, closer, and project associations.
 */
export const EntityRefSchema = z.object({
	id: z.string().describe('Unique identifier of the referenced entity.'),
	name: z.string().describe('Human-readable display name of the entity.'),
});

export type EntityRef = z.infer<typeof EntityRefSchema>;

/**
 * The type of user entity.
 *
 * - `'human'` — A human user.
 * - `'agent'` — An AI agent.
 */
export const UserTypeSchema = z.enum(['human', 'agent']);

export type UserType = z.infer<typeof UserTypeSchema>;

/**
 * A reference to a user entity with type discrimination.
 * Extends {@link EntityRef} with a {@link UserEntityRef.type | type} field
 * to distinguish between human users and AI agents.
 */
export const UserEntityRefSchema = EntityRefSchema.extend({
	type: UserTypeSchema.optional().describe(
		"The type of user. Defaults to `'human'` if not specified."
	),
});

export type UserEntityRef = z.infer<typeof UserEntityRefSchema>;

/**
 * A work item in the task management system.
 *
 * Tasks can represent epics, features, bugs, enhancements, or generic tasks.
 * They support hierarchical organization via {@link Task.parent_id | parent_id},
 * assignment tracking, and lifecycle management through status transitions.
 *
 * @remarks
 * Status transitions are tracked automatically — when a task moves to a new status,
 * the corresponding date field (e.g., {@link Task.open_date | open_date},
 * {@link Task.in_progress_date | in_progress_date}) is set by the server.
 */
export const TaskSchema = z.object({
	id: z.string().describe('Unique identifier for the task.'),
	created_at: z.string().describe('ISO 8601 timestamp when the task was created.'),
	updated_at: z.string().describe('ISO 8601 timestamp when the task was last modified.'),
	title: z.string().describe('The task title.'),
	description: z.string().optional().describe('Detailed description of the task.'),
	metadata: z
		.record(z.string(), z.unknown())
		.optional()
		.describe('Arbitrary key-value metadata attached to the task.'),
	priority: TaskPrioritySchema.describe('The priority level of the task.'),
	parent_id: z
		.string()
		.optional()
		.describe('ID of the parent task, enabling hierarchical task organization'),
	type: TaskTypeSchema.describe('The classification of this task.'),
	status: TaskStatusSchema.describe('The current lifecycle status of the task.'),
	open_date: z
		.string()
		.optional()
		.describe("ISO 8601 timestamp when the task was moved to `'open'` status."),
	in_progress_date: z
		.string()
		.optional()
		.describe("ISO 8601 timestamp when the task was moved to `'in_progress'` status."),
	closed_date: z.string().optional().describe('ISO 8601 timestamp when the task was closed.'),
	created_id: z.string().describe('ID of the user who created the task.'),
	assigned_id: z.string().optional().describe('ID of the user the task is assigned to.'),
	closed_id: z.string().optional().describe('ID of the user who closed the task.'),
	creator: z
		.lazy(() => UserEntityRefSchema)
		.optional()
		.describe('Reference to the user who created the task.'),
	assignee: z
		.lazy(() => UserEntityRefSchema)
		.optional()
		.describe('Reference to the user the task is assigned to.'),
	closer: z
		.lazy(() => UserEntityRefSchema)
		.optional()
		.describe('Reference to the user who closed the task.'),
	project: EntityRefSchema.optional().describe('Reference to the project this task belongs to.'),
	cancelled_date: z
		.string()
		.optional()
		.describe('ISO 8601 timestamp when the task was cancelled.'),
	tags: z
		.lazy(() => z.array(TagSchema))
		.optional()
		.describe('Array of tags associated with this task.'),
	comments: z
		.lazy(() => z.array(CommentSchema))
		.optional()
		.describe('Array of comments on this task.'),
});

export type Task = z.infer<typeof TaskSchema>;

/**
 * A comment on a task, supporting threaded discussion.
 */
export const CommentSchema = z.object({
	id: z.string().describe('Unique identifier for the comment.'),
	created_at: z.string().describe('ISO 8601 timestamp when the comment was created.'),
	updated_at: z.string().describe('ISO 8601 timestamp when the comment was last edited.'),
	task_id: z.string().describe('ID of the task this comment belongs to.'),
	user_id: z.string().describe('ID of the user who authored the comment.'),
	author: UserEntityRefSchema.optional().describe(
		'Reference to the comment author with display name.'
	),
	body: z.string().describe('The comment text content.'),
});

export type Comment = z.infer<typeof CommentSchema>;

/**
 * A label that can be applied to tasks for categorization and filtering.
 */
export const TagSchema = z.object({
	id: z.string().describe('Unique identifier for the tag.'),
	created_at: z.string().describe('ISO 8601 timestamp when the tag was created.'),
	name: z.string().describe('Display name of the tag.'),
	color: z.string().optional().describe('Optional hex color code for the tag.'),
});

export type Tag = z.infer<typeof TagSchema>;

/**
 * A record of a single field change on a task, providing an audit trail.
 */
export const TaskChangelogEntrySchema = z.object({
	id: z.string().describe('Unique identifier for the changelog entry.'),
	created_at: z.string().describe('ISO 8601 timestamp when the change occurred.'),
	task_id: z.string().describe('ID of the task that was changed.'),
	field: z.string().describe('Name of the field that was changed.'),
	old_value: z
		.string()
		.optional()
		.describe(
			'The previous value of the field (as a string), or `undefined` if the field was newly set.'
		),
	new_value: z
		.string()
		.optional()
		.describe(
			'The new value of the field (as a string), or `undefined` if the field was cleared.'
		),
});

export type TaskChangelogEntry = z.infer<typeof TaskChangelogEntrySchema>;

/**
 * Parameters for creating a new task.
 */
export const CreateTaskParamsSchema = z.object({
	/**
	 * The task title (required).
	 *
	 * @remarks Must be non-empty and at most 1024 characters.
	 */
	title: z.string().describe('The task title (required).'),

	/**
	 * Detailed description of the task.
	 *
	 * @remarks Maximum 65,536 characters.
	 */
	description: z.string().optional().describe('Detailed description of the task.'),

	/** Arbitrary key-value metadata. */
	metadata: z.record(z.string(), z.unknown()).optional().describe('Arbitrary key-value metadata.'),

	/**
	 * Priority level. Defaults to `'none'` if not provided.
	 *
	 * @default 'none'
	 */
	priority: TaskPrioritySchema.optional().describe(
		"Priority level. Defaults to `'none'` if not provided."
	),

	/** ID of the parent task for hierarchical organization. */
	parent_id: z
		.string()
		.optional()
		.describe('ID of the parent task for hierarchical organization.'),

	/** The task classification (required). */
	type: TaskTypeSchema.describe('The task classification (required).'),

	/**
	 * Initial status. Defaults to `'open'` if not provided.
	 *
	 * @default 'open'
	 */
	status: TaskStatusSchema.optional().describe(
		"Initial status. Defaults to `'open'` if not provided."
	),

	/**
	 * ID of the creator.
	 *
	 * @remarks Legacy field; prefer {@link CreateTaskParams.creator | creator}.
	 */
	created_id: z.string().describe('ID of the creator.'),

	/**
	 * ID of the assigned user.
	 *
	 * @remarks Legacy field; prefer {@link CreateTaskParams.assignee | assignee}.
	 */
	assigned_id: z.string().optional().describe('ID of the assigned user.'),

	/** Reference to the user creating the task (id, name, and optional type). */
	creator: UserEntityRefSchema.optional().describe(
		'Reference to the user creating the task (id, name, and optional type).'
	),

	/** Reference to the user being assigned the task. */
	assignee: UserEntityRefSchema.optional().describe(
		'Reference to the user being assigned the task.'
	),

	/** Reference to the project this task belongs to. */
	project: EntityRefSchema.optional().describe('Reference to the project this task belongs to.'),

	/** Array of tag IDs to associate with the task at creation. */
	tag_ids: z
		.array(z.string())
		.optional()
		.describe('Array of tag IDs to associate with the task at creation.'),
});

export type CreateTaskParams = z.infer<typeof CreateTaskParamsSchema>;

/**
 * Parameters for partially updating an existing task.
 *
 * @remarks Only provided fields are modified; omitted fields remain unchanged.
 */
export const UpdateTaskParamsSchema = z.object({
	/**
	 * Updated task title.
	 *
	 * @remarks Must be non-empty and at most 1024 characters if provided.
	 */
	title: z.string().optional().describe('Updated task title.'),

	/**
	 * Updated description.
	 *
	 * @remarks Maximum 65,536 characters.
	 */
	description: z.string().optional().describe('Updated description.'),

	/** Updated key-value metadata. */
	metadata: z.record(z.string(), z.unknown()).optional().describe('Updated key-value metadata.'),

	/** Updated priority level. */
	priority: TaskPrioritySchema.optional().describe('Updated priority level.'),

	/** Updated parent task ID. */
	parent_id: z.string().optional().describe('Updated parent task ID.'),

	/** Updated task classification. */
	type: TaskTypeSchema.optional().describe('Updated task classification.'),

	/** Updated lifecycle status. */
	status: TaskStatusSchema.optional().describe('Updated lifecycle status.'),

	/**
	 * Updated assigned user ID.
	 *
	 * @remarks Legacy field; prefer {@link UpdateTaskParams.assignee | assignee}.
	 */
	assigned_id: z.string().optional().describe('Updated assigned user ID.'),

	/**
	 * ID of the user closing the task.
	 *
	 * @remarks Legacy field; prefer {@link UpdateTaskParams.closer | closer}.
	 */
	closed_id: z.string().optional().describe('ID of the user closing the task.'),

	/** Reference to the user being assigned the task. */
	assignee: UserEntityRefSchema.optional().describe(
		'Reference to the user being assigned the task.'
	),

	/** Reference to the user closing the task. */
	closer: UserEntityRefSchema.optional().describe('Reference to the user closing the task.'),

	/** Reference to the project this task belongs to. */
	project: EntityRefSchema.optional().describe('Reference to the project this task belongs to.'),
});

export type UpdateTaskParams = z.infer<typeof UpdateTaskParamsSchema>;

/**
 * Parameters for filtering and paginating the task list.
 */
export const ListTasksParamsSchema = z.object({
	/** Filter by task status. */
	status: TaskStatusSchema.optional().describe('Filter by task status.'),

	/** Filter by task type. */
	type: TaskTypeSchema.optional().describe('Filter by task type.'),

	/** Filter by priority level. */
	priority: TaskPrioritySchema.optional().describe('Filter by priority level.'),

	/** Filter by assigned user ID. */
	assigned_id: z.string().optional().describe('Filter by assigned user ID.'),

	/** Filter by creator user ID. */
	created_id: z.string().optional().describe('Filter by creator user ID.'),

	/** Filter by parent task ID (get subtasks). */
	parent_id: z.string().optional().describe('Filter by parent task ID (get subtasks).'),

	/** Filter by project ID. */
	project_id: z.string().optional().describe('Filter by project ID.'),

	/** Filter by tag ID. */
	tag_id: z.string().optional().describe('Filter by tag ID.'),

	/**
	 * Filter for soft-deleted tasks.
	 *
	 * @default false
	 */
	deleted: z.boolean().optional().describe('Filter for soft-deleted tasks.'),

	/**
	 * Sort field. Prefix with `-` for descending order.
	 *
	 * @remarks Supported values: `'created_at'`, `'updated_at'`, `'priority'`.
	 * Prefix with `-` for descending (e.g., `'-created_at'`).
	 */
	sort: z.string().optional().describe('Sort field. Prefix with `-` for descending order.'),

	/** Sort direction: `'asc'` or `'desc'`. */
	order: z.enum(['asc', 'desc']).optional().describe("Sort direction: `'asc'` or `'desc'`."),

	/** Maximum number of results to return. */
	limit: z.number().optional().describe('Maximum number of results to return.'),

	/** Number of results to skip for pagination. */
	offset: z.number().optional().describe('Number of results to skip for pagination.'),
});

export type ListTasksParams = z.infer<typeof ListTasksParamsSchema>;

/**
 * Paginated list of tasks with total count.
 */
export const ListTasksResultSchema = z.object({
	/** Array of tasks matching the query. */
	tasks: z.array(TaskSchema).describe('Array of tasks matching the query.'),

	/** Total number of tasks matching the filters (before pagination). */
	total: z.number().describe('Total number of tasks matching the filters (before pagination).'),

	/** The limit that was applied. */
	limit: z.number().describe('The limit that was applied.'),

	/** The offset that was applied. */
	offset: z.number().describe('The offset that was applied.'),
});

export type ListTasksResult = z.infer<typeof ListTasksResultSchema>;

/**
 * Parameters for batch-deleting tasks by filter.
 * At least one filter must be provided.
 */
export const BatchDeleteTasksParamsSchema = z.object({
	/** Filter by task status. */
	status: TaskStatusSchema.optional().describe('Filter by task status.'),

	/** Filter by task type. */
	type: TaskTypeSchema.optional().describe('Filter by task type.'),

	/** Filter by priority level. */
	priority: TaskPrioritySchema.optional().describe('Filter by priority level.'),

	/** Filter by parent task ID (delete subtasks). */
	parent_id: z.string().optional().describe('Filter by parent task ID (delete subtasks).'),

	/** Filter by creator ID. */
	created_id: z.string().optional().describe('Filter by creator ID.'),

	/**
	 * Delete tasks older than this duration.
	 * Accepts Go-style duration strings: `'30m'`, `'24h'`, `'7d'`, `'2w'`.
	 */
	older_than: z.string().optional().describe('Delete tasks older than this duration.'),

	/**
	 * Maximum number of tasks to delete.
	 * @default 50
	 * @maximum 200
	 */
	limit: z.number().optional().describe('Maximum number of tasks to delete.'),
});

export type BatchDeleteTasksParams = z.infer<typeof BatchDeleteTasksParamsSchema>;

/**
 * A single task that was deleted in a batch operation.
 */
export const BatchDeletedTaskSchema = z.object({
	id: z.string().describe('The ID of the deleted task.'),
	title: z.string().describe('The title of the deleted task.'),
});

export type BatchDeletedTask = z.infer<typeof BatchDeletedTaskSchema>;

/**
 * Result of a batch delete operation.
 */
export const BatchDeleteTasksResultSchema = z.object({
	/** Array of tasks that were deleted. */
	deleted: z.array(BatchDeletedTaskSchema).describe('Array of tasks that were deleted.'),

	/** Total number of tasks deleted. */
	count: z.number().describe('Total number of tasks deleted.'),
});

export type BatchDeleteTasksResult = z.infer<typeof BatchDeleteTasksResultSchema>;

/**
 * Paginated list of changelog entries for a task.
 */
export const TaskChangelogResultSchema = z.object({
	/** Array of change records. */
	changelog: z.array(TaskChangelogEntrySchema).describe('Array of change records.'),

	/** Total number of changelog entries. */
	total: z.number().describe('Total number of changelog entries.'),

	/** Applied limit. */
	limit: z.number().describe('Applied limit.'),

	/** Applied offset. */
	offset: z.number().describe('Applied offset.'),
});

export type TaskChangelogResult = z.infer<typeof TaskChangelogResultSchema>;

/**
 * Paginated list of comments on a task.
 */
export const ListCommentsResultSchema = z.object({
	/** Array of comments. */
	comments: z.array(CommentSchema).describe('Array of comments.'),

	/** Total number of comments. */
	total: z.number().describe('Total number of comments.'),

	/** Applied limit. */
	limit: z.number().describe('Applied limit.'),

	/** Applied offset. */
	offset: z.number().describe('Applied offset.'),
});

export type ListCommentsResult = z.infer<typeof ListCommentsResultSchema>;

/**
 * List of all tags in the organization.
 */
export const ListTagsResultSchema = z.object({
	tags: z.array(TagSchema).describe('Array of tags.'),
});

export type ListTagsResult = z.infer<typeof ListTagsResultSchema>;

/**
 * A file attachment on a task. Attachments are stored in S3 and accessed via presigned URLs.
 */
export const AttachmentSchema = z.object({
	id: z.string().describe('Unique identifier for the attachment.'),
	created_at: z.string().describe('ISO 8601 timestamp when the attachment was uploaded.'),
	task_id: z.string().describe('ID of the task this attachment belongs to.'),
	user_id: z.string().describe('ID of the user who uploaded the attachment.'),
	author: UserEntityRefSchema.optional().describe('Reference to the uploader with display name.'),
	filename: z.string().describe('Original filename of the uploaded file.'),
	content_type: z.string().optional().describe('MIME type of the file.'),
	size: z.number().optional().describe('File size in bytes.'),
});

export type Attachment = z.infer<typeof AttachmentSchema>;

/**
 * Parameters for initiating a file upload to a task.
 */
export const CreateAttachmentParamsSchema = z.object({
	filename: z.string().describe('The filename for the attachment (required).'),
	content_type: z.string().optional().describe('MIME type of the file.'),
	size: z.number().optional().describe('File size in bytes.'),
});

export type CreateAttachmentParams = z.infer<typeof CreateAttachmentParamsSchema>;

/**
 * Response from initiating an attachment upload. Contains a presigned S3 URL for direct upload.
 */
export const PresignUploadResponseSchema = z.object({
	attachment: AttachmentSchema.describe('The created attachment record.'),
	presigned_url: z
		.string()
		.describe('A presigned S3 URL to upload the file content via HTTP PUT.'),
	expiry_seconds: z.number().describe('Number of seconds until the presigned URL expires.'),
});

export type PresignUploadResponse = z.infer<typeof PresignUploadResponseSchema>;

/**
 * Response containing a presigned S3 URL for downloading an attachment.
 */
export const PresignDownloadResponseSchema = z.object({
	presigned_url: z.string().describe('A presigned S3 URL to download the file via HTTP GET.'),
	expiry_seconds: z.number().describe('Number of seconds until the presigned URL expires.'),
});

export type PresignDownloadResponse = z.infer<typeof PresignDownloadResponseSchema>;

/**
 * List of attachments on a task.
 */
export const ListAttachmentsResultSchema = z.object({
	/** Array of attachment records. */
	attachments: z.array(AttachmentSchema).describe('Array of attachment records.'),

	/** Total number of attachments. */
	total: z.number().describe('Total number of attachments.'),
});

export type ListAttachmentsResult = z.infer<typeof ListAttachmentsResultSchema>;

/**
 * List of all users who have been referenced in tasks (as creators, assignees, or closers).
 */
export const ListUsersResultSchema = z.object({
	users: z
		.array(UserEntityRefSchema)
		.describe('Array of user entity references with type information.'),
});

export type ListUsersResult = z.infer<typeof ListUsersResultSchema>;

/**
 * List of all projects that have been referenced in tasks.
 */
export const ListProjectsResultSchema = z.object({
	projects: z.array(EntityRefSchema).describe('Array of project entity references.'),
});

export type ListProjectsResult = z.infer<typeof ListProjectsResultSchema>;

/**
 * Parameters for querying task activity time-series data.
 */
export const TaskActivityParamsSchema = z.object({
	/**
	 * Number of days of activity to retrieve.
	 *
	 * @remarks Minimum 7, maximum 365.
	 * @default 90
	 */
	days: z.number().min(7).max(365).optional().describe('Number of days of activity to retrieve.'),
});

export type TaskActivityParams = z.infer<typeof TaskActivityParamsSchema>;

/**
 * A single day's snapshot of task counts by status.
 */
export const TaskActivityDataPointSchema = z.object({
	/**
	 * The date in `YYYY-MM-DD` format.
	 *
	 * @example '2026-02-28'
	 */
	date: z.string().describe('The date in `YYYY-MM-DD` format.'),

	/** Number of tasks in `'open'` status on this date. */
	open: z.number().describe("Number of tasks in `'open'` status on this date."),

	/** Number of tasks in `'in_progress'` status on this date. */
	inProgress: z.number().describe("Number of tasks in `'in_progress'` status on this date."),

	/** Number of tasks in `'done'` status on this date. */
	done: z.number().describe("Number of tasks in `'done'` status on this date."),

	/** Number of tasks in `'closed'` status on this date. */
	closed: z.number().describe("Number of tasks in `'closed'` status on this date."),

	/** Number of tasks in `'cancelled'` status on this date. */
	cancelled: z.number().describe("Number of tasks in `'cancelled'` status on this date."),
});

export type TaskActivityDataPoint = z.infer<typeof TaskActivityDataPointSchema>;

/**
 * Task activity time-series data.
 */
export const TaskActivityResultSchema = z.object({
	activity: z
		.array(TaskActivityDataPointSchema)
		.describe('Array of daily activity snapshots, ordered chronologically.'),
	days: z.number().describe('The number of days of data returned.'),
});

export type TaskActivityResult = z.infer<typeof TaskActivityResultSchema>;

/**
 * Interface defining the contract for task storage operations.
 *
 * Implemented by {@link TaskStorageService}.
 */
export interface TaskStorage {
	/**
	 * Create a new task.
	 *
	 * @param params - The task creation parameters
	 * @returns The newly created task
	 */
	create(params: CreateTaskParams): Promise<Task>;

	/**
	 * Get a task by its ID.
	 *
	 * @param id - The unique task identifier
	 * @returns The task if found, or `null` if not found
	 */
	get(id: string): Promise<Task | null>;

	/**
	 * List tasks with optional filtering and pagination.
	 *
	 * @param params - Optional filter and pagination parameters
	 * @returns Paginated list of matching tasks
	 */
	list(params?: ListTasksParams): Promise<ListTasksResult>;

	/**
	 * Partially update an existing task.
	 *
	 * @param id - The unique task identifier
	 * @param params - Fields to update (only provided fields are changed)
	 * @returns The updated task
	 */
	update(id: string, params: UpdateTaskParams): Promise<Task>;

	/**
	 * Close a task by setting its status to closed.
	 *
	 * @param id - The unique task identifier
	 * @returns The closed task
	 */
	close(id: string): Promise<Task>;

	/**
	 * Soft-delete a task, marking it as deleted without permanent removal.
	 *
	 * @param id - The unique task identifier
	 * @returns The soft-deleted task
	 */
	softDelete(id: string): Promise<Task>;

	/**
	 * Batch soft-delete tasks matching the given filters.
	 * At least one filter must be provided.
	 *
	 * @param params - Filters to select which tasks to delete
	 * @returns The list of deleted tasks and count
	 */
	batchDelete(params: BatchDeleteTasksParams): Promise<BatchDeleteTasksResult>;

	/**
	 * Get the changelog (audit trail) for a task.
	 *
	 * @param id - The unique task identifier
	 * @param params - Optional pagination parameters
	 * @returns Paginated list of changelog entries
	 */
	changelog(
		id: string,
		params?: { limit?: number; offset?: number }
	): Promise<TaskChangelogResult>;

	/**
	 * Create a comment on a task.
	 *
	 * @param taskId - The ID of the task to comment on
	 * @param body - The comment text content
	 * @param userId - The ID of the user authoring the comment
	 * @param author - Optional entity reference with display name
	 * @returns The newly created comment
	 */
	createComment(
		taskId: string,
		body: string,
		userId: string,
		author?: EntityRef
	): Promise<Comment>;

	/**
	 * Get a comment by its ID.
	 *
	 * @param commentId - The unique comment identifier
	 * @returns The comment
	 */
	getComment(commentId: string): Promise<Comment>;

	/**
	 * Update a comment's body text.
	 *
	 * @param commentId - The unique comment identifier
	 * @param body - The new comment text
	 * @returns The updated comment
	 */
	updateComment(commentId: string, body: string): Promise<Comment>;

	/**
	 * Delete a comment.
	 *
	 * @param commentId - The unique comment identifier
	 */
	deleteComment(commentId: string): Promise<void>;

	/**
	 * List comments on a task with optional pagination.
	 *
	 * @param taskId - The ID of the task
	 * @param params - Optional pagination parameters
	 * @returns Paginated list of comments
	 */
	listComments(
		taskId: string,
		params?: { limit?: number; offset?: number }
	): Promise<ListCommentsResult>;

	/**
	 * Create a new tag.
	 *
	 * @param name - The tag display name
	 * @param color - Optional hex color code (e.g., `'#ff0000'`)
	 * @returns The newly created tag
	 */
	createTag(name: string, color?: string): Promise<Tag>;

	/**
	 * Get a tag by its ID.
	 *
	 * @param tagId - The unique tag identifier
	 * @returns The tag
	 */
	getTag(tagId: string): Promise<Tag>;

	/**
	 * Update a tag's name and optionally its color.
	 *
	 * @param tagId - The unique tag identifier
	 * @param name - The new tag name
	 * @param color - Optional new hex color code
	 * @returns The updated tag
	 */
	updateTag(tagId: string, name: string, color?: string): Promise<Tag>;

	/**
	 * Delete a tag.
	 *
	 * @param tagId - The unique tag identifier
	 */
	deleteTag(tagId: string): Promise<void>;

	/**
	 * List all tags in the organization.
	 *
	 * @returns List of all tags
	 */
	listTags(): Promise<ListTagsResult>;

	/**
	 * Associate a tag with a task.
	 *
	 * @param taskId - The ID of the task
	 * @param tagId - The ID of the tag to add
	 */
	addTagToTask(taskId: string, tagId: string): Promise<void>;

	/**
	 * Remove a tag association from a task.
	 *
	 * @param taskId - The ID of the task
	 * @param tagId - The ID of the tag to remove
	 */
	removeTagFromTask(taskId: string, tagId: string): Promise<void>;

	/**
	 * List all tags associated with a specific task.
	 *
	 * @param taskId - The ID of the task
	 * @returns Array of tags on the task
	 */
	listTagsForTask(taskId: string): Promise<Tag[]>;

	/**
	 * Initiate a file upload to a task. Returns a presigned S3 URL for direct upload.
	 *
	 * @param taskId - The ID of the task to attach the file to
	 * @param params - Attachment metadata (filename, content type, size)
	 * @returns The attachment record and a presigned upload URL
	 */
	uploadAttachment(taskId: string, params: CreateAttachmentParams): Promise<PresignUploadResponse>;

	/**
	 * Confirm that a file upload has completed successfully.
	 *
	 * @param attachmentId - The unique attachment identifier
	 * @returns The confirmed attachment record
	 */
	confirmAttachment(attachmentId: string): Promise<Attachment>;

	/**
	 * Get a presigned S3 URL for downloading an attachment.
	 *
	 * @param attachmentId - The unique attachment identifier
	 * @returns A presigned download URL
	 */
	downloadAttachment(attachmentId: string): Promise<PresignDownloadResponse>;

	/**
	 * List all attachments on a task.
	 *
	 * @param taskId - The ID of the task
	 * @returns List of attachments with total count
	 */
	listAttachments(taskId: string): Promise<ListAttachmentsResult>;

	/**
	 * Delete an attachment.
	 *
	 * @param attachmentId - The unique attachment identifier
	 */
	deleteAttachment(attachmentId: string): Promise<void>;

	/**
	 * List all users who have been referenced in tasks.
	 *
	 * @returns List of user entity references
	 */
	listUsers(): Promise<ListUsersResult>;

	/**
	 * List all projects that have been referenced in tasks.
	 *
	 * @returns List of project entity references
	 */
	listProjects(): Promise<ListProjectsResult>;

	/**
	 * Get task activity time-series data showing daily status counts.
	 *
	 * @param params - Optional parameters controlling the number of days to retrieve
	 * @returns Time-series activity data
	 */
	getActivity(params?: TaskActivityParams): Promise<TaskActivityResult>;
}

/** API version string used for task CRUD, comment, tag, and attachment endpoints. */
const TASK_API_VERSION = '2026-02-24';

/** Maximum number of tasks that can be deleted in a single batch request. */
const MAX_BATCH_DELETE_LIMIT = 200;

/** API version string used for the task activity analytics endpoint. */
const TASK_ACTIVITY_API_VERSION = '2026-02-28';

/** Thrown when a task ID parameter is empty or not a string. */
const TaskIdRequiredError = StructuredError(
	'TaskIdRequiredError',
	'Task ID is required and must be a non-empty string'
);

/** Thrown when a task title is empty or not a string. */
const TaskTitleRequiredError = StructuredError(
	'TaskTitleRequiredError',
	'Task title is required and must be a non-empty string'
);

/** Thrown when a comment ID parameter is empty or not a string. */
const CommentIdRequiredError = StructuredError(
	'CommentIdRequiredError',
	'Comment ID is required and must be a non-empty string'
);

/** Thrown when a comment body is empty or not a string. */
const CommentBodyRequiredError = StructuredError(
	'CommentBodyRequiredError',
	'Comment body is required and must be a non-empty string'
);

/** Thrown when a tag ID parameter is empty or not a string. */
const TagIdRequiredError = StructuredError(
	'TagIdRequiredError',
	'Tag ID is required and must be a non-empty string'
);

/** Thrown when a tag name is empty or not a string. */
const TagNameRequiredError = StructuredError(
	'TagNameRequiredError',
	'Tag name is required and must be a non-empty string'
);

/** Thrown when an attachment ID parameter is empty or not a string. */
const AttachmentIdRequiredError = StructuredError(
	'AttachmentIdRequiredError',
	'Attachment ID is required and must be a non-empty string'
);

/** Thrown when a user ID parameter is empty or not a string. */
const UserIdRequiredError = StructuredError(
	'UserIdRequiredError',
	'User ID is required and must be a non-empty string'
);

/**
 * Thrown when the API returns a success HTTP status but the response body indicates failure.
 */
const TaskStorageResponseError = StructuredError('TaskStorageResponseError')<{
	status: number;
}>();

/**
 * Internal API success response envelope for task operations.
 */
interface TaskSuccessResponse<T> {
	success: true;
	data: T;
}

/**
 * Internal API error response envelope for task operations.
 */
interface TaskErrorResponse {
	success: false;
	message: string;
}

/**
 * Discriminated union of API success and error responses for task operations.
 */
type TaskResponse<T> = TaskSuccessResponse<T> | TaskErrorResponse;

/**
 * Client for the Agentuity Task management service.
 *
 * Provides a full-featured project management API including task CRUD, hierarchical
 * organization (epics → features → tasks), comments, tags, file attachments via
 * presigned S3 URLs, changelog tracking, and activity analytics.
 *
 * Tasks support lifecycle management through status transitions (`open` → `in_progress`
 * → `done`/`closed`/`cancelled`) with automatic date tracking for each transition.
 *
 * All methods validate inputs client-side and throw structured errors for invalid
 * parameters. API errors throw {@link ServiceException}.
 *
 * @example
 * ```typescript
 * const tasks = new TaskStorageService(baseUrl, adapter);
 *
 * // Create a task
 * const task = await tasks.create({
 *   title: 'Implement login flow',
 *   type: 'feature',
 *   created_id: 'user_123',
 *   creator: { id: 'user_123', name: 'Alice' },
 *   priority: 'high',
 * });
 *
 * // Add a comment
 * await tasks.createComment(task.id, 'Started working on this', 'user_123');
 *
 * // List open tasks
 * const { tasks: openTasks } = await tasks.list({ status: 'open' });
 * ```
 */
export class TaskStorageService implements TaskStorage {
	#adapter: FetchAdapter;
	#baseUrl: string;

	/**
	 * Creates a new TaskStorageService instance.
	 *
	 * @param baseUrl - The base URL of the task management API
	 * @param adapter - The HTTP fetch adapter used for making API requests
	 */
	constructor(baseUrl: string, adapter: FetchAdapter) {
		this.#adapter = adapter;
		this.#baseUrl = baseUrl;
	}

	/**
	 * Create a new task.
	 *
	 * @param params - The task creation parameters including title, type, and optional fields
	 * @returns The newly created task
	 * @throws {@link TaskTitleRequiredError} if the title is empty or not a string
	 * @throws {@link ServiceException} if the API request fails
	 *
	 * @example
	 * ```typescript
	 * const task = await tasks.create({
	 *   title: 'Fix login bug',
	 *   type: 'bug',
	 *   created_id: 'user_123',
	 *   priority: 'high',
	 *   creator: { id: 'user_123', name: 'Alice' },
	 *   project: { id: 'proj_456', name: 'Auth Service' },
	 * });
	 * console.log('Created:', task.id);
	 * ```
	 */
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

	/**
	 * Get a task by its ID.
	 *
	 * @param id - The unique task identifier
	 * @returns The task if found, or `null` if the task does not exist
	 * @throws {@link TaskIdRequiredError} if the ID is empty or not a string
	 * @throws {@link ServiceException} if the API request fails
	 *
	 * @example
	 * ```typescript
	 * const task = await tasks.get('task_abc123');
	 * if (task) {
	 *   console.log(task.title, task.status);
	 * } else {
	 *   console.log('Task not found');
	 * }
	 * ```
	 */
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

	/**
	 * List tasks with optional filtering and pagination.
	 *
	 * @param params - Optional filter and pagination parameters
	 * @returns Paginated list of tasks matching the filters
	 * @throws {@link ServiceException} if the API request fails
	 *
	 * @example
	 * ```typescript
	 * // List all open high-priority bugs
	 * const result = await tasks.list({
	 *   status: 'open',
	 *   type: 'bug',
	 *   priority: 'high',
	 *   sort: '-created_at',
	 *   limit: 20,
	 * });
	 * console.log(`Found ${result.total} bugs, showing ${result.tasks.length}`);
	 * ```
	 */
	async list(params?: ListTasksParams): Promise<ListTasksResult> {
		const queryParams = new URLSearchParams();
		if (params?.status) queryParams.set('status', params.status);
		if (params?.type) queryParams.set('type', params.type);
		if (params?.priority) queryParams.set('priority', params.priority);
		if (params?.assigned_id) queryParams.set('assigned_id', params.assigned_id);
		if (params?.created_id) queryParams.set('created_id', params.created_id);
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

	/**
	 * Partially update an existing task.
	 *
	 * @param id - The unique task identifier
	 * @param params - Fields to update; only provided fields are changed
	 * @returns The updated task
	 * @throws {@link TaskIdRequiredError} if the ID is empty or not a string
	 * @throws {@link TaskTitleRequiredError} if a title is provided but is empty
	 * @throws {@link ServiceException} if the API request fails
	 *
	 * @example
	 * ```typescript
	 * const updated = await tasks.update('task_abc123', {
	 *   status: 'in_progress',
	 *   priority: 'high',
	 *   assignee: { id: 'user_456', name: 'Bob' },
	 * });
	 * console.log('Updated status:', updated.status);
	 * ```
	 */
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

	/**
	 * Close a task by setting its status to closed.
	 *
	 * @param id - The unique task identifier
	 * @returns The closed task with updated `closed_date`
	 * @throws {@link TaskIdRequiredError} if the ID is empty or not a string
	 * @throws {@link ServiceException} if the API request fails
	 *
	 * @example
	 * ```typescript
	 * const closed = await tasks.close('task_abc123');
	 * console.log('Closed at:', closed.closed_date);
	 * ```
	 */
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

	/**
	 * Get the changelog (audit trail) for a task, showing all field changes over time.
	 *
	 * @param id - The unique task identifier
	 * @param params - Optional pagination parameters
	 * @returns Paginated list of changelog entries ordered by most recent first
	 * @throws {@link TaskIdRequiredError} if the ID is empty or not a string
	 * @throws {@link ServiceException} if the API request fails
	 *
	 * @example
	 * ```typescript
	 * const { changelog, total } = await tasks.changelog('task_abc123', {
	 *   limit: 10,
	 *   offset: 0,
	 * });
	 * for (const entry of changelog) {
	 *   console.log(`${entry.field}: ${entry.old_value} → ${entry.new_value}`);
	 * }
	 * ```
	 */
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

	/**
	 * Soft-delete a task, marking it as deleted without permanent removal.
	 *
	 * @param id - The unique task identifier
	 * @returns The soft-deleted task
	 * @throws {@link TaskIdRequiredError} if the ID is empty or not a string
	 * @throws {@link ServiceException} if the API request fails
	 *
	 * @example
	 * ```typescript
	 * const deleted = await tasks.softDelete('task_abc123');
	 * console.log('Soft-deleted task:', deleted.id);
	 * ```
	 */
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

	/**
	 * Batch soft-delete tasks matching the given filters.
	 * At least one filter must be provided. The server caps the limit at 200.
	 *
	 * @param params - Filters to select which tasks to delete
	 * @returns The list of deleted tasks and count
	 * @throws {@link ServiceException} if the API request fails
	 *
	 * @example
	 * ```typescript
	 * const result = await tasks.batchDelete({ status: 'closed', older_than: '7d', limit: 50 });
	 * console.log(`Deleted ${result.count} tasks`);
	 * ```
	 */
	async batchDelete(params: BatchDeleteTasksParams): Promise<BatchDeleteTasksResult> {
		const hasFilter =
			params.status ||
			params.type ||
			params.priority ||
			params.parent_id ||
			params.created_id ||
			params.older_than;
		if (!hasFilter) {
			throw new Error('At least one filter is required for batch delete');
		}
		if (params.limit !== undefined && params.limit > MAX_BATCH_DELETE_LIMIT) {
			throw new Error(
				`Batch delete limit must not exceed ${MAX_BATCH_DELETE_LIMIT} (got ${params.limit})`
			);
		}

		const url = buildUrl(this.#baseUrl, `/task/delete/batch/${TASK_API_VERSION}`);
		const signal = AbortSignal.timeout(60_000);

		const body: Record<string, unknown> = {};
		if (params.status) body.status = params.status;
		if (params.type) body.type = params.type;
		if (params.priority) body.priority = params.priority;
		if (params.parent_id) body.parent_id = params.parent_id;
		if (params.created_id) body.created_id = params.created_id;
		if (params.older_than) body.older_than = params.older_than;
		if (params.limit !== undefined) body.limit = params.limit;

		const res = await this.#adapter.invoke<TaskResponse<BatchDeleteTasksResult>>(url, {
			method: 'POST',
			body: safeStringify(body),
			headers: { 'Content-Type': 'application/json' },
			signal,
			telemetry: {
				name: 'agentuity.task.batchDelete',
				attributes: {
					...(params.status ? { status: params.status } : {}),
					...(params.type ? { type: params.type } : {}),
					...(params.older_than ? { older_than: params.older_than } : {}),
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

	/**
	 * Create a comment on a task.
	 *
	 * @param taskId - The ID of the task to comment on
	 * @param body - The comment text content (must be non-empty)
	 * @param userId - The ID of the user authoring the comment
	 * @param author - Optional entity reference with the author's display name
	 * @returns The newly created comment
	 * @throws {@link TaskIdRequiredError} if the task ID is empty or not a string
	 * @throws {@link CommentBodyRequiredError} if the body is empty or not a string
	 * @throws {@link UserIdRequiredError} if the user ID is empty or not a string
	 * @throws {@link ServiceException} if the API request fails
	 *
	 * @example
	 * ```typescript
	 * const comment = await tasks.createComment(
	 *   'task_abc123',
	 *   'This is ready for review.',
	 *   'user_456',
	 *   { id: 'user_456', name: 'Bob' },
	 * );
	 * console.log('Comment created:', comment.id);
	 * ```
	 */
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

	/**
	 * Get a comment by its ID.
	 *
	 * @param commentId - The unique comment identifier
	 * @returns The comment
	 * @throws {@link CommentIdRequiredError} if the comment ID is empty or not a string
	 * @throws {@link ServiceException} if the API request fails
	 *
	 * @example
	 * ```typescript
	 * const comment = await tasks.getComment('comment_xyz789');
	 * console.log(`${comment.author?.name}: ${comment.body}`);
	 * ```
	 */
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

	/**
	 * Update a comment's body text.
	 *
	 * @param commentId - The unique comment identifier
	 * @param body - The new comment text (must be non-empty)
	 * @returns The updated comment
	 * @throws {@link CommentIdRequiredError} if the comment ID is empty or not a string
	 * @throws {@link CommentBodyRequiredError} if the body is empty or not a string
	 * @throws {@link ServiceException} if the API request fails
	 *
	 * @example
	 * ```typescript
	 * const updated = await tasks.updateComment(
	 *   'comment_xyz789',
	 *   'Updated: This is now ready for final review.',
	 * );
	 * console.log('Updated at:', updated.updated_at);
	 * ```
	 */
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

	/**
	 * Delete a comment permanently.
	 *
	 * @param commentId - The unique comment identifier
	 * @throws {@link CommentIdRequiredError} if the comment ID is empty or not a string
	 * @throws {@link ServiceException} if the API request fails
	 *
	 * @example
	 * ```typescript
	 * await tasks.deleteComment('comment_xyz789');
	 * console.log('Comment deleted');
	 * ```
	 */
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

	/**
	 * List comments on a task with optional pagination.
	 *
	 * @param taskId - The ID of the task whose comments to list
	 * @param params - Optional pagination parameters
	 * @returns Paginated list of comments
	 * @throws {@link TaskIdRequiredError} if the task ID is empty or not a string
	 * @throws {@link ServiceException} if the API request fails
	 *
	 * @example
	 * ```typescript
	 * const { comments, total } = await tasks.listComments('task_abc123', {
	 *   limit: 25,
	 *   offset: 0,
	 * });
	 * for (const c of comments) {
	 *   console.log(`${c.author?.name}: ${c.body}`);
	 * }
	 * ```
	 */
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

	/**
	 * Create a new tag for categorizing tasks.
	 *
	 * @param name - The tag display name (must be non-empty)
	 * @param color - Optional hex color code (e.g., `'#ff0000'`)
	 * @returns The newly created tag
	 * @throws {@link TagNameRequiredError} if the name is empty or not a string
	 * @throws {@link ServiceException} if the API request fails
	 *
	 * @example
	 * ```typescript
	 * const tag = await tasks.createTag('urgent', '#ff0000');
	 * console.log('Created tag:', tag.id, tag.name);
	 * ```
	 */
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

	/**
	 * Get a tag by its ID.
	 *
	 * @param tagId - The unique tag identifier
	 * @returns The tag
	 * @throws {@link TagIdRequiredError} if the tag ID is empty or not a string
	 * @throws {@link ServiceException} if the API request fails
	 *
	 * @example
	 * ```typescript
	 * const tag = await tasks.getTag('tag_def456');
	 * console.log(`${tag.name} (${tag.color})`);
	 * ```
	 */
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

	/**
	 * Update a tag's name and optionally its color.
	 *
	 * @param tagId - The unique tag identifier
	 * @param name - The new tag name (must be non-empty)
	 * @param color - Optional new hex color code
	 * @returns The updated tag
	 * @throws {@link TagIdRequiredError} if the tag ID is empty or not a string
	 * @throws {@link TagNameRequiredError} if the name is empty or not a string
	 * @throws {@link ServiceException} if the API request fails
	 *
	 * @example
	 * ```typescript
	 * const updated = await tasks.updateTag('tag_def456', 'critical', '#cc0000');
	 * console.log('Updated:', updated.name);
	 * ```
	 */
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

	/**
	 * Delete a tag permanently.
	 *
	 * @param tagId - The unique tag identifier
	 * @throws {@link TagIdRequiredError} if the tag ID is empty or not a string
	 * @throws {@link ServiceException} if the API request fails
	 *
	 * @example
	 * ```typescript
	 * await tasks.deleteTag('tag_def456');
	 * console.log('Tag deleted');
	 * ```
	 */
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

	/**
	 * List all tags in the organization.
	 *
	 * @returns List of all tags
	 * @throws {@link ServiceException} if the API request fails
	 *
	 * @example
	 * ```typescript
	 * const { tags } = await tasks.listTags();
	 * for (const tag of tags) {
	 *   console.log(`${tag.name} (${tag.color ?? 'no color'})`);
	 * }
	 * ```
	 */
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

	/**
	 * Associate a tag with a task.
	 *
	 * @param taskId - The ID of the task
	 * @param tagId - The ID of the tag to add
	 * @throws {@link TaskIdRequiredError} if the task ID is empty or not a string
	 * @throws {@link TagIdRequiredError} if the tag ID is empty or not a string
	 * @throws {@link ServiceException} if the API request fails
	 *
	 * @example
	 * ```typescript
	 * await tasks.addTagToTask('task_abc123', 'tag_def456');
	 * console.log('Tag added to task');
	 * ```
	 */
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

	/**
	 * Remove a tag association from a task.
	 *
	 * @param taskId - The ID of the task
	 * @param tagId - The ID of the tag to remove
	 * @throws {@link TaskIdRequiredError} if the task ID is empty or not a string
	 * @throws {@link TagIdRequiredError} if the tag ID is empty or not a string
	 * @throws {@link ServiceException} if the API request fails
	 *
	 * @example
	 * ```typescript
	 * await tasks.removeTagFromTask('task_abc123', 'tag_def456');
	 * console.log('Tag removed from task');
	 * ```
	 */
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

	/**
	 * List all tags associated with a specific task.
	 *
	 * @param taskId - The ID of the task
	 * @returns Array of tags on the task
	 * @throws {@link TaskIdRequiredError} if the task ID is empty or not a string
	 * @throws {@link ServiceException} if the API request fails
	 *
	 * @example
	 * ```typescript
	 * const tags = await tasks.listTagsForTask('task_abc123');
	 * console.log('Tags:', tags.map((t) => t.name).join(', '));
	 * ```
	 */
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

	/**
	 * Initiate a file upload to a task. Returns a presigned S3 URL for direct upload.
	 *
	 * @remarks
	 * After receiving the presigned URL, upload the file content via HTTP PUT to that URL.
	 * Then call {@link TaskStorageService.confirmAttachment | confirmAttachment} to finalize.
	 *
	 * @param taskId - The ID of the task to attach the file to
	 * @param params - Attachment metadata including filename, content type, and size
	 * @returns The created attachment record and a presigned upload URL
	 * @throws {@link TaskIdRequiredError} if the task ID is empty or not a string
	 * @throws {@link ServiceException} if the API request fails
	 *
	 * @example
	 * ```typescript
	 * const { attachment, presigned_url } = await tasks.uploadAttachment(
	 *   'task_abc123',
	 *   { filename: 'report.pdf', content_type: 'application/pdf', size: 102400 },
	 * );
	 *
	 * // Upload the file to S3
	 * await fetch(presigned_url, { method: 'PUT', body: fileContent });
	 *
	 * // Confirm the upload
	 * await tasks.confirmAttachment(attachment.id);
	 * ```
	 */
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

	/**
	 * Confirm that a file upload has completed successfully.
	 *
	 * @remarks
	 * Call this after successfully uploading the file to the presigned URL
	 * returned by {@link TaskStorageService.uploadAttachment | uploadAttachment}.
	 *
	 * @param attachmentId - The unique attachment identifier
	 * @returns The confirmed attachment record
	 * @throws {@link AttachmentIdRequiredError} if the attachment ID is empty or not a string
	 * @throws {@link ServiceException} if the API request fails
	 *
	 * @example
	 * ```typescript
	 * const confirmed = await tasks.confirmAttachment('att_ghi789');
	 * console.log('Confirmed:', confirmed.filename);
	 * ```
	 */
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

	/**
	 * Get a presigned S3 URL for downloading an attachment.
	 *
	 * @param attachmentId - The unique attachment identifier
	 * @returns A presigned download URL with expiry information
	 * @throws {@link AttachmentIdRequiredError} if the attachment ID is empty or not a string
	 * @throws {@link ServiceException} if the API request fails
	 *
	 * @example
	 * ```typescript
	 * const { presigned_url, expiry_seconds } = await tasks.downloadAttachment('att_ghi789');
	 * console.log(`Download URL (expires in ${expiry_seconds}s):`, presigned_url);
	 * ```
	 */
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

	/**
	 * List all attachments on a task.
	 *
	 * @param taskId - The ID of the task
	 * @returns List of attachments with total count
	 * @throws {@link TaskIdRequiredError} if the task ID is empty or not a string
	 * @throws {@link ServiceException} if the API request fails
	 *
	 * @example
	 * ```typescript
	 * const { attachments, total } = await tasks.listAttachments('task_abc123');
	 * for (const att of attachments) {
	 *   console.log(`${att.filename} (${att.content_type}, ${att.size} bytes)`);
	 * }
	 * ```
	 */
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

	/**
	 * Delete an attachment permanently.
	 *
	 * @param attachmentId - The unique attachment identifier
	 * @throws {@link AttachmentIdRequiredError} if the attachment ID is empty or not a string
	 * @throws {@link ServiceException} if the API request fails
	 *
	 * @example
	 * ```typescript
	 * await tasks.deleteAttachment('att_ghi789');
	 * console.log('Attachment deleted');
	 * ```
	 */
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

	/**
	 * List all users who have been referenced in tasks (as creators, assignees, or closers).
	 *
	 * @returns List of user entity references
	 * @throws {@link ServiceException} if the API request fails
	 *
	 * @example
	 * ```typescript
	 * const { users } = await tasks.listUsers();
	 * for (const user of users) {
	 *   console.log(`${user.name} (${user.id})`);
	 * }
	 * ```
	 */
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

	/**
	 * List all projects that have been referenced in tasks.
	 *
	 * @returns List of project entity references
	 * @throws {@link ServiceException} if the API request fails
	 *
	 * @example
	 * ```typescript
	 * const { projects } = await tasks.listProjects();
	 * for (const project of projects) {
	 *   console.log(`${project.name} (${project.id})`);
	 * }
	 * ```
	 */
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

	/**
	 * Get task activity time-series data showing daily task counts by status.
	 *
	 * @param params - Optional parameters controlling the number of days to retrieve
	 * @returns Time-series activity data with daily snapshots
	 * @throws {@link ServiceException} if the API request fails
	 *
	 * @example
	 * ```typescript
	 * const { activity, days } = await tasks.getActivity({ days: 30 });
	 * console.log(`Activity over ${days} days:`);
	 * for (const point of activity) {
	 *   console.log(`${point.date}: ${point.open} open, ${point.inProgress} in progress`);
	 * }
	 * ```
	 */
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
