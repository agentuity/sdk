/**
 * App Config Extractor
 *
 * Extracts analytics and workbench config from the user's createApp() call
 * in app.ts. This is the v2 approach where createApp() is the single source
 * of truth for runtime configuration (replacing agentuity.config.ts).
 *
 * Uses TypeScript's compiler API to reliably detect and extract values.
 */

import ts from 'typescript';
import { join } from 'node:path';
import type { Logger } from '../../types';

/**
 * Extracted runtime config from createApp() call.
 */
export interface ExtractedAppConfig {
	/** analytics option value: boolean, object, or undefined if not set */
	analytics?: boolean | Record<string, unknown>;
	/** workbench option value: boolean, string, object, or undefined if not set */
	workbench?: boolean | string | Record<string, unknown>;
}

/**
 * Extract analytics and workbench config from a createApp() call.
 *
 * Uses TypeScript AST to find `createApp({ ... })` and extract the values
 * of the `analytics` and `workbench` properties.
 */
function extractCreateAppConfig(sourceFile: ts.SourceFile): ExtractedAppConfig {
	const result: ExtractedAppConfig = {};

	// Walk the AST looking for createApp({ ... }) calls
	function visit(node: ts.Node): void {
		// Check for createApp(...) call
		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === 'createApp' &&
			node.arguments.length > 0
		) {
			const firstArg = node.arguments[0];
			if (!firstArg) return;
			if (ts.isObjectLiteralExpression(firstArg)) {
				// Found createApp({ ... }) — extract properties
				for (const prop of firstArg.properties) {
					if (!ts.isPropertyAssignment(prop)) continue;

					const name = ts.isIdentifier(prop.name) ? prop.name.text : undefined;
					if (!name) continue;

					// prop.initializer should always exist for PropertyAssignment, but check to satisfy TS
					if (!('initializer' in prop)) continue;
					const initializer = (prop as { initializer: ts.Expression }).initializer;

					if (name === 'analytics') {
						const value = extractValue(initializer);
						if (value !== undefined) {
							if (typeof value === 'boolean') {
								result.analytics = value;
							} else if (typeof value === 'object') {
								result.analytics = value as Record<string, unknown>;
							}
							// Ignore string/number for analytics
						}
					} else if (name === 'workbench') {
						const value = extractValue(initializer);
						if (value !== undefined) {
							if (typeof value === 'boolean' || typeof value === 'string') {
								result.workbench = value;
							} else if (typeof value === 'object') {
								result.workbench = value as Record<string, unknown>;
							}
							// Ignore number for workbench
						}
					}
				}
			}
		}

		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return result;
}

/**
 * Extract a JavaScript value from a TypeScript AST expression node.
 * Handles: boolean literals, string literals, numeric literals,
 * object literals (as Record), and identifier references (by name).
 */
function extractValue(
	node: ts.Node
): boolean | string | number | Record<string, unknown> | undefined {
	if (ts.isLiteralExpression(node)) {
		// String literal or numeric literal
		if (ts.isStringLiteral(node)) {
			return node.text;
		}
		if (ts.isNumericLiteral(node)) {
			return Number(node.text);
		}
	}

	if (node.kind === ts.SyntaxKind.TrueKeyword) {
		return true;
	}
	if (node.kind === ts.SyntaxKind.FalseKeyword) {
		return false;
	}

	if (ts.isIdentifier(node)) {
		// Return the identifier name (e.g., a variable reference)
		return node.text;
	}

	if (ts.isObjectLiteralExpression(node)) {
		const obj: Record<string, unknown> = {};
		for (const prop of node.properties) {
			if (!ts.isPropertyAssignment(prop)) continue;
			if (!ts.isIdentifier(prop.name)) continue;

			const key = prop.name.text;
			obj[key] = extractValue(prop.initializer);
		}
		return obj;
	}

	return undefined;
}

/**
 * Detect and extract analytics/workbench config from app.ts.
 *
 * This is the v2 approach: runtime config lives in createApp() only.
 * The CLI reads these values at build time via AST parsing.
 */
export async function extractAppConfig(
	rootDir: string,
	logger: Logger
): Promise<ExtractedAppConfig> {
	// Look for app.ts in root first, then src/
	let appFile = join(rootDir, 'app.ts');
	if (!(await Bun.file(appFile).exists())) {
		appFile = join(rootDir, 'src', 'app.ts');
		if (!(await Bun.file(appFile).exists())) {
			logger.trace('[config-extract] No app.ts found');
			return {};
		}
	}

	try {
		const source = await Bun.file(appFile).text();

		// Quick bail-out before parsing
		if (!source.includes('createApp')) {
			logger.trace('[config-extract] No createApp call in %s', appFile);
			return {};
		}

		// Parse with TypeScript
		const sourceFile = ts.createSourceFile(
			appFile,
			source,
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.TS
		);

		const config = extractCreateAppConfig(sourceFile);

		if (config.analytics !== undefined) {
			logger.trace('[config-extract] Found analytics in createApp(): %o', config.analytics);
		}
		if (config.workbench !== undefined) {
			logger.trace('[config-extract] Found workbench in createApp(): %o', config.workbench);
		}

		return config;
	} catch (error) {
		logger.warn('[config-extract] Failed to parse app.ts:', error);
		return {};
	}
}
