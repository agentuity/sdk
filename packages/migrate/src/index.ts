/**
 * @agentuity/migrate — public API
 *
 * Programmatic access to the migration tool. For CLI usage, use the bin entry:
 *   npx @agentuity/migrate [project-dir]
 */

// v1 → v2 migration
export { migrate, type MigrateOptions, type MigrateResult } from './migrate';
export {
	detect,
	type DetectionResult,
	type Finding,
	type Severity,
	type OutdatedPackage,
} from './detect';

// v2 → v3 migration
export { migrateV3, type MigrateV3Options, type MigrateV3Result } from './migrate-v3';
export {
	detectV3,
	type V3DetectionResult,
	type V3Finding,
	type V3OutdatedPackage,
	type AgentFile,
	type AgentComplexity,
	type ServiceUsage,
} from './detect-v3';
