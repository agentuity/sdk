/**
 * V1 pattern detection.
 *
 * Analyses a project directory and returns a structured report of every v1
 * artefact that needs to be migrated to v2.  No files are modified here.
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Severity of a finding — drives the interactive prompt */
export type Severity =
	| 'auto' // fully mechanical; the codemod will handle it without user input
	| 'guided' // the tool can apply a transform but needs user to verify
	| 'manual'; // requires human attention; tool will explain but not touch

export interface Finding {
	/** Short identifier used to reference this finding in transforms */
	id: string;
	severity: Severity;
	/** Human-readable summary */
	message: string;
	/** File relative to project root, or undefined for project-level findings */
	file?: string;
	/** Extra detail or migration hint shown in the report */
	hint?: string;
}

export interface DetectionResult {
	projectDir: string;
	/** All findings, ordered by severity (auto → guided → manual) */
	findings: Finding[];
	/** Absolute path to app.ts, if found */
	appTsPath?: string;
	/** Absolute path to src/generated dir, if it exists */
	generatedDir?: string;
	/** Absolute paths of route files detected as v1-style (mutating createRouter) */
	v1RouteFiles: string[];
	/** Absolute paths of route files already in v2-style (chained Hono) */
	v2RouteFiles: string[];
	/** Whether src/agent/index.ts barrel exists */
	hasAgentBarrel: boolean;
	/** Whether src/api/index.ts barrel exists */
	hasApiBarrel: boolean;
	/** Whether agentuity.config.ts exists */
	hasAgentuityConfig: boolean;
	/** Whether app.ts passes analytics/workbench inside createApp() */
	analyticsInCreateApp: boolean;
	workbenchInCreateApp: boolean;
	/** Whether app.ts passes setup/shutdown inside createApp() */
	setupInCreateApp: boolean;
	shutdownInCreateApp: boolean;
	/** Whether app.ts calls bootstrapRuntimeEnv() */
	bootstrapCallInAppTs: boolean;
	/** Whether frontend code uses removed APIs */
	frontendRemovedApis: FrontendFinding[];
}

export interface FrontendFinding {
	file: string;
	apis: string[];
	/** APIs that are deprecated (still work but should migrate away) */
	deprecatedApis?: string[];
}

// ---------------------------------------------------------------------------
// Removed frontend API names
// ---------------------------------------------------------------------------

const REMOVED_REACT_APIS = new Set([
	'createAPIClient',
	'useAPI',
	'createClient',
	'RouteRegistry',
	'RPCRouteRegistry',
	'SSERouteRegistry',
	'WebSocketRouteRegistry',
]);

/**
 * APIs that are deprecated (still work but will be removed).
 * Users should migrate away from these.
 */
const DEPRECATED_REACT_APIS = new Set([
	'AgentuityProvider',
	'AgentuityContext',
	'useAgentuity',
	'useAuth',
	'useAnalytics',
	'useTrackOnMount',
	'withPageTracking',
	'useWebRTCCall',
	'useJsonMemo',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rel(projectDir: string, abs: string): string {
	return relative(projectDir, abs);
}

/**
 * Walk a directory recursively, yielding all file paths that match the
 * given extension filter.
 */
function* walkFiles(dir: string, exts: string[]): Generator<string> {
	if (!existsSync(dir)) return;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			// Skip known non-source dirs
			if (['node_modules', 'dist', '.agentuity', '.git'].includes(entry.name)) continue;
			yield* walkFiles(full, exts);
		} else if (entry.isFile() && exts.some((e) => entry.name.endsWith(e))) {
			yield full;
		}
	}
}

/** Parse a TypeScript source file and return the AST */
async function parseTs(filePath: string): Promise<ts.SourceFile> {
	const src = await Bun.file(filePath).text();
	return ts.createSourceFile(filePath, src, ts.ScriptTarget.ESNext, true);
}

/**
 * Collect the property names present inside a specific function call's first
 * object-literal argument.
 *
 * e.g. given `createApp({ router, agents, setup })` → ['router','agents','setup']
 */
