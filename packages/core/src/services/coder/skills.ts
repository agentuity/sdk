import { z } from 'zod/v4';
import type { APIClient } from '../api.ts';
import {
	CoderCreateSkillBucketRequestSchema,
	CoderSavedSkillListResponseSchema,
	CoderSavedSkillSchema,
	CoderSaveSkillRequestSchema,
	CoderSkillBucketListResponseSchema,
	CoderSkillBucketSchema,
	type CoderCreateSkillBucketRequest,
	type CoderSavedSkill,
	type CoderSavedSkillListResponse,
	type CoderSaveSkillRequest,
	type CoderSkillBucket,
	type CoderSkillBucketListResponse,
} from './types.ts';

const SaveSkillResponseSchema = z
	.object({
		skill: CoderSavedSkillSchema.describe('Saved skill payload returned by coder hub'),
	})
	.passthrough()
	.describe('Wrapped save-skill response from coder hub');

const CreateSkillBucketResponseSchema = z
	.object({
		bucket: CoderSkillBucketSchema.describe('Created skill bucket payload returned by coder hub'),
	})
	.passthrough()
	.describe('Wrapped create-skill-bucket response from coder hub');

const OkResponseSchema = z
	.object({
		ok: z.boolean().describe('Operation success indicator'),
	})
	.passthrough()
	.describe('Generic ok response from coder hub');

export async function coderListSavedSkills(
	client: APIClient
): Promise<CoderSavedSkillListResponse> {
	return client.get<CoderSavedSkillListResponse>(
		'/hub/skills/library',
		CoderSavedSkillListResponseSchema
	);
}

export async function coderSaveSkill(
	client: APIClient,
	params: { body: CoderSaveSkillRequest }
): Promise<CoderSavedSkill> {
	const resp = await client.post<z.infer<typeof SaveSkillResponseSchema>, CoderSaveSkillRequest>(
		'/hub/skills/library',
		params.body,
		SaveSkillResponseSchema,
		CoderSaveSkillRequestSchema
	);

	return resp.skill;
}

export async function coderDeleteSavedSkill(
	client: APIClient,
	params: { skillId: string }
): Promise<void> {
	const path = `/hub/skills/library/${encodeURIComponent(params.skillId)}`;
	await client.delete(path, OkResponseSchema);
}

export async function coderListSkillBuckets(
	client: APIClient
): Promise<CoderSkillBucketListResponse> {
	return client.get<CoderSkillBucketListResponse>(
		'/hub/skills/buckets',
		CoderSkillBucketListResponseSchema
	);
}

export async function coderCreateSkillBucket(
	client: APIClient,
	params: { body: CoderCreateSkillBucketRequest }
): Promise<CoderSkillBucket> {
	const resp = await client.post<
		z.infer<typeof CreateSkillBucketResponseSchema>,
		CoderCreateSkillBucketRequest
	>(
		'/hub/skills/buckets',
		params.body,
		CreateSkillBucketResponseSchema,
		CoderCreateSkillBucketRequestSchema
	);

	return resp.bucket;
}

export async function coderDeleteSkillBucket(
	client: APIClient,
	params: { bucketId: string }
): Promise<void> {
	const path = `/hub/skills/buckets/${encodeURIComponent(params.bucketId)}`;
	await client.delete(path, OkResponseSchema);
}
