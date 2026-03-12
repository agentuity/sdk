/**
 * App Router Detector
 *
 * Parses the user's `src/app.ts` to detect whether they pass a `router` property
 * to `createApp()`. If detected, resolves the router variable(s) to their import
 * sources and mount paths.
 *
 * This allows the build tooling to derive route metadata from the actual code-based
 * route tree instead of relying on filesystem-based discovery.
 */

import * as acornLoose from 'acorn-loose';
import { join, dirname, resolve } from 'node:path';
import { existsSync, statSync } from 'node:fs';
import type { Logger } from '../../types';

interface ASTNode {
	type: string;
	start?: number;
	end?: number;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	[key: string]: any;
}

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
 * Extract the `router` property value from a `createApp()` call's argument object.
 *
 * Handles three forms:
 * - `createApp({ router: myVar })` → plain Hono, default /api mount
 * - `createApp({ router: { path: '/v1', router: myVar } })` → single RouteMount
 * - `createApp({ router: [{ path: '/v1', router: v1 }, ...] })` → array of RouteMounts
 */
function extractRouterFromCreateApp(
	callNode: ASTNode
): Array<{ path: string; varName: string }> | null {
	// createApp() must have at least one argument (the config object)
	if (!callNode.arguments || callNode.arguments.length === 0) {
		return null;
	}

	const configArg = callNode.arguments[0] as ASTNode;
	if (configArg.type !== 'ObjectExpression') {
		return null;
	}

	// Find the `router` property
	const routerProp = configArg.properties?.find(
		(p: ASTNode) =>
			p.type === 'Property' && p.key?.type === 'Identifier' && p.key?.name === 'router'
	);

	if (!routerProp) {
		return null; // No router property — file-based routing
	}

	const routerValue = routerProp.value as ASTNode;

	// Form 1: Plain Hono variable → createApp({ router: myRouter })
	if (routerValue.type === 'Identifier') {
		return [{ path: '/api', varName: routerValue.name }];
	}

	// Form 2: Single RouteMount → createApp({ router: { path: '/v1', router: myRouter } })
	if (routerValue.type === 'ObjectExpression') {
		const mount = extractRouteMountFromObject(routerValue);
		return mount ? [mount] : null;
	}

	// Form 3: Array of RouteMounts → createApp({ router: [{ path: '/v1', router: v1 }, ...] })
	if (routerValue.type === 'ArrayExpression') {
		const mounts: Array<{ path: string; varName: string }> = [];
		for (const element of routerValue.elements || []) {
			if (element?.type === 'ObjectExpression') {
				const mount = extractRouteMountFromObject(element);
				if (mount) mounts.push(mount);
			}
		}
		return mounts.length > 0 ? mounts : null;
	}

	return null;
}

/**
 * Extract { path, router } from an object literal AST node.
 */
function extractRouteMountFromObject(objNode: ASTNode): { path: string; varName: string } | null {
	let path: string | undefined;
	let varName: string | undefined;

	for (const prop of objNode.properties || []) {
		if (prop.type !== 'Property' || prop.key?.type !== 'Identifier') continue;

		if (prop.key.name === 'path' && prop.value?.type === 'Literal') {
			path = String(prop.value.value);
		}
		if (prop.key.name === 'router' && prop.value?.type === 'Identifier') {
			varName = prop.value.name;
		}
	}

	return path && varName ? { path, varName } : null;
}