function getCreateAppProps(sourceFile: ts.SourceFile): Set<string> {
	const props = new Set<string>();

	function visit(node: ts.Node) {
		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === 'createApp'
		) {
			const arg = node.arguments[0];
			if (arg && ts.isObjectLiteralExpression(arg)) {
				for (const prop of arg.properties) {
					if (
						(ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) &&
						ts.isIdentifier(prop.name)
					) {
						props.add(prop.name.text);
					}
				}
			}
		}
		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return props;
}

/**
 * Returns true if the source file contains a call to `bootstrapRuntimeEnv()`
 */
function hasBootstrapCall(sourceFile: ts.SourceFile): boolean {
	let found = false;

	function visit(node: ts.Node) {
		if (found) return;
		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === 'bootstrapRuntimeEnv'
		) {
			found = true;
			return;
		}
		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return found;
}

/**
 * Detect whether a route file uses v1 mutable-style `createRouter()` +
 * `router.get(...)` vs v2 chained `new Hono<Env>().get(...)`.
 *
 * Returns 'v1' | 'v2' | 'unknown' (file doesn't look like a route at all).
 */
function classifyRouteFile(sourceFile: ts.SourceFile): 'v1' | 'v2' | 'unknown' {
	// sync — receives parsed AST
	let hasCreateRouter = false;
	let hasMutatingCall = false; // router.get / router.post etc.
	let hasHonoNew = false;

	function visit(node: ts.Node) {
		// createRouter() call
		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === 'createRouter'
		) {
			hasCreateRouter = true;
		}

		// router.<method>(...) — mutating style
		if (
			ts.isCallExpression(node) &&
			ts.isPropertyAccessExpression(node.expression) &&
			ts.isIdentifier(node.expression.name)
		) {
			const methodName = node.expression.name.text;
			if (
				['get', 'post', 'put', 'patch', 'delete', 'all', 'use', 'route'].includes(methodName)
			) {
				// Check that the object being accessed is NOT a chained call (i.e., it's an identifier)
				if (ts.isIdentifier(node.expression.expression)) {
					hasMutatingCall = true;
				}
			}
		}

		// new Hono<...>()
		if (
			ts.isNewExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === 'Hono'
		) {
			hasHonoNew = true;
		}

		ts.forEachChild(node, visit);
	}

	visit(sourceFile);

	if (hasHonoNew) return 'v2';
	if (hasCreateRouter && hasMutatingCall) return 'v1';
	return 'unknown';
}

/**
 * Scan frontend (web) source files for removed API usages.
 */
async function scanFrontendFiles(projectDir: string): Promise<FrontendFinding[]> {
	const webDir = join(projectDir, 'src', 'web');
	const findings: FrontendFinding[] = [];

	for (const file of walkFiles(webDir, ['.ts', '.tsx'])) {
		const sourceFile = await parseTs(file);
		const usedApis: string[] = [];
		const deprecatedApis: string[] = [];

		function visit(node: ts.Node) {
			// Check named imports from @agentuity/react or @agentuity/frontend
			if (ts.isImportDeclaration(node)) {
				const moduleSpecifier = (node.moduleSpecifier as ts.StringLiteral).text;
				if (
					moduleSpecifier === '@agentuity/react' ||
					moduleSpecifier === '@agentuity/frontend'
				) {
					const namedBindings = node.importClause?.namedBindings;
					if (namedBindings && ts.isNamedImports(namedBindings)) {
						for (const element of namedBindings.elements) {
							const name = element.name.text;
							if (REMOVED_REACT_APIS.has(name)) {
								usedApis.push(name);
							}
							if (DEPRECATED_REACT_APIS.has(name)) {
								deprecatedApis.push(name);
							}
						}
					}
				}
			}
			ts.forEachChild(node, visit);
		}

		visit(sourceFile);

		if (usedApis.length > 0 || deprecatedApis.length > 0) {
			findings.push({
				file: rel(projectDir, file),
				apis: [...new Set(usedApis)],
				deprecatedApis: [...new Set(deprecatedApis)],
			});
		}
	}

	return findings;
}

