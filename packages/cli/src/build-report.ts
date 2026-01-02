/**
 * Build Report
 *
 * Structured error/warning collection and reporting for build and deploy commands.
 * Outputs a JSON file with a strict schema for CI tooling integration.
 */

import { writeFileSync } from 'node:fs';
import type { GrammarItem } from './tsc-output-parser';

/**
 * Error codes for non-TypeScript errors.
 * TypeScript errors use their native TS#### codes.
 */
export const BuildErrorCodes = {
	// AST/Metadata errors (AST0xx)
	AST001: 'MetadataNameMissing',
	AST002: 'DuplicateName',
	AST003: 'InvalidExport',
	AST004: 'InvalidCronExpression',
	AST005: 'InvalidAgentConfig',

	// Build errors (BUILD0xx)
	BUILD001: 'AppFileNotFound',
	BUILD002: 'SourceDirNotFound',
	BUILD003: 'DependencyUpgradeFailed',
	BUILD004: 'BundleFailed',
	BUILD005: 'EntryPointNotFound',
	BUILD006: 'ViteBuildFailed',
	BUILD007: 'RuntimePackageNotFound',
	BUILD008: 'TypecheckToolFailed',

	// Validation errors (VAL0xx)
	VAL001: 'AgentIdentifierCollision',
	VAL002: 'InvalidRoutePath',
	VAL003: 'InvalidRouteMethod',
	VAL004: 'SchemaValidationFailed',

	// Deploy errors (DEPLOY0xx)
	DEPLOY001: 'DeploymentCreationFailed',
	DEPLOY002: 'UploadFailed',
	DEPLOY003: 'DeploymentTimeout',
	DEPLOY004: 'DeploymentFailed',
	DEPLOY005: 'EncryptionFailed',
	DEPLOY006: 'CDNUploadFailed',
} as const;

export type BuildErrorCode = keyof typeof BuildErrorCodes;

/**
 * Error scopes for categorizing errors
 */
export type ErrorScope = 'typescript' | 'ast' | 'build' | 'bundler' | 'validation' | 'deploy';

/**
 * File-specific error with location information
 */
export interface FileError {
	type: 'file';
	scope: ErrorScope;
	path: string;
	line: number;
	column: number;
	message: string;
	code?: string;
}

/**
 * General error without file location
 */
export interface GeneralError {
	type: 'general';
	scope: ErrorScope;
	message: string;
	code?: string;
}

/**
 * Union type for all build errors
 */
export type BuildError = FileError | GeneralError;

/**
 * Union type for all build warnings (same structure as errors)
 */
export type BuildWarning = FileError | GeneralError;

/**
 * Diagnostic timing information for a build phase
 */
export interface BuildDiagnostic {
	name: string;
	startedAt: string;
	completedAt: string;
	durationMs: number;
}

/**
 * Complete build report structure
 */
export interface BuildReport {
	success: boolean;
	errors: BuildError[];
	warnings: BuildWarning[];
	diagnostics: BuildDiagnostic[];
}

/**
 * Diagnostic phases for timing
 */
export const DiagnosticPhases = [
	'typecheck',
	'client-build',
	'workbench-build',
	'server-build',
	'metadata-generation',
	'zip-package',
	'encrypt',
	'code-upload',
	'cdn-upload',
	'deployment-wait',
] as const;

export type DiagnosticPhase = (typeof DiagnosticPhases)[number];

/**
 * Active diagnostic tracker
 */
interface ActiveDiagnostic {
	name: string;
	startedAt: Date;
}

/**
 * Build Report Collector
 *
 * Collects errors, warnings, and diagnostic timing information throughout
 * the build/deploy pipeline. Can be configured to automatically write
 * the report on process exit.
 */
export class BuildReportCollector {
	private errors: BuildError[] = [];
	private warnings: BuildWarning[] = [];
	private diagnostics: BuildDiagnostic[] = [];
	private activeDiagnostics: Map<string, ActiveDiagnostic> = new Map();
	private outputPath: string | null = null;
	private autoWriteEnabled = false;
	private written = false;

	private beforeExitHandler: (() => void) | null = null;
	private sigintHandler: (() => void) | null = null;
	private sigtermHandler: (() => void) | null = null;

	/**
	 * Set the output path for the report file
	 */
	setOutputPath(path: string): void {
		this.outputPath = path;
	}

	/**
	 * Enable automatic writing of the report on process exit.
	 * This ensures the report is written even if the process exits unexpectedly.
	 */
	enableAutoWrite(): void {
		if (this.autoWriteEnabled || !this.outputPath) return;

		this.autoWriteEnabled = true;

		// Use beforeExit for graceful exits
		this.beforeExitHandler = () => {
			this.writeSync();
		};
		process.once('beforeExit', this.beforeExitHandler);

		// Handle SIGINT/SIGTERM with process.once to avoid stacking handlers
		this.sigintHandler = () => {
			this.writeSync();
			process.exit(130);
		};
		this.sigtermHandler = () => {
			this.writeSync();
			process.exit(143);
		};
		process.once('SIGINT', this.sigintHandler);
		process.once('SIGTERM', this.sigtermHandler);
	}

	/**
	 * Disable automatic writing and remove signal handlers.
	 * Call this when done with the collector to prevent handler conflicts.
	 */
	disableAutoWrite(): void {
		if (!this.autoWriteEnabled) return;

		this.autoWriteEnabled = false;

		if (this.beforeExitHandler) {
			process.removeListener('beforeExit', this.beforeExitHandler);
			this.beforeExitHandler = null;
		}
		if (this.sigintHandler) {
			process.removeListener('SIGINT', this.sigintHandler);
			this.sigintHandler = null;
		}
		if (this.sigtermHandler) {
			process.removeListener('SIGTERM', this.sigtermHandler);
			this.sigtermHandler = null;
		}
	}

