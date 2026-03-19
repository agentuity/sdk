/**
 * Transform: app.ts
 *
 * Handles the following mechanical changes:
 *   1. Remove bootstrapRuntimeEnv() import + call
 *   2. Add migration comment for setup/shutdown (removed in v2)
 *
 * Note: analytics/workbench STAY in createApp() — they are not moved anywhere.
 * In v2, createApp() is the single source of truth for all runtime config.
 *
 * We use simple string-level surgery rather than a full AST round-trip so that
 * formatting and comments are preserved.  The TypeScript API is used only for
 * detection (already done in detect.ts); we apply regex-based patches here.
 *
 * COMPLEXITY GUARD: if the file contains anything we don't recognise (e.g. the
 * giant generated/app.ts blob that v1 CLI wrote), we refuse to touch it and
 * return a `complexityError`.
 */

import type { DetectionResult } from '../detect';

export interface AppTsTransformResult {
	/** The transformed source, or null if transformation was skipped */
	source: string | null;
	/** Set when the file is too complex for automated transformation */
	complexityError?: string;
	/** Informational messages about what was changed */
	changes: string[];
}

/**
 * Heuristics that identify the v1 *generated* app.ts (the 500-line blob the
 * CLI wrote, not the user-facing app.ts).  If we detect these, we bail out
 * because the user probably has a non-standard setup.
 */
const COMPLEXITY_MARKERS = [
	'bootstrapRuntimeEnv',
	'createBaseMiddleware',
	'createOtelMiddleware',
	'createAgentMiddleware',
	'setGlobalLogger',
	'setGlobalTracer',
	'setGlobalRouter',
	'getAppState',
	'getAppConfig',
	'getUserRouter',
	'loadBuildMetadata',
	'patchBunS3ForStorageDev',
	'createWorkbenchRouter',
	'injectAnalytics',
	'registerAnalyticsRoutes',
];

/** How many complexity markers before we bail */
const COMPLEXITY_THRESHOLD = 3;

export function transformAppTs(source: string, detection: DetectionResult): AppTsTransformResult {
	const changes: string[] = [];

	// ── Complexity guard ───────────────────────────────────────────────────
	const markerCount = COMPLEXITY_MARKERS.filter((m) => source.includes(m)).length;
	if (markerCount >= COMPLEXITY_THRESHOLD) {
		return {
			source: null,
			complexityError:
				`app.ts appears to be the v1 CLI-generated entry file (detected ${markerCount} internal ` +
				`framework markers). This file cannot be automatically migrated.\n` +
				`\n` +
				`Action required:\n` +
				`  Replace app.ts with a clean v2 entry:\n` +
				`\n` +
				`     import { createApp } from '@agentuity/runtime';\n` +
				`     import router from './src/api';\n` +
				`     import agents from './src/agent';\n` +
				`\n` +
				`     const { server, logger } = await createApp({\n` +
				`       router: { path: '/api', router },\n` +
				`       agents,\n` +
				`     });\n` +
				`\n` +
				`     logger.debug('Running %s', server.url);\n`,
			changes: [],
		};
	}

	let out = source;

	// ── 1. Remove bootstrapRuntimeEnv import binding ──────────────────────
	if (detection.bootstrapCallInAppTs) {
		// Remove the named import specifier (handles both standalone and combined imports)
		// e.g. import { bootstrapRuntimeEnv } from '@agentuity/runtime';
		// e.g. import { createApp, bootstrapRuntimeEnv } from '@agentuity/runtime';
		out = out.replace(
			/import\s*\{([^}]*)\}\s*from\s*['"]@agentuity\/runtime['"]\s*;?/g,
			(match, bindings: string) => {
				const cleaned = bindings
					.split(',')
					.map((s) => s.trim())
					.filter((s) => s && s !== 'bootstrapRuntimeEnv')
					.join(', ');
				if (!cleaned) return ''; // entire import removed
				return match.replace(bindings, ` ${cleaned} `);
			}
		);

		// Remove the standalone call — handles `await bootstrapRuntimeEnv();` with optional options
		out = out.replace(/^\s*await\s+bootstrapRuntimeEnv\([^)]*\)\s*;?\s*\n?/gm, '');
		out = out.replace(/^\s*bootstrapRuntimeEnv\([^)]*\)\s*;?\s*\n?/gm, '');

		// Clean up any blank lines that result from the removal (max one blank line)
		out = out.replace(/\n{3,}/g, '\n\n');

		changes.push('Removed bootstrapRuntimeEnv() import and call');
	}

	// Note: analytics/workbench stay in createApp() in v2 - no migration needed

	// ── 2. setup / shutdown scaffolding comment ───────────────────────────
	if (detection.setupInCreateApp || detection.shutdownInCreateApp) {
		// We do NOT remove setup/shutdown — they require human judgment.
		// Instead, prepend a prominent comment block.
		const comment =
			`// ⚠️  MIGRATION REQUIRED — setup/shutdown removed in v2\n` +
			`//\n` +
			`// Move initialisation logic to module-level code (top of this file).\n` +
			`// Replace shutdown() with registerShutdownHook() from @agentuity/runtime:\n` +
			`//\n` +
			`//   import { registerShutdownHook } from '@agentuity/runtime';\n` +
			`//   registerShutdownHook(async () => {\n` +
			`//     // your cleanup here\n` +
			`//   });\n` +
			`//\n` +
			`// Then remove the setup and shutdown props from createApp().\n`;

		// Insert just before the createApp call
		// Match: const { a, b } = await createApp  OR  const foo = await createApp  OR  export default await createApp
		out = out.replace(
			/(const|let|var)\s+(\{[^}]+\}|\w+)\s*=\s*await\s+createApp|export default await createApp/,
			`${comment}\n$&`
		);
		changes.push('Added migration comment for setup/shutdown — manual action required');
	}

	return { source: out, changes };
}
