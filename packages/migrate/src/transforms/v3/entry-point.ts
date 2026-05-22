/**
 * Transform: app.ts → src/index.ts
 *
 * Converts a v2 createApp()-based entry point into a plain Hono application
 * with agentuity() middleware.
 *
 * Strategy: rather than doing complex AST surgery on the user's file, we
 * generate a clean src/index.ts from the detection data and leave the old
 * app.ts intact (caller deletes it after confirming).  This avoids edge cases
 * with custom formatting and gives users a clean starting point.
 */

import type { V3DetectionResult } from '../../detect-v3';

export interface EntryPointTransformResult {
	/** Generated source for src/index.ts, or null if skipped */
	source: string | null;
	/** What was changed */
	changes: string[];
}

/**
 * Generate a new src/index.ts from the detection result.
 */
export function generateEntryPoint(detection: V3DetectionResult): EntryPointTransformResult {
	if (!detection.hasCreateApp) {
		return { source: null, changes: [] };
	}

	const changes: string[] = [];
	const imports: string[] = [];
	const middlewares: string[] = [];
	const routes: string[] = [];

	// Core imports
	imports.push("import { Hono } from 'hono';");
	imports.push("import { agentuity } from '@agentuity/hono';");

	// Always add agentuity middleware
	middlewares.push("app.use('*', agentuity());");
	changes.push('Added agentuity() middleware (telemetry + services)');

	// CORS — if the user had cors config in createApp()
	if (detection.createAppProps.includes('cors')) {
		imports.push("import { cors } from 'hono/cors';");
		middlewares.push(
			'// TODO: Configure CORS options — the v2 sameOrigin option is not available in hono/cors.\n' +
				'// See: https://hono.dev/docs/middleware/builtin/cors\n' +
				"app.use('*', cors());"
		);
		changes.push('Added cors() middleware (review config — v2 sameOrigin not available)');
	}

	// Router mount — check if there was a router in createApp
	if (detection.createAppProps.includes('router')) {
		// Try to figure out the router path from the original app.ts
		// Default to /api which is the v2 convention
		imports.push("import router from './api';");
		routes.push("app.route('/api', router);");
		changes.push('Mounted API router at /api');
	}

	// Build the file
	const lines: string[] = [];

	lines.push(...imports);
	lines.push('');
	lines.push('const app = new Hono();');
	lines.push('');

	if (middlewares.length > 0) {
		lines.push(...middlewares);
		lines.push('');
	}

	if (routes.length > 0) {
		lines.push(...routes);
		lines.push('');
	}

	lines.push('export default app;');
	lines.push('');

	changes.push('Generated src/index.ts with Hono app (replaces app.ts + createApp)');

	return {
		source: lines.join('\n'),
		changes,
	};
}