	/**
	 * Add TypeScript errors from parsed tsc output
	 */
	addTypeScriptErrors(items: GrammarItem[]): void {
		for (const item of items) {
			if (item.type !== 'Item' || !item.value) continue;

			const val = item.value;
			const isError = val.tsError?.value?.type === 'error';
			const isWarning = val.tsError?.value?.type === 'warning';

			if (!isError && !isWarning) continue;

			const entry: FileError = {
				type: 'file',
				scope: 'typescript',
				path: val.path?.value ?? 'unknown',
				line: val.cursor?.value?.line ?? 0,
				column: val.cursor?.value?.col ?? 0,
				message: (val.message?.value ?? '').trim(),
				code: val.tsError?.value?.errorString,
			};

			if (isError) {
				this.errors.push(entry);
			} else {
				this.warnings.push(entry);
			}
		}
	}

	/**
	 * Add a file-specific error
	 */
	addFileError(
		scope: ErrorScope,
		path: string,
		line: number,
		column: number,
		message: string,
		code?: string
	): void {
		this.errors.push({
			type: 'file',
			scope,
			path,
			line,
			column,
			message,
			code,
		});
	}

	/**
	 * Add a general error without file location
	 */
	addGeneralError(scope: ErrorScope, message: string, code?: string): void {
		this.errors.push({
			type: 'general',
			scope,
			message,
			code,
		});
	}

	/**
	 * Add a file-specific warning
	 */
	addFileWarning(
		scope: ErrorScope,
		path: string,
		line: number,
		column: number,
		message: string,
		code?: string
	): void {
		this.warnings.push({
			type: 'file',
			scope,
			path,
			line,
			column,
			message,
			code,
		});
	}

	/**
	 * Add a general warning without file location
	 */
	addGeneralWarning(scope: ErrorScope, message: string, code?: string): void {
		this.warnings.push({
			type: 'general',
			scope,
			message,
			code,
		});
	}

	/**
	 * Start timing a diagnostic phase
	 * @returns A function to call when the phase completes
	 */
	startDiagnostic(name: string): () => void {
		const startedAt = new Date();
		this.activeDiagnostics.set(name, { name, startedAt });

		return () => {
			this.endDiagnostic(name);
		};
	}

	/**
	 * End a diagnostic phase
	 */
	private endDiagnostic(name: string): void {
		const active = this.activeDiagnostics.get(name);
		if (!active) return;

		const completedAt = new Date();
		const durationMs = completedAt.getTime() - active.startedAt.getTime();

		this.diagnostics.push({
			name,
			startedAt: active.startedAt.toISOString(),
			completedAt: completedAt.toISOString(),
			durationMs,
		});

		this.activeDiagnostics.delete(name);
	}

	/**
	 * Check if there are any errors
	 */
	hasErrors(): boolean {
		return this.errors.length > 0;
	}

	/**
	 * Check if there are any warnings
	 */
	hasWarnings(): boolean {
		return this.warnings.length > 0;
	}

	/**
	 * Get the error count
	 */
	getErrorCount(): number {
		return this.errors.length;
	}

	/**
	 * Get the warning count
	 */
	getWarningCount(): number {
		return this.warnings.length;
	}

	/**
	 * Generate the complete build report
	 */
	toReport(): BuildReport {
		// Complete any active diagnostics - collect keys first to avoid
		// iterating while modifying the map
		const activeKeys = [...this.activeDiagnostics.keys()];
		for (const name of activeKeys) {
			this.endDiagnostic(name);
		}

		return {
			success: this.errors.length === 0,
			errors: [...this.errors],
			warnings: [...this.warnings],
			diagnostics: [...this.diagnostics],
		};
	}

	/**
	 * Write the report to the configured output path asynchronously
	 */
	async write(): Promise<void> {
		if (!this.outputPath || this.written) return;

		this.written = true;
		const report = this.toReport();
		const file = Bun.file(this.outputPath);
		await file.write(JSON.stringify(report, null, '\t'));
	}

	/**
	 * Write the report synchronously (for exit handlers)
	 */
	writeSync(): void {
		if (!this.outputPath || this.written) return;

		this.written = true;
		const report = this.toReport();
		writeFileSync(this.outputPath, JSON.stringify(report, null, '\t'));
	}

	/**
	 * Force write the report (bypasses the written flag)
	 * Use this when you want to update the report file mid-process
	 */
	async forceWrite(): Promise<void> {
		if (!this.outputPath) return;

		const report = this.toReport();
		const file = Bun.file(this.outputPath);
		await file.write(JSON.stringify(report, null, '\t'));
		this.written = true;
	}
}

/**
 * Global collector instance for use across the build pipeline.
 * Commands should create their own collector and pass it through,
 * but this provides a fallback for error handling in deeply nested code.
 */
let globalCollector: BuildReportCollector | null = null;

/**
 * Set the global collector instance
 */
export function setGlobalCollector(collector: BuildReportCollector): void {
	globalCollector = collector;
}

/**
 * Get the global collector instance (may be null)
 */
export function getGlobalCollector(): BuildReportCollector | null {
	return globalCollector;
}

/**
 * Clear the global collector instance and clean up its signal handlers
 */
export function clearGlobalCollector(): void {
	if (globalCollector) {
		globalCollector.disableAutoWrite();
	}
	globalCollector = null;
}
