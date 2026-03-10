/**
 * Lifecycle Types Generator
 *
 * Generates src/generated/state.ts and src/generated/router.ts by analyzing
 * app.ts for a setup() function.
 *
 * Uses TypeScript's type checker to extract the real return type of setup —
 * no AST literal guessing needed.
 */

import ts from 'typescript';
import { join, relative, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { StructuredError } from '@agentuity/core';
import type { Logger } from '../../../types';
import { toForwardSlash } from '../../../utils/normalize-path';

const RuntimePackageNotFound = StructuredError('RuntimePackageNotFound');

/**
 * Use the TypeScript type checker to extract the return type of the setup
 * function passed to createApp(). Works with inline setup, exported setup,
 * variable references, async functions — anything TS can resolve.
 */
function extractSetupReturnType(appFilePath: string, logger: Logger): string | null {
	const compilerOptions: ts.CompilerOptions = {
		target: ts.ScriptTarget.ESNext,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		strict: true,
		skipLibCheck: true,
		noEmit: true,
		allowJs: true,
		esModuleInterop: true,
	};

	const program = ts.createProgram([appFilePath], compilerOptions);
	const checker = program.getTypeChecker();
	const sourceFile = program.getSourceFile(appFilePath);

	if (!sourceFile) {
		logger.debug('[lifecycle] Could not load source file');
		return null;
	}

	let setupType: ts.Type | null = null;

	function unwrapPromise(type: ts.Type): ts.Type {
		// Check for Promise by looking at typeArguments on TypeReference
		const typeRef = type as ts.TypeReference;
		if (typeRef.typeArguments && typeRef.typeArguments.length > 0) {
			const symbol = type.getSymbol() ?? type.aliasSymbol;
			if (symbol?.name === 'Promise') {
				return typeRef.typeArguments[0]!;
			}
		}
		return type;
	}

	function extractFromProperty(prop: ts.ObjectLiteralElementLike): void {
		if (setupType) return;

		// Handle: setup: () => { ... }  or  setup: myFunc
		if (
			ts.isPropertyAssignment(prop) &&
			ts.isIdentifier(prop.name) &&
			prop.name.text === 'setup'
		) {
			const type = checker.getTypeAtLocation(prop.initializer);
			const callSigs = type.getCallSignatures();
			if (callSigs.length > 0) {
				setupType = unwrapPromise(checker.getReturnTypeOfSignature(callSigs[0]!));
			}
			return;
		}

		// Handle shorthand: createApp({ setup })
		if (ts.isShorthandPropertyAssignment(prop) && prop.name.text === 'setup') {
			const type = checker.getTypeAtLocation(prop.name);
			const callSigs = type.getCallSignatures();
			if (callSigs.length > 0) {
				setupType = unwrapPromise(checker.getReturnTypeOfSignature(callSigs[0]!));
			}
		}
	}

	function visit(node: ts.Node): void {
		if (setupType) return;

		// Find createApp(...) call — with or without await
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
					extractFromProperty(prop);
					if (setupType) return;
				}
			}
		}

		ts.forEachChild(node, visit);
	}

	visit(sourceFile);

	// Fallback: look for an exported function named `setup` in the file
	// (user may define `export function setup()` without passing it to createApp)
	if (!setupType) {
		for (const stmt of sourceFile.statements) {
			if (
				ts.isFunctionDeclaration(stmt) &&
				stmt.name?.text === 'setup' &&
				stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
			) {
				const type = checker.getTypeAtLocation(stmt);
				const callSigs = type.getCallSignatures();
				if (callSigs.length > 0) {
					setupType = unwrapPromise(checker.getReturnTypeOfSignature(callSigs[0]!));
				}
				break;
			}

			// Handle: export const setup = () => { ... }
			if (
				ts.isVariableStatement(stmt) &&
				stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
			) {
				for (const decl of stmt.declarationList.declarations) {
					if (ts.isIdentifier(decl.name) && decl.name.text === 'setup' && decl.initializer) {
						const type = checker.getTypeAtLocation(decl.initializer);
						const callSigs = type.getCallSignatures();
						if (callSigs.length > 0) {
							setupType = unwrapPromise(checker.getReturnTypeOfSignature(callSigs[0]!));
						}
						break;
					}
				}
				if (setupType) break;
			}
		}
	}

	if (!setupType) {
		return null;
	}

	// Print the type as a string — TS gives us the real resolved type
	const typeString = checker.typeToString(
		setupType,
		undefined,
		ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.MultilineObjectLiterals
	);

	return typeString;
}

