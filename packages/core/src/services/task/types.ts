import { z } from 'zod';

// ============================================================================
// API Request Schemas for Task Service
// ============================================================================

/**
 * Request body schema for creating a comment on a task.
 */
export const CreateCommentRequestSchema = z.object({
	/** Comment text */
	body: z.string().describe('Comment text'),
	/** Author user ID */
	user_id: z.string().describe('Author user ID'),
});

export type CreateCommentRequest = z.infer<typeof CreateCommentRequestSchema>;

/**
 * Request body schema for updating a comment.
 */
export const UpdateCommentRequestSchema = z.object({
	/** Updated comment text */
	body: z.string().describe('Updated comment text'),
});

export type UpdateCommentRequest = z.infer<typeof UpdateCommentRequestSchema>;

/**
 * Request body schema for creating a tag.
 */
export const CreateTagRequestSchema = z.object({
	/** Tag name */
	name: z.string().describe('Tag name'),
	/** Hex color code */
	color: z.string().optional().describe('Hex color code'),
});

export type CreateTagRequest = z.infer<typeof CreateTagRequestSchema>;

/**
 * Request body schema for updating a tag.
 */
export const UpdateTagRequestSchema = z.object({
	/** Tag name */
	name: z.string().describe('Tag name'),
	/** Hex color code */
	color: z.string().optional().describe('Hex color code'),
});

export type UpdateTagRequest = z.infer<typeof UpdateTagRequestSchema>;

/**
 * Request body schema for creating a user entity.
 */
export const CreateTaskUserRequestSchema = z.object({
	/** User name */
	name: z.string().describe('User name'),
	/** User type: 'human' or 'agent' */
	type: z.string().optional().describe("'human' or 'agent'"),
});

export type CreateTaskUserRequest = z.infer<typeof CreateTaskUserRequestSchema>;

/**
 * Request body schema for creating a project entity.
 */
export const CreateTaskProjectRequestSchema = z.object({
	/** Project name */
	name: z.string().describe('Project name'),
});

export type CreateTaskProjectRequest = z.infer<typeof CreateTaskProjectRequestSchema>;
