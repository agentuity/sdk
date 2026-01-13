import { z } from 'zod';

/**
 * Schema for snapshot build configuration file (agentuity-snapshot.yaml)
 */
export const SnapshotBuildFileSchema = z
	.object({
		version: z.literal(1).describe('Schema version, must be 1'),
		runtime: z.string().describe('Runtime identifier (name:tag or runtime ID)'),
		name: z
			.string()
			.regex(/^[a-zA-Z0-9_-]+$/)
			.optional()
			.describe('Snapshot name (alphanumeric, underscores, dashes only)'),
		description: z.string().optional().describe('Description of the snapshot'),
		dependencies: z
			.array(z.string())
			.optional()
			.describe('List of apt packages to install'),
		files: z
			.array(z.string())
			.optional()
			.describe('Glob patterns for files to include (supports ! prefix for exclusions)'),
		env: z
			.record(z.string(), z.string())
			.optional()
			.describe('Environment variables to set'),
		metadata: z
			.record(z.string(), z.string())
			.optional()
			.describe('User-defined metadata key-value pairs'),
	})
	.describe('Snapshot build configuration file schema')
	.refine(
		(data) => {
			const hasDependencies = data.dependencies && data.dependencies.length > 0;
			const hasFiles = data.files && data.files.length > 0;
			const hasEnv = data.env && Object.keys(data.env).length > 0;
			return hasDependencies || hasFiles || hasEnv;
		},
		{
			message: 'At least one of dependencies, files, or env must be specified',
		}
	);

export type SnapshotBuildFile = z.infer<typeof SnapshotBuildFileSchema>;