/**
 * Find the @agentuity/runtime package by walking up the directory tree.
 */
async function findRuntimePackage(rootDir: string, logger: Logger): Promise<string> {
	let currentDir = rootDir;
	const searchedPaths: string[] = [];

	while (currentDir && currentDir !== '/' && currentDir !== '.') {
		const candidatePath = join(currentDir, 'node_modules', '@agentuity', 'runtime');
		searchedPaths.push(candidatePath);
		if (await Bun.file(join(candidatePath, 'package.json')).exists()) {
			logger.debug(`Found runtime package at: ${candidatePath}`);
			return candidatePath;
		}

		const packagesPath = join(currentDir, 'packages', 'runtime');
		searchedPaths.push(packagesPath);
		if (await Bun.file(join(packagesPath, 'package.json')).exists()) {
			logger.debug(`Found runtime package (source) at: ${packagesPath}`);
			return packagesPath;
		}

		const parent = dirname(currentDir);
		if (parent === currentDir) break;
		currentDir = parent;
	}

	throw new RuntimePackageNotFound({
		message:
			`@agentuity/runtime package not found.\n` +
			`Searched paths:\n${searchedPaths.map((p) => `  - ${p}`).join('\n')}\n` +
			`Make sure dependencies are installed by running 'bun install' or 'npm install'`,
	});
}

function generateStateContent(appStateType: string): string {
	return `// @generated
// AUTO-GENERATED from app.ts setup() return type
// This file is auto-generated by the build tool - do not edit manually

/**
 * Application state type inferred from your createApp setup function.
 * This type is automatically generated and available throughout your app via ctx.app.
 *
 * @example
 * \`\`\`typescript
 * // In your agents:
 * const agent = createAgent({
 *   handler: async (ctx, input) => {
 *     // ctx.app is strongly typed as GeneratedAppState
 *     const value = ctx.app; // All properties from your setup return value
 *     return 'result';
 *   }
 * });
 * \`\`\`
 */
export type GeneratedAppState = ${appStateType};

// Augment the @agentuity/runtime module with AppState
declare module '@agentuity/runtime' {
	interface AppState extends GeneratedAppState {}
}

// FOUND AN ERROR IN THIS FILE?
// Please file an issue at https://github.com/agentuity/sdk/issues
// or if you know the fix please submit a PR!
`;
}

function generateRouterWrapper(runtimeImportPath: string): string {
	return `// @generated
// AUTO-GENERATED runtime wrapper
// This file is auto-generated by the build tool - do not edit manually

// Import augmentations file (NOT type-only) to trigger module augmentation
import type { GeneratedAppState } from './state';
import './state';

// Import from actual package location
import { createRouter as baseCreateRouter, type Env } from '${runtimeImportPath}/src/index';
import type { Hono } from 'hono';

// Type aliases to avoid repeating the generic parameter
type AppEnv = Env<GeneratedAppState>;
type AppRouter = Hono<AppEnv>;

/**
 * Creates a Hono router with extended methods for Agentuity-specific routing patterns.
 *
 * @returns Extended Hono router with custom methods and app state typing
 *
 * @example
 * \`\`\`typescript
 * const router = createRouter();
 * router.get('/hello', (c) => c.text('Hello!'));
 * router.get('/db', (c) => {
 *   const db = c.var.app; // Your app state from createApp setup
 *   return c.json({ connected: true });
 * });
 * \`\`\`
 */
export function createRouter(): AppRouter {
	return baseCreateRouter() as unknown as AppRouter;
}

// Re-export everything else
export * from '${runtimeImportPath}/src/index';

// FOUND AN ERROR IN THIS FILE?
// Please file an issue at https://github.com/agentuity/sdk/issues
// or if you know the fix please submit a PR!
`;
}

