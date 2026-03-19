/**
 * @agentuity/migrate — public API
 *
 * Programmatic access to the migration tool. For CLI usage, use the bin entry:
 *   npx @agentuity/migrate [project-dir]
 */

export { migrate, type MigrateOptions, type MigrateResult } from './migrate';
export { detect, type DetectionResult, type Finding, type Severity } from './detect';
