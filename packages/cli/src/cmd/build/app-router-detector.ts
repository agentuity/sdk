/**
 * App Router Detector
 *
 * Parses the user's `src/app.ts` to detect whether they pass a `router` property
 * to `createApp()`. If detected, resolves the router variable(s) to their import
 * sources and mount paths.
 *
 * Uses TypeScript's compiler API to reliably detect the pattern, consistent with
 * the lifecycle generator approach.
 */

import ts from 'typescript';
import { join, dirname, resolve } from 'node:path';
import { existsSync, statSync } from 'node:fs';
import type { Logger } from '../../types';

/**
 * A resolved mount point from `createApp({ router })`.
 */
export interface DetectedRouteMount {
	/** Mount path (e.g., '/api', '/api/v1') */
	path: string;
	/** Absolute file path of the router module */
	routerFile: string;
}

/**
 * Result of detecting explicit router usage in app.ts.
 */
export interface AppRouterDetection {
	/** Whether `createApp({ router })` was found */
	detected: boolean;
	/** Resolved mount points with their router files */
	mounts: DetectedRouteMount[];
}

/**
 * Resolve an import path to an actual file on disk.
 * Tries the path as-is, then with common extensions.
 */
function resolveImportFile(fromDir: string, importPath: string): string | null {
	if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
		return null; // Package import — can't resolve
	}

	const basePath = resolve(fromDir, importPath);
	const extensions = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

	if (existsSync(basePath)) {
		try {
			if (statSync(basePath).isFile()) return basePath;
		} catch {
			// ignore
		}
	}

	for (const ext of extensions) {
		const candidate = basePath + ext;
		if (existsSync(candidate)) {
			return candidate;
		}
	}

	return null;
}

/**
 * A router mount extracted from the AST before file resolution.
 */
interface RawMount {
	path: string;
	varName: string;
}

/**
 * Extract router mounts from a createApp() call using TypeScript's AST.
 * Returns null if no router property found.
 */