async function updateTsconfigPathMapping(
	rootDir: string,
	shouldAdd: boolean,
	logger: Logger
): Promise<void> {
	const tsconfigPath = join(rootDir, 'tsconfig.json');
	if (!(await Bun.file(tsconfigPath).exists())) {
		logger.debug('No tsconfig.json found, skipping path mapping update');
		return;
	}

	try {
		const tsconfigContent = await Bun.file(tsconfigPath).text();
		const { default: JSON5 } = await import('json5');
		const tsconfig = JSON5.parse(tsconfigContent);
		const before = JSON.stringify(tsconfig);

		if (!tsconfig.compilerOptions) tsconfig.compilerOptions = {};
		if (!tsconfig.compilerOptions.paths) tsconfig.compilerOptions.paths = {};

		if (shouldAdd) {
			tsconfig.compilerOptions.paths['@agentuity/runtime'] = ['./src/generated/router.ts'];
			logger.debug('Added @agentuity/runtime path mapping to tsconfig.json');
		} else {
			if (tsconfig.compilerOptions.paths['@agentuity/runtime']) {
				delete tsconfig.compilerOptions.paths['@agentuity/runtime'];
				logger.debug('Removed @agentuity/runtime path mapping from tsconfig.json');
			}
			if (Object.keys(tsconfig.compilerOptions.paths).length === 0) {
				delete tsconfig.compilerOptions.paths;
			}
		}

		if (JSON.stringify(tsconfig) === before) return;
		await Bun.write(tsconfigPath, JSON.stringify(tsconfig, null, '\t') + '\n');
	} catch (error) {
		logger.warn('Failed to update tsconfig.json:', error);
	}
}

/**
 * Setup lifecycle types by analyzing app.ts for setup() function.
 *
 * Uses TypeScript's type checker to extract the real return type — handles
 * inline setup, exported setup, variable references, async functions, and
 * any other pattern TS can resolve.
 */
export async function generateLifecycleTypes(
	rootDir: string,
	srcDir: string,
	logger: Logger
): Promise<boolean> {
	logger.debug('[lifecycle] Starting lifecycle type generation...');

	const outDir = join(srcDir, 'generated');

	// Look for app.ts in both root and src directories
	const rootAppFile = join(rootDir, 'app.ts');
	const srcAppFile = join(srcDir, 'app.ts');

	let appFile = '';
	if (await Bun.file(rootAppFile).exists()) {
		appFile = rootAppFile;
	} else if (await Bun.file(srcAppFile).exists()) {
		appFile = srcAppFile;
	}

	if (!appFile || !(await Bun.file(appFile).exists())) {
		logger.debug('[lifecycle] No app.ts found');
		return false;
	}

	// Use TypeScript type checker to extract the setup return type
	const appStateType = extractSetupReturnType(appFile, logger);

	if (!appStateType) {
		logger.debug('[lifecycle] No setup() function found in createApp');
		await updateTsconfigPathMapping(rootDir, false, logger);
		return false;
	}

	logger.debug(`[lifecycle] Extracted setup return type: ${appStateType}`);

	// Generate files
	mkdirSync(outDir, { recursive: true });

	const runtimePkgPath = await findRuntimePackage(rootDir, logger);
	const runtimeImportPath = toForwardSlash(relative(outDir, runtimePkgPath));

	await Bun.write(join(outDir, 'state.ts'), generateStateContent(appStateType));
	logger.debug(`Generated lifecycle types: ${join(outDir, 'state.ts')}`);

	await Bun.write(join(outDir, 'router.ts'), generateRouterWrapper(runtimeImportPath));
	logger.debug(`Generated lifecycle wrapper: ${join(outDir, 'router.ts')}`);

	await updateTsconfigPathMapping(rootDir, true, logger);

	return true;
}
