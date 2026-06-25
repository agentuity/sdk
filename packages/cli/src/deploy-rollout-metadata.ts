import { z } from 'zod';

export const DeployRolloutMetadataSchema = z
	.object({
		source: z.enum(['managed']).optional(),
		channel: z.enum(['edge', 'stable', 'commit']).optional(),
		rollout_org_ids: z.array(z.string().min(1)).optional(),
	})
	.strict();

export type DeployRolloutMetadata = z.infer<typeof DeployRolloutMetadataSchema>;

export function parseDeployRolloutMetadata(
	raw: string | undefined
): DeployRolloutMetadata | undefined {
	const value = raw?.trim();
	if (!value) {
		return undefined;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch (error) {
		throw new Error(
			`Invalid deploy metadata JSON: ${error instanceof Error ? error.message : String(error)}`
		);
	}
	const result = DeployRolloutMetadataSchema.safeParse(parsed);
	if (!result.success) {
		const details = result.error.issues.map((issue) => issue.message).join(', ');
		throw new Error(`Invalid deploy metadata: ${details}`);
	}
	if (!result.data.source && !result.data.channel && !result.data.rollout_org_ids?.length) {
		return undefined;
	}
	return result.data;
}

export function resolveDeployRolloutMetadata(options?: {
	metadata?: string;
}): DeployRolloutMetadata | undefined {
	return parseDeployRolloutMetadata(options?.metadata ?? process.env.AGENTUITY_DEPLOY_METADATA);
}

export function mergeDeployRolloutMetadata<T extends { deployment?: Record<string, unknown> }>(
	build: T,
	rolloutMetadata: DeployRolloutMetadata | undefined
): T {
	if (!rolloutMetadata || !build.deployment) {
		return build;
	}
	const deployment = { ...build.deployment };
	if (rolloutMetadata.source) {
		deployment.source = rolloutMetadata.source;
	}
	if (rolloutMetadata.channel) {
		deployment.channel = rolloutMetadata.channel;
	}
	if (rolloutMetadata.rollout_org_ids?.length) {
		deployment.rollout_org_ids = rolloutMetadata.rollout_org_ids;
	}
	return {
		...build,
		deployment,
	};
}
