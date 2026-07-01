import { z } from 'zod';

export const DeployRolloutMetadataSchema = z
	.object({
		source: z.enum(['managed']).optional(),
		channel: z.enum(['edge', 'stable', 'commit']).optional(),
		rollout_org_ids: z.array(z.string().min(1)).optional(),
		rollout_id: z
			.string()
			.min(1)
			.regex(/^[A-Za-z0-9._:-]+$/)
			.optional(),
	})
	.passthrough();

export type DeployRolloutMetadata = z.infer<typeof DeployRolloutMetadataSchema>;

function hasDeployRolloutMetadata(value: DeployRolloutMetadata): boolean {
	return Object.entries(value).some(([, fieldValue]) => {
		if (fieldValue === undefined) {
			return false;
		}
		if (Array.isArray(fieldValue)) {
			return fieldValue.length > 0;
		}
		if (typeof fieldValue === 'string') {
			return fieldValue.length > 0;
		}
		return true;
	});
}

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
	if (!hasDeployRolloutMetadata(result.data)) {
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
	return {
		...build,
		deployment: {
			...build.deployment,
			...rolloutMetadata,
		},
	};
}
