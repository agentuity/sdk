import { z } from 'zod';

/**
 * Base schema for snapshot build configuration file (agentuity-snapshot.yaml)
 * This is the canonical schema - used for JSON Schema generation.
 */
export const SnapshotBuildFileBaseSchema = z
	.object({
		version: z.literal(1).describe('Schema version, must be 1'),
		runtime: z
			.string()
			.describe('Runtime identifier (name:tag format, e.g., bun:1, node:20, python:3.12)'),
		name: z
			.string()
			.regex(/^[a-zA-Z0-9_-]+$/)
			.optional()
			.describe('Snapshot name (alphanumeric, underscores, dashes only)'),
		description: z.string().optional().describe('Human-readable description of the snapshot'),
		dependencies: z
			.array(z.string())
			.optional()
			.describe(
				'List of apt packages to install. Supports version pinning: package=version or package=version* for prefix matching'
			),
		packages: z
			.array(z.string())
			.optional()
			.describe(
				'List of npm/bun packages to install globally via bun install -g. Example: opencode-ai, typescript'
			),
		files: z
			.array(z.string())
			.optional()
			.describe(
				'Glob patterns for files to include from the build context. Supports negative patterns with ! prefix for exclusions'
			),
		env: z
			.record(z.string(), z.string())
			.optional()
			.describe(
				'Environment variables to set. Use ${VAR} syntax for build-time substitution via --env flag'
			),
		metadata: z
			.record(z.string(), z.string())
			.optional()
			.describe(
				'User-defined metadata key-value pairs. Use ${VAR} syntax for build-time substitution via --metadata flag'
			),
		public: z
			.boolean()
			.optional()
			.describe('Whether to make the snapshot publicly accessible (default: false)'),
	})
	.describe('Agentuity Snapshot Build File - defines a reproducible sandbox environment');

/**
 * Schema with validation refinement - use this for parsing/validation.
 * Ensures at least one of dependencies, files, env, or packages is specified.
 */
export const SnapshotBuildFileSchema = SnapshotBuildFileBaseSchema.refine(
	(data) => {
		const hasDependencies = data.dependencies && data.dependencies.length > 0;
		const hasFiles = data.files && data.files.length > 0;
		const hasEnv = data.env && Object.keys(data.env).length > 0;
		const hasPackages = data.packages && data.packages.length > 0;
		return hasDependencies || hasFiles || hasEnv || hasPackages;
	},
	{
		message: 'At least one of dependencies, files, env, or packages must be specified',
	}
);

export type SnapshotBuildFile = z.infer<typeof SnapshotBuildFileSchema>;