/**
 * Detect whether `src/app.ts` uses `createApp({ router })`.
 *
 * Parses the file with acorn-loose, finds `createApp()` calls,
 * and resolves router variables to their import source files.
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

	// Look for app.ts in src/ (standard location)
	const appFile = join(rootDir, 'src', 'app.ts');
	if (!existsSync(appFile)) {
		// Also try root-level app.ts
		const rootAppFile = join(rootDir, 'app.ts');
		if (!existsSync(rootAppFile)) {
			logger.trace('[router-detect] No app.ts found');
			return noDetection;
		}
		return detectInFile(rootAppFile, logger);
	}

	return detectInFile(appFile, logger);
}

async function detectInFile(appFile: string, logger: Logger): Promise<AppRouterDetection> {
	const noDetection: AppRouterDetection = { detected: false, mounts: [] };
	const appDir = dirname(appFile);

	try {
		const source = await Bun.file(appFile).text();
		const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'bun' });
		const contents = transpiler.transformSync(source);

		// Quick check: skip AST parsing if createApp is not called with router
		if (!contents.includes('createApp') || !contents.includes('router')) {
			logger.trace('[router-detect] No createApp + router pattern found in %s', appFile);
			return noDetection;
		}

		const ast = acornLoose.parse(contents, {
			locations: true,
			ecmaVersion: 'latest',
			sourceType: 'module',
		}) as ASTNode;

		// Build import map: variable name → import path
		const importMap = new Map<string, string>();
		for (const node of ast.body || []) {
			if (node.type === 'ImportDeclaration' && node.source?.value) {
				for (const spec of node.specifiers || []) {
					if (spec.local?.name) {
						importMap.set(spec.local.name, String(node.source.value));
					}
				}
			}
		}

		// Walk all statements looking for createApp() calls
		const routerMounts = findCreateAppRouterCalls(ast, importMap);

		if (!routerMounts || routerMounts.length === 0) {
			logger.trace('[router-detect] createApp() found but no router property');
			return noDetection;
		}

		// Resolve each router variable to its file
		const mounts: DetectedRouteMount[] = [];
		for (const { path, varName } of routerMounts) {
			const importPath = importMap.get(varName);
			if (!importPath) {
				logger.debug(
					'[router-detect] Router variable %s is not imported — may be defined locally',
					varName
				);
				// Could be defined in the same file — skip for now
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

/**
 * Walk the AST looking for `createApp({ router: ... })` calls.
 * Handles:
 * - `createApp({ router })` (top-level expression)
 * - `const app = await createApp({ router })` (variable declaration)
 * - `export const app = await createApp({ router })` (exported)
 */
function findCreateAppRouterCalls(
	ast: ASTNode,
	importMap: Map<string, string>
): Array<{ path: string; varName: string }> | null {
	for (const node of ast.body || []) {
		// Check expression statements: createApp({ router })
		if (node.type === 'ExpressionStatement') {
			const result = checkForCreateAppCall(node.expression, importMap);
			if (result) return result;
		}

		// Check variable declarations: const app = await createApp({ router })
		if (node.type === 'VariableDeclaration') {
			for (const decl of node.declarations || []) {
				if (decl.init) {
					const result = checkForCreateAppCall(decl.init, importMap);
					if (result) return result;
				}
			}
		}

		// Check exports: export const app = await createApp({ router })
		if (node.type === 'ExportNamedDeclaration' && node.declaration) {
			if (node.declaration.type === 'VariableDeclaration') {
				for (const decl of node.declaration.declarations || []) {
					if (decl.init) {
						const result = checkForCreateAppCall(decl.init, importMap);
						if (result) return result;
					}
				}
			}
		}
	}

	return null;
}

/**
 * Check if an expression node is a `createApp({ router })` call.
 * Unwraps `await` expressions.
 */
function checkForCreateAppCall(
	expr: ASTNode,
	importMap: Map<string, string>
): Array<{ path: string; varName: string }> | null {
	if (!expr) return null;

	// Unwrap AwaitExpression: await createApp(...)
	if (expr.type === 'AwaitExpression' && expr.argument) {
		return checkForCreateAppCall(expr.argument, importMap);
	}

	// Check for createApp({ router })
	if (
		expr.type === 'CallExpression' &&
		expr.callee?.type === 'Identifier' &&
		expr.callee?.name === 'createApp'
	) {
		return extractRouterFromCreateApp(expr);
	}

	return null;
}