function extractRouterMounts(sourceFile: ts.SourceFile): RawMount[] | null {
	let result: RawMount[] | null = null;

	function getStringLiteral(node: ts.Expression): string | null {
		if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
			return node.text;
		}
		return null;
	}

	function extractMountFromObject(obj: ts.ObjectLiteralExpression): RawMount | null {
		let path: string | undefined;
		let varName: string | undefined;

		for (const prop of obj.properties) {
			if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;

			if (prop.name.text === 'path') {
				path = getStringLiteral(prop.initializer) ?? undefined;
			}
			if (prop.name.text === 'router') {
				if (ts.isIdentifier(prop.initializer)) {
					varName = prop.initializer.text;
				}
			}
		}

		// Also handle shorthand: { path: '/v1', router } where router is shorthand
		for (const prop of obj.properties) {
			if (ts.isShorthandPropertyAssignment(prop) && prop.name.text === 'router') {
				varName = prop.name.text;
			}
		}

		return path && varName ? { path, varName } : null;
	}

	function processRouterValue(value: ts.Expression): RawMount[] | null {
		// Form 1: Identifier → createApp({ router: myRouter })
		if (ts.isIdentifier(value)) {
			return [{ path: '/api', varName: value.text }];
		}

		// Form 2: Object → createApp({ router: { path: '/v1', router: myRouter } })
		if (ts.isObjectLiteralExpression(value)) {
			const mount = extractMountFromObject(value);
			return mount ? [mount] : null;
		}

		// Form 3: Array → createApp({ router: [...] })
		if (ts.isArrayLiteralExpression(value)) {
			const mounts: RawMount[] = [];
			for (const element of value.elements) {
				if (ts.isObjectLiteralExpression(element)) {
					const mount = extractMountFromObject(element);
					if (mount) mounts.push(mount);
				}
			}
			return mounts.length > 0 ? mounts : null;
		}

		return null;
	}

	function visit(node: ts.Node): void {
		if (result) return;

		// Find createApp(...) — with or without await
		let callExpr: ts.CallExpression | undefined;

		if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
			if (node.expression.text === 'createApp') callExpr = node;
		} else if (ts.isAwaitExpression(node) && ts.isCallExpression(node.expression)) {
			const call = node.expression;
			if (ts.isIdentifier(call.expression) && call.expression.text === 'createApp') {
				callExpr = call;
			}
		}

		if (callExpr && callExpr.arguments.length > 0) {
			const configArg = callExpr.arguments[0];
			if (configArg && ts.isObjectLiteralExpression(configArg)) {
				for (const prop of configArg.properties) {
					// Handle: router: value
					if (
						ts.isPropertyAssignment(prop) &&
						ts.isIdentifier(prop.name) &&
						prop.name.text === 'router'
					) {
						result = processRouterValue(prop.initializer);
						return;
					}

					// Handle shorthand: createApp({ router })
					if (ts.isShorthandPropertyAssignment(prop) && prop.name.text === 'router') {
						result = [{ path: '/api', varName: 'router' }];
						return;
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
 * Build import map from the source file: variable name → import path
 */
function buildImportMap(sourceFile: ts.SourceFile): Map<string, string> {
	const importMap = new Map<string, string>();

	for (const stmt of sourceFile.statements) {
		if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;

		const importPath = stmt.moduleSpecifier.text;
		const clause = stmt.importClause;
		if (!clause) continue;

		// Default import: import router from './api'
		if (clause.name) {
			importMap.set(clause.name.text, importPath);
		}

		// Named imports: import { v1, v2 } from './routers'
		if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
			for (const spec of clause.namedBindings.elements) {
				importMap.set(spec.name.text, importPath);
			}
		}
	}

	return importMap;
}

/**
 * Detect whether `src/app.ts` uses `createApp({ router })`.
 *
 * Returns `{ detected: false, mounts: [] }` when:
 * - `src/app.ts` doesn't exist
 * - `createApp()` is called without a `router` property
 * - Router variables can't be resolved to files
 */
export async function detectExplicitRouter(
	rootDir: string,
	logger: Logger
): Promise<AppRouterDetection> {
	const noDetection: AppRouterDetection = { detected: false, mounts: [] };

	// Look for app.ts in src/ (standard location), then root
	let appFile = join(rootDir, 'src', 'app.ts');
	if (!existsSync(appFile)) {
		appFile = join(rootDir, 'app.ts');
		if (!existsSync(appFile)) {
			logger.trace('[router-detect] No app.ts found');
			return noDetection;
		}
	}

	try {
		const source = await Bun.file(appFile).text();
		const appDir = dirname(appFile);

		// Quick bail-out before parsing
		if (!source.includes('createApp') || !source.includes('router')) {
			logger.trace('[router-detect] No createApp + router pattern found in %s', appFile);
			return noDetection;
		}

		// Parse with TypeScript
		const sourceFile = ts.createSourceFile(
			appFile,
			source,
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.TS
		);

		const rawMounts = extractRouterMounts(sourceFile);
		if (!rawMounts || rawMounts.length === 0) {
			logger.trace('[router-detect] createApp() found but no router property');
			return noDetection;
		}

		// Build import map to resolve variable names to file paths
		const importMap = buildImportMap(sourceFile);

		// Resolve each router variable to its file
		const mounts: DetectedRouteMount[] = [];
		for (const { path, varName } of rawMounts) {
			const importPath = importMap.get(varName);
			if (!importPath) {
				logger.debug(
					'[router-detect] Router variable %s is not imported — may be defined locally',
					varName
				);
				continue;
			}

			const resolvedFile = resolveImportFile(appDir, importPath);
			if (!resolvedFile) {
				logger.warn(
					'[router-detect] Could not resolve import %s for router variable %s',
					importPath,
					varName
				);
				continue;
			}

			logger.trace(
				'[router-detect] Found router mount: %s → %s (%s)',
				path,
				varName,
				resolvedFile
			);
			mounts.push({ path, routerFile: resolvedFile });
		}

		if (mounts.length === 0) {
			logger.debug('[router-detect] Router variables found but none could be resolved to files');
			return noDetection;
		}

		logger.debug(
			'[router-detect] Detected %d explicit router mount(s) in %s',
			mounts.length,
			appFile
		);
		return { detected: true, mounts };
	} catch (error) {
		logger.warn(
			'[router-detect] Failed to parse %s: %s',
			appFile,
			error instanceof Error ? error.message : String(error)
		);
		return noDetection;
	}
}