/**
 * Find all route files under src/api (recursively, files named `route.ts` or
 * `route.tsx` or `router.ts`).
 */
function findRouteFiles(projectDir: string): string[] {
	const apiDir = join(projectDir, 'src', 'api');
	const files: string[] = [];

	for (const file of walkFiles(apiDir, ['.ts', '.tsx'])) {
		const base = file.split('/').pop() ?? '';
		if (base === 'route.ts' || base === 'route.tsx' || base === 'router.ts') {
			files.push(file);
		}
	}

	return files;
}

// ---------------------------------------------------------------------------
// Main detector
// ---------------------------------------------------------------------------

export async function detect(projectDir: string): Promise<DetectionResult> {
	const absDir = resolve(projectDir);
	const findings: Finding[] = [];

	const result: DetectionResult = {
		projectDir: absDir,
		findings,
		v1RouteFiles: [],
		v2RouteFiles: [],
		hasAgentBarrel: false,
		hasApiBarrel: false,
		hasAgentuityConfig: false,
		analyticsInCreateApp: false,
		workbenchInCreateApp: false,
		setupInCreateApp: false,
		shutdownInCreateApp: false,
		bootstrapCallInAppTs: false,
		frontendRemovedApis: [],
	};

	// ── 1. src/generated/ ───────────────────────────────────────────────────
	const generatedDir = join(absDir, 'src', 'generated');
	if (existsSync(generatedDir) && statSync(generatedDir).isDirectory()) {
		result.generatedDir = generatedDir;
		findings.push({
			id: 'generated-dir',
			severity: 'auto',
			message: 'src/generated/ directory exists (CLI-managed codegen artefacts)',
			file: rel(absDir, generatedDir),
			hint: 'Will be deleted. In v2, types come from Hono RPC inference and direct imports.',
		});
	}

	// ── 2. app.ts ────────────────────────────────────────────────────────────
	const appTsPath = join(absDir, 'app.ts');
	if (existsSync(appTsPath)) {
		result.appTsPath = appTsPath;
		const sourceFile = await parseTs(appTsPath);
		const props = getCreateAppProps(sourceFile);

		result.bootstrapCallInAppTs = hasBootstrapCall(sourceFile);
		if (result.bootstrapCallInAppTs) {
			findings.push({
				id: 'bootstrap-call',
				severity: 'auto',
				message: 'app.ts calls bootstrapRuntimeEnv() — removed in v2',
				file: 'app.ts',
				hint: 'createApp() handles runtime bootstrapping internally; the call will be removed.',
			});
		}

		result.setupInCreateApp = props.has('setup');
		if (result.setupInCreateApp) {
			findings.push({
				id: 'setup-in-createapp',
				severity: 'guided',
				message: 'createApp({ setup }) — setup() lifecycle removed in v2',
				file: 'app.ts',
				hint:
					'Move initialisation logic to module-level top-of-file code in app.ts. ' +
					'If you need shutdown cleanup, call registerShutdownHook() from @agentuity/runtime.',
			});
		}

		result.shutdownInCreateApp = props.has('shutdown');
		if (result.shutdownInCreateApp) {
			findings.push({
				id: 'shutdown-in-createapp',
				severity: 'guided',
				message: 'createApp({ shutdown }) — shutdown() lifecycle removed in v2',
				file: 'app.ts',
				hint:
					'Replace with registerShutdownHook(() => { /* your cleanup */ }) from @agentuity/runtime. ' +
					'Shutdown hooks are called LIFO on SIGTERM/SIGINT.',
			});
		}

		result.analyticsInCreateApp = props.has('analytics');
		if (result.analyticsInCreateApp) {
			// v2 keeps analytics in createApp() - no migration needed
			// This is tracked for informational purposes only
		}

		result.workbenchInCreateApp = props.has('workbench');
		if (result.workbenchInCreateApp) {
			// v2 keeps workbench in createApp() - no migration needed
			// This is tracked for informational purposes only
		}

		// Check if router/agents are already wired (v2 pattern)
		const hasRouter = props.has('router');
		const hasAgents = props.has('agents');
		if (!hasRouter && !hasAgents) {
			findings.push({
				id: 'app-no-router-agents',
				severity: 'guided',
				message: 'app.ts does not pass router or agents to createApp()',
				file: 'app.ts',
				hint:
					'In v2, you must explicitly import and pass your router and agents array.\n' +
					'\n' +
					"  import router from './src/api';\n" +
					"  import agents from './src/agent';\n" +
					'\n' +
					'  const { server, logger } = await createApp({\n' +
					"    router: { path: '/api', router },\n" +
					'    agents,\n' +
					'  });\n' +
					'\n' +
					'The src/api/index.ts and src/agent/index.ts barrels are generated by this tool.',
			});
		}
	} else {
		findings.push({
			id: 'no-app-ts',
			severity: 'manual',
			message: 'No app.ts found at project root',
			hint: 'Create app.ts importing createApp from @agentuity/runtime.',
		});
	}

	// ── 3. agentuity.config.ts ───────────────────────────────────────────────
	const configPath = join(absDir, 'agentuity.config.ts');
	result.hasAgentuityConfig = existsSync(configPath);

	// Check for vite.config.ts (v2 approach)
	const viteConfigPath = join(absDir, 'vite.config.ts');
	const hasViteConfig = existsSync(viteConfigPath);

	// In v2, agentuity.config.ts is DEPRECATED.
	// ALL config is consolidated into createApp() or native Vite config:
	// - Vite keys (plugins, define, render, bundle) → vite.config.ts
	// - Runtime keys (analytics, workbench) → createApp() ONLY (single source of truth)
	if (result.hasAgentuityConfig) {
		const configSrc = await Bun.file(configPath).text();

		// Categorize config keys
		const viteKeys: string[] = [];
		const runtimeKeys: string[] = [];

		if (configSrc.includes('plugins:')) viteKeys.push('plugins');
		if (configSrc.includes('define:')) viteKeys.push('define');
		if (configSrc.includes('render:')) viteKeys.push('render');
		if (configSrc.includes('bundle:')) viteKeys.push('bundle');
		if (configSrc.includes('analytics:')) runtimeKeys.push('analytics');
		if (configSrc.includes('workbench:')) runtimeKeys.push('workbench');

		if (viteKeys.length > 0) {
			findings.push({
				id: 'agentuity-config-vite-keys',
				severity: 'guided',
				message: `agentuity.config.ts has Vite config: ${viteKeys.join(', ')}`,
				file: 'agentuity.config.ts',
				hint:
					'Vite config should go in vite.config.ts. Example:\n' +
					'\n' +
					'  // vite.config.ts\n' +
					"  import { defineConfig } from 'vite';\n" +
					"  import react from '@vitejs/plugin-react';\n" +
					'\n' +
					'  export default defineConfig({\n' +
					'    plugins: [react()],\n' +
					"    define: { CUSTOM: JSON.stringify('value') },\n" +
					'  });\n' +
					'\n' +
					'After creating vite.config.ts, delete agentuity.config.ts.',
			});
		}

		if (runtimeKeys.length > 0) {
			findings.push({
				id: 'agentuity-config-runtime-keys',
				severity: 'guided',
				message: `agentuity.config.ts has ${runtimeKeys.join(', ')} — remove (use createApp() only)`,
				file: 'agentuity.config.ts',
				hint:
					'In v2, ALL runtime config goes in createApp().\n' +
					'The CLI reads these options directly from your createApp() call.\n' +
					'Remove them from agentuity.config.ts and keep only in createApp().',
			});
		}

		if (viteKeys.length === 0 && runtimeKeys.length === 0) {
			// Empty or minimal config
			findings.push({
				id: 'agentuity-config-empty',
				severity: 'guided',
				message: 'agentuity.config.ts exists but has no config keys — can be deleted',
				file: 'agentuity.config.ts',
				hint: 'This file is no longer needed in v2. Delete it.',
			});
		}
	}

	// ── 4. Route files ───────────────────────────────────────────────────────
	const routeFiles = findRouteFiles(absDir);
	for (const file of routeFiles) {
		const sourceFile = await parseTs(file);
		const classification = classifyRouteFile(sourceFile);
		const relFile = rel(absDir, file);

		if (classification === 'v1') {
			result.v1RouteFiles.push(file);
			findings.push({
				id: `route-v1:${relFile}`,
				severity: 'auto',
				message: `Route file uses v1 mutable createRouter() style`,
				file: relFile,
				hint:
					'Will be rewritten to chained new Hono<Env>().get().post()… style.\n' +
					'Chaining is required for Hono RPC — only a single chained expression\n' +
					'accumulates all route schemas into `typeof router`, which becomes the\n' +
					'AppRouter type used by hc<AppRouter>() on the frontend.',
			});
		} else if (classification === 'v2') {
			result.v2RouteFiles.push(file);
		}
	}

	// ── 5. src/api/index.ts barrel ──────────────────────────────────────────
	const apiIndexPath = join(absDir, 'src', 'api', 'index.ts');
	result.hasApiBarrel = existsSync(apiIndexPath);

	if (!result.hasApiBarrel && result.v1RouteFiles.length > 0) {
		findings.push({
			id: 'missing-api-barrel',
			severity: 'auto',
			message: 'src/api/index.ts barrel does not exist',
			hint:
				'Will be generated with a single chained Hono<Env>().route()… expression.\n' +
				'This exports AppRouter = typeof router, the type needed for hc<AppRouter>()\n' +
				'on the frontend. Chaining is required — broken chains produce an empty type.',
		});
	} else if (result.hasApiBarrel) {
		// Check if the existing index.ts is the old empty stub
		const src = await Bun.file(apiIndexPath).text();
		const isStub =
			src.includes('createRouter()') &&
			!src.includes('.route(') &&
			src.split('\n').filter((l) => l.trim()).length < 8;
		if (isStub) {
			findings.push({
				id: 'api-barrel-stub',
				severity: 'auto',
				message: 'src/api/index.ts is the empty v1 stub (createRouter() with no routes)',
				file: 'src/api/index.ts',
				hint: 'Will be replaced with an explicit barrel that imports and composes all route files.',
			});
		}
	}

	// ── 6. src/agent/index.ts barrel ────────────────────────────────────────
	const agentIndexPath = join(absDir, 'src', 'agent', 'index.ts');
	result.hasAgentBarrel = existsSync(agentIndexPath);
	if (!result.hasAgentBarrel) {
		const agentDir = join(absDir, 'src', 'agent');
		if (existsSync(agentDir)) {
			findings.push({
				id: 'missing-agent-barrel',
				severity: 'auto',
				message: 'src/agent/index.ts barrel does not exist',
				hint: 'Will be generated by scanning src/agent/*/agent.ts files and exporting a default array.',
			});
		}
	}

	// ── 7. Frontend removed APIs ─────────────────────────────────────────────
	result.frontendRemovedApis = await scanFrontendFiles(absDir);
	for (const fe of result.frontendRemovedApis) {
		if (fe.apis.length > 0) {
			findings.push({
				id: `frontend-removed:${fe.file}`,
				severity: 'manual',
				message: `Frontend file uses removed APIs: ${fe.apis.join(', ')}`,
				file: fe.file,
				hint:
					'Replace with Hono RPC client (hono/client):\n' +
					'\n' +
					"  import { hc } from 'hono/client';\n" +
					"  import type { AppRouter } from '../api'; // your barrel\n" +
					"  const client = hc<AppRouter>(window.location.origin + '/api');\n" +
					"  const res = await client.hello.$post({ json: { name: 'World' } });\n" +
					'\n' +
					'See: https://hono.dev/docs/guides/rpc',
			});
		}
		if (fe.deprecatedApis && fe.deprecatedApis.length > 0) {
			findings.push({
				id: `frontend-deprecated:${fe.file}`,
				severity: 'guided',
				message: `Frontend file uses deprecated @agentuity/react APIs: ${fe.deprecatedApis.join(', ')}`,
				file: fe.file,
				hint:
					'@agentuity/react is deprecated. Migration options:\n' +
					'\n' +
					'• AgentuityProvider/useAuth → Use your auth provider directly (better-auth, Clerk, etc.)\n' +
					'• useAnalytics → Use getAnalytics() from @agentuity/frontend\n' +
					'• useWebRTCCall → Use WebRTCManager from @agentuity/frontend\n' +
					'• WebSocketManager/EventStreamManager → Import from @agentuity/frontend\n' +
					'\n' +
					'The package will continue to work but will not receive updates.',
			});
		}
	}

	// ── 7b. Hono RPC recommendation (whenever routes exist) ─────────────────
	// Fire this as a "guided" finding whenever there are any API routes,
	// regardless of whether the frontend already uses removed APIs.
	// It surfaces the RPC pattern to users who may not know about it yet.
	const hasApiRoutes =
		result.v1RouteFiles.length > 0 ||
		result.v2RouteFiles.length > 0 ||
		existsSync(join(absDir, 'src', 'api'));

	const frontendDir = join(absDir, 'src', 'web');
	const hasFrontend = existsSync(frontendDir);

	// ── 7c. Vite config check ───────────────────────────────────────────────
	// If there's a frontend, vite.config.ts should exist with framework plugins
	if (hasFrontend && !hasViteConfig) {
		findings.push({
			id: 'missing-vite-config',
			severity: 'guided',
			message: 'No vite.config.ts found - frontend requires Vite configuration',
			hint:
				'Create vite.config.ts with your frontend framework plugin:\n' +
				'\n' +
				'  // vite.config.ts\n' +
				"  import { defineConfig } from 'vite';\n" +
				"  import react from '@vitejs/plugin-react';\n" +
				'\n' +
				'  export default defineConfig({\n' +
				'    plugins: [react()],\n' +
				'  });\n' +
				'\n' +
				'For other frameworks:\n' +
				"  • Svelte: import { svelte } from '@sveltejs/vite-plugin-svelte'\n" +
				"  • Vue: import vue from '@vitejs/plugin-vue'\n" +
				"  • Solid: import solid from 'vite-plugin-solid'",
		});
	}

	if (hasApiRoutes && hasFrontend && result.frontendRemovedApis.length === 0) {
		// Only show this if there are no already-detected frontend issues (avoid duplication)
		findings.push({
			id: 'hono-rpc-recommendation',
			severity: 'guided',
			message: 'Consider using Hono RPC for fully type-safe frontend ↔ backend calls',
			hint:
				"v2 uses Hono's native RPC system instead of the old Agentuity typed client.\n" +
				'The barrel at src/api/index.ts exports AppRouter = typeof router.\n' +
				'Routes MUST be chained in a single expression for types to accumulate.\n' +
				'\n' +
				'In your frontend (src/web/):\n' +
				'\n' +
				"  import { hc } from 'hono/client';\n" +
				"  import type { AppRouter } from '../api';\n" +
				'\n' +
				"  const client = hc<AppRouter>(window.location.origin + '/api');\n" +
				'\n' +
				'  // Typed call — method name mirrors route path, prefixed with $\n' +
				"  const res = await client.hello.$post({ json: { name: 'World' } });\n" +
				'  const data = await res.json();\n' +
				'\n' +
				'See: https://hono.dev/docs/guides/rpc',
		});
	}

	// Sort: auto first, guided second, manual last
	const order: Record<Severity, number> = { auto: 0, guided: 1, manual: 2 };
	findings.sort((a, b) => order[a.severity] - order[b.severity]);

	return result;
}
