/**
 * V2 → V3 pattern detection.
 *
 * Analyses a project directory and returns a structured report of every v2
 * artefact that needs to be migrated to v3 (framework-agnostic Hono).
 * No files are modified here.
 */

import { existsSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type Severity = 'auto' | 'guided' | 'manual';

export interface V3Finding {
	id: string;
	severity: Severity;
	message: string;
	file?: string;
	hint?: string;
}

/** Classification of agent complexity */
export type AgentComplexity = 'simple' | 'complex';

/** Detected agent file */
export interface AgentFile {
	/** Absolute path */
	path: string;
	/** Relative path from project root */
	relativePath: string;
	/** Agent name passed to createAgent() */
	name: string;
	/** Whether the agent is simple (handler+schema only) or complex */
	complexity: AgentComplexity;
	/** Reason for complexity classification (if complex) */
	complexityReason?: string;
	/** Whether the agent uses schema validation */
	hasSchema: boolean;
	/** Services accessed via ctx.* */
	ctxServices: string[];
}

/** Detected service usage in a file */
export interface ServiceUsage {
	/** Absolute path */
	path: string;
	/** Relative path from project root */
	relativePath: string;
	/** Services used: 'kv' | 'vector' | 'stream' | 'queue' | 'email' | 'task' | 'schedule' | 'sandbox' | 'logger' */
	services: string[];
	/** Access pattern: 'ctx' (agent context) | 'c.var' (Hono context) */
	accessPattern: 'ctx' | 'c.var';
}

/** Outdated package that needs version update */
export interface V3OutdatedPackage {
	name: string;
	currentVersion: string;
	section: 'dependencies' | 'devDependencies';
}

export interface V3DetectionResult {
	projectDir: string;
	findings: V3Finding[];

	/** Whether the project has @agentuity/runtime in package.json */
	hasRuntimeDep: boolean;
	/** Version of @agentuity/runtime if found */
	runtimeVersion?: string;

	/** Absolute path to app.ts, if found */
	appTsPath?: string;
	/** Whether app.ts uses createApp from @agentuity/runtime */
	hasCreateApp: boolean;
	/** Properties passed to createApp() */
	createAppProps: string[];

	/** Detected agent files */
	agentFiles: AgentFile[];
	/** Whether src/agent/index.ts barrel exists */
	hasAgentBarrel: boolean;

	/** Service usage across all scanned files */
	serviceUsages: ServiceUsage[];
	/** Deduplicated set of all services used anywhere */
	allServicesUsed: string[];

	/** Whether src/web/ exists (SPA) */
	hasFrontend: boolean;
	/** Whether agentuity.config.ts exists */
	hasAgentuityConfig: boolean;
	/** Whether vite.config.ts exists */
	hasViteConfig: boolean;

	/** @agentuity/* packages that need version upgrade */
	outdatedPackages: V3OutdatedPackage[];

	/** Whether @agentuity/react is used */
	hasReactPackage: boolean;
	/** Whether @agentuity/frontend is used */
	hasFrontendPackage: boolean;
}

// ---------------------------------------------------------------------------
// Known service names
// ---------------------------------------------------------------------------

const SERVICE_NAMES = [
	'kv',
	'vector',
	'stream',
	'queue',
	'email',
	'task',
	'schedule',
	'sandbox',
	'logger',
] as const;

type ServiceName = (typeof SERVICE_NAMES)[number];

/** Map from service name to package */
export const SERVICE_PACKAGE_MAP: Record<string, { pkg: string; client: string }> = {
	kv: { pkg: '@agentuity/keyvalue', client: 'KeyValueClient' },
	vector: { pkg: '@agentuity/vector', client: 'VectorClient' },
	stream: { pkg: '@agentuity/stream', client: 'StreamClient' },
	queue: { pkg: '@agentuity/queue', client: 'QueueClient' },
	email: { pkg: '@agentuity/email', client: 'EmailClient' },
	task: { pkg: '@agentuity/task', client: 'TaskClient' },
	schedule: { pkg: '@agentuity/schedule', client: 'ScheduleClient' },
	sandbox: { pkg: '@agentuity/sandbox', client: 'SandboxClient' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rel(projectDir: string, abs: string): string {
	return relative(projectDir, abs);
}

function* walkFiles(dir: string, exts: string[]): Generator<string> {
	if (!existsSync(dir)) return;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (['node_modules', 'dist', '.agentuity', '.git'].includes(entry.name)) continue;
			yield* walkFiles(full, exts);
		} else if (entry.isFile() && exts.some((e) => entry.name.endsWith(e))) {
			yield full;
		}
	}
}

async function parseTs(filePath: string): Promise<ts.SourceFile> {
	const src = await Bun.file(filePath).text();
	return ts.createSourceFile(filePath, src, ts.ScriptTarget.ESNext, true);
}

// ---------------------------------------------------------------------------
// AST analysis helpers
// ---------------------------------------------------------------------------

/**
 * Get properties passed to createApp() call.
 */
function getCreateAppProps(sourceFile: ts.SourceFile): string[] {
	const props: string[] = [];

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
						props.push(prop.name.text);
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
 * Check if a source file imports createApp from @agentuity/runtime.
 */
function hasCreateAppImport(sourceFile: ts.SourceFile): boolean {
	let found = false;

	function visit(node: ts.Node) {
		if (found) return;
		if (ts.isImportDeclaration(node)) {
			const moduleSpecifier = (node.moduleSpecifier as ts.StringLiteral).text;
			if (moduleSpecifier === '@agentuity/runtime') {
				const namedBindings = node.importClause?.namedBindings;
				if (namedBindings && ts.isNamedImports(namedBindings)) {
					for (const element of namedBindings.elements) {
						if (element.name.text === 'createApp') {
							found = true;
							return;
						}
					}
				}
			}
		}
		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return found;
}

/**
 * Analyse an agent file for complexity classification.
 */
function analyseAgentFile(sourceFile: ts.SourceFile): {
	name: string | null;
	complexity: AgentComplexity;
	complexityReason?: string;
	hasSchema: boolean;
	ctxServices: string[];
} {
	let agentName: string | null = null;
	let hasSchema = false;
	let hasSetup = false;
	let hasShutdown = false;
	let hasOnEvent = false;
	let hasModuleLevelCode = false;
	let hasConfigAccess = false;
	let hasAppAccess = false;
	const ctxServices = new Set<string>();

	// Track what's at module level vs inside createAgent
	let insideCreateAgent = false;

	function visitCreateAgentConfig(node: ts.Node) {
		// Inside the config object of createAgent
		if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
			const propName = node.name.text;
			if (propName === 'schema') hasSchema = true;
			if (propName === 'setup') hasSetup = true;
			if (propName === 'shutdown') hasShutdown = true;
			if (
				propName === 'on' ||
				propName === 'onStarted' ||
				propName === 'onCompleted' ||
				propName === 'onErrored'
			) {
				hasOnEvent = true;
			}
		}

		// Look for ctx.kv, ctx.vector, etc. inside handler
		if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.name)) {
			const serviceName = node.name.text;
			if (SERVICE_NAMES.includes(serviceName as ServiceName)) {
				// Check if accessing on a parameter-like identifier (ctx, context, c)
				if (ts.isIdentifier(node.expression)) {
					const objName = node.expression.text;
					if (['ctx', 'context', 'c'].includes(objName)) {
						ctxServices.add(serviceName);
					}
				}
			}
			// Check for ctx.config access
			if (node.name.text === 'config' && ts.isIdentifier(node.expression)) {
				if (['ctx', 'context'].includes(node.expression.text)) {
					hasConfigAccess = true;
				}
			}
			// Check for ctx.app access
			if (node.name.text === 'app' && ts.isIdentifier(node.expression)) {
				if (['ctx', 'context'].includes(node.expression.text)) {
					hasAppAccess = true;
				}
			}
		}

		ts.forEachChild(node, visitCreateAgentConfig);
	}

	function visit(node: ts.Node) {
		// Detect createAgent() call
		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === 'createAgent'
		) {
			// First arg is the name
			if (node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
				agentName = node.arguments[0].text;
			}
			// Second arg is the config
			if (node.arguments[1]) {
				insideCreateAgent = true;
				visitCreateAgentConfig(node.arguments[1]);
				insideCreateAgent = false;
			}
			return; // Don't recurse into createAgent children again
		}

		// Check for module-level statements that aren't just imports/exports/type declarations
		if (!insideCreateAgent && isModuleLevelCode(node, sourceFile)) {
			hasModuleLevelCode = true;
		}

		ts.forEachChild(node, visit);
	}

	visit(sourceFile);

	// Classify complexity
	const complexityReasons: string[] = [];
	if (hasSetup) complexityReasons.push('has setup() lifecycle hook');
	if (hasShutdown) complexityReasons.push('has shutdown() lifecycle hook');
	if (hasOnEvent) complexityReasons.push('has event listeners');
	if (hasConfigAccess) complexityReasons.push('accesses ctx.config (from setup)');
	if (hasAppAccess) complexityReasons.push('accesses ctx.app (app state)');
	if (hasModuleLevelCode) complexityReasons.push('has module-level code beyond imports/exports');

	const complexity: AgentComplexity = complexityReasons.length > 0 ? 'complex' : 'simple';

	return {
		name: agentName,
		complexity,
		complexityReason: complexityReasons.length > 0 ? complexityReasons.join('; ') : undefined,
		hasSchema,
		ctxServices: [...ctxServices],
	};
}

/**
 * Check if a node is "module-level code" (not an import, export, type, or interface).
 */
function isModuleLevelCode(node: ts.Node, sourceFile: ts.SourceFile): boolean {
	// Only check top-level statements
	if (node.parent !== sourceFile) return false;

	// End-of-file token is not code
	if (node.kind === ts.SyntaxKind.EndOfFileToken) return false;

	// Imports are fine
	if (ts.isImportDeclaration(node)) return false;

	// Type-only declarations are fine
	if (ts.isTypeAliasDeclaration(node)) return false;
	if (ts.isInterfaceDeclaration(node)) return false;

	// Export default createAgent(...) is fine
	if (ts.isExportAssignment(node)) return false;

	// Export declarations (re-exports) are fine
	if (ts.isExportDeclaration(node)) return false;

	// Variable statements
	if (ts.isVariableStatement(node)) {
		// `const` declarations are fine — they're just data, schemas, or config.
		// They'll be preserved alongside the extracted function.
		if (
			node.declarationList.flags & ts.NodeFlags.Const ||
			node.declarationList.flags & ts.NodeFlags.Using
		) {
			return false;
		}

		// `let`/`var` with createAgent() is fine
		const declarations = node.declarationList.declarations;
		if (declarations.length === 1) {
			const decl = declarations[0];
			const init = decl?.initializer;
			if (
				init &&
				ts.isCallExpression(init) &&
				ts.isIdentifier(init.expression) &&
				init.expression.text === 'createAgent'
			) {
				return false;
			}
			if (
				init &&
				ts.isAwaitExpression(init) &&
				ts.isCallExpression(init.expression) &&
				ts.isIdentifier(init.expression.expression) &&
				init.expression.expression.text === 'createAgent'
			) {
				return false;
			}
		}

		// `let`/`var` with mutable state → complex
		return true;
	}

	// Enum declarations are fine
	if (ts.isEnumDeclaration(node)) return false;

	// Function declarations are fine — they're just helper functions
	// that will be preserved alongside the extracted agent function.
	if (ts.isFunctionDeclaration(node)) return false;

	// Expression statements that are just createAgent() exports are fine
	if (ts.isExpressionStatement(node)) {
		const expr = node.expression;
		if (
			ts.isCallExpression(expr) &&
			ts.isIdentifier(expr.expression) &&
			expr.expression.text === 'createAgent'
		) {
			return false;
		}
	}

	// Everything else is module-level code that indicates complexity
	return true;
}

/**
 * Scan a source file for service usage patterns: c.var.kv, c.var.vector, etc.
 */
function scanServiceUsageInRouteFile(sourceFile: ts.SourceFile): string[] {
	const services = new Set<string>();

	function visit(node: ts.Node) {
		// Match c.var.kv, c.var.vector, etc.
		if (
			ts.isPropertyAccessExpression(node) &&
			ts.isIdentifier(node.name) &&
			SERVICE_NAMES.includes(node.name.text as ServiceName)
		) {
			// Check it's *.var.service
			if (
				ts.isPropertyAccessExpression(node.expression) &&
				ts.isIdentifier(node.expression.name) &&
				node.expression.name.text === 'var'
			) {
				services.add(node.name.text);
			}
		}

		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return [...services];
}

// ---------------------------------------------------------------------------
// Main detector
// ---------------------------------------------------------------------------

export async function detectV3(projectDir: string): Promise<V3DetectionResult> {
	const absDir = resolve(projectDir);
	const findings: V3Finding[] = [];

	const result: V3DetectionResult = {
		projectDir: absDir,
		findings,
		hasRuntimeDep: false,
		hasCreateApp: false,
		createAppProps: [],
		agentFiles: [],
		hasAgentBarrel: false,
		serviceUsages: [],
		allServicesUsed: [],
		hasFrontend: false,
		hasAgentuityConfig: false,
		hasViteConfig: false,
		outdatedPackages: [],
		hasReactPackage: false,
		hasFrontendPackage: false,
	};

	// ── 1. package.json analysis ────────────────────────────────────────────
	const packageJsonPath = join(absDir, 'package.json');
	if (existsSync(packageJsonPath)) {
		try {
			const packageJson = JSON.parse(await Bun.file(packageJsonPath).text());

			for (const section of ['dependencies', 'devDependencies'] as const) {
				const deps = packageJson[section];
				if (!deps || typeof deps !== 'object') continue;

				for (const [name, version] of Object.entries(deps)) {
					if (name === '@agentuity/runtime') {
						result.hasRuntimeDep = true;
						result.runtimeVersion = String(version);
					}
					if (name === '@agentuity/react') {
						result.hasReactPackage = true;
					}
					if (name === '@agentuity/frontend') {
						result.hasFrontendPackage = true;
					}

					// Check for outdated packages
					if (name.startsWith('@agentuity/')) {
						const versionStr = String(version);
						const needsUpdate =
							versionStr === 'latest' ||
							versionStr === '*' ||
							versionStr.startsWith('workspace:') ||
							/^[~^]?[12]\./.test(versionStr);

						if (needsUpdate) {
							result.outdatedPackages.push({
								name,
								currentVersion: versionStr,
								section,
							});
						}
					}
				}
			}
		} catch {
			// Ignore parse errors
		}
	}

	if (result.hasRuntimeDep) {
		findings.push({
			id: 'v3-runtime-dep',
			severity: 'auto',
			message: `@agentuity/runtime@${result.runtimeVersion} found — will be removed`,
			file: 'package.json',
			hint:
				'v3 is framework-agnostic. @agentuity/runtime is replaced by:\n' +
				'  • hono — the web framework\n' +
				'  • @agentuity/hono — middleware for telemetry + services\n' +
				'  • Individual service packages (@agentuity/keyvalue, etc.)',
		});
	}

	if (result.outdatedPackages.length > 0) {
		const packageList = result.outdatedPackages
			.map((p) => `${p.name}@${p.currentVersion}`)
			.join(', ');
		findings.push({
			id: 'v3-outdated-packages',
			severity: 'auto',
			message: `Outdated @agentuity/* packages: ${packageList}`,
			file: 'package.json',
			hint: 'All @agentuity/* packages will be updated to their v3 versions.',
		});
	}

	// ── 2. app.ts / entry point ─────────────────────────────────────────────
	const appTsPath = join(absDir, 'app.ts');
	if (existsSync(appTsPath)) {
		result.appTsPath = appTsPath;
		const sourceFile = await parseTs(appTsPath);

		result.hasCreateApp = hasCreateAppImport(sourceFile);
		if (result.hasCreateApp) {
			result.createAppProps = getCreateAppProps(sourceFile);

			findings.push({
				id: 'v3-createapp',
				severity: 'auto',
				message: 'app.ts uses createApp() from @agentuity/runtime',
				file: 'app.ts',
				hint:
					'Will be rewritten to a plain Hono app at src/index.ts:\n' +
					'\n' +
					"  import { Hono } from 'hono';\n" +
					"  import { agentuity } from '@agentuity/hono';\n" +
					'\n' +
					'  const app = new Hono();\n' +
					"  app.use('*', agentuity());\n" +
					'\n' +
					'  export default app;',
			});

			// Check for cors config
			if (result.createAppProps.includes('cors')) {
				findings.push({
					id: 'v3-cors-config',
					severity: 'guided',
					message: 'createApp() has cors configuration',
					file: 'app.ts',
					hint:
						'CORS config will be migrated to hono/cors middleware.\n' +
						"Note: Agentuity-specific options like 'sameOrigin' are not available\n" +
						'in hono/cors. You may need to configure allowedOrigins manually.',
				});
			}

			// Check for agents reference
			if (result.createAppProps.includes('agents')) {
				findings.push({
					id: 'v3-agents-in-createapp',
					severity: 'auto',
					message: 'createApp() passes agents array — concept removed in v3',
					file: 'app.ts',
					hint: 'Agents are converted to plain functions. The agents import will be removed.',
				});
			}
		}

		// Also scan app.ts for service usage
		const appServices = scanServiceUsageInRouteFile(sourceFile);
		if (appServices.length > 0) {
			result.serviceUsages.push({
				path: appTsPath,
				relativePath: 'app.ts',
				services: appServices,
				accessPattern: 'c.var',
			});
		}
	}

	// ── 3. Agent files ──────────────────────────────────────────────────────
	const agentDir = join(absDir, 'src', 'agent');
	if (existsSync(agentDir)) {
		for (const file of walkFiles(agentDir, ['.ts', '.tsx'])) {
			const base = file.split('/').pop() ?? '';
			// Skip index.ts barrel
			if (base === 'index.ts' || base === 'index.tsx') continue;

			const sourceFile = await parseTs(file);
			const src = await Bun.file(file).text();

			// Check if this file uses createAgent
			if (!src.includes('createAgent')) continue;

			const analysis = analyseAgentFile(sourceFile);
			if (!analysis.name) continue;

			const relPath = rel(absDir, file);
			const agentFile: AgentFile = {
				path: file,
				relativePath: relPath,
				name: analysis.name,
				complexity: analysis.complexity,
				complexityReason: analysis.complexityReason,
				hasSchema: analysis.hasSchema,
				ctxServices: analysis.ctxServices,
			};

			result.agentFiles.push(agentFile);

			if (analysis.complexity === 'simple') {
				findings.push({
					id: `v3-agent-simple:${relPath}`,
					severity: 'auto',
					message: `Agent "${analysis.name}" is simple — will be converted to plain function`,
					file: relPath,
					hint:
						'The createAgent() wrapper will be removed. The handler becomes a plain\n' +
						'exported async function.' +
						(analysis.hasSchema
							? ' Schema validation will be preserved in the function.'
							: ''),
				});
			} else {
				findings.push({
					id: `v3-agent-complex:${relPath}`,
					severity: 'manual',
					message: `Agent "${analysis.name}" is complex — requires manual migration`,
					file: relPath,
					hint:
						`Complexity: ${analysis.complexityReason}\n` +
						'\n' +
						'This agent uses features beyond a simple handler and cannot be\n' +
						'automatically converted. You need to:\n' +
						'  1. Extract the handler into a plain async function\n' +
						'  2. Move setup logic to module-level initialization\n' +
						'  3. Replace ctx.config/ctx.app with direct imports\n' +
						'  4. Remove event listeners (use your own event patterns)',
				});
			}

			// Track service usage from agents
			if (analysis.ctxServices.length > 0) {
				result.serviceUsages.push({
					path: file,
					relativePath: relPath,
					services: analysis.ctxServices,
					accessPattern: 'ctx',
				});
			}
		}
	}

	// Agent barrel
	const agentBarrelPath = join(absDir, 'src', 'agent', 'index.ts');
	result.hasAgentBarrel = existsSync(agentBarrelPath);
	if (result.hasAgentBarrel) {
		findings.push({
			id: 'v3-agent-barrel',
			severity: 'auto',
			message: 'src/agent/index.ts barrel — will be removed',
			file: 'src/agent/index.ts',
			hint:
				'The agents barrel exported an array of agents for createApp().\n' +
				'In v3, there is no agents concept — functions are imported directly\n' +
				'where needed.',
		});
	}

	// ── 4. Route files — service usage ──────────────────────────────────────
	const apiDir = join(absDir, 'src', 'api');
	if (existsSync(apiDir)) {
		for (const file of walkFiles(apiDir, ['.ts', '.tsx'])) {
			const sourceFile = await parseTs(file);
			const services = scanServiceUsageInRouteFile(sourceFile);

			if (services.length > 0) {
				const relPath = rel(absDir, file);
				result.serviceUsages.push({
					path: file,
					relativePath: relPath,
					services,
					accessPattern: 'c.var',
				});
			}
		}
	}

	// Also scan src/ root-level TS files
	const srcDir = join(absDir, 'src');
	if (existsSync(srcDir)) {
		for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
			if (
				entry.isFile() &&
				(entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
				entry.name !== 'services.ts' // Don't scan our own generated file
			) {
				const file = join(srcDir, entry.name);
				const sourceFile = await parseTs(file);
				const services = scanServiceUsageInRouteFile(sourceFile);

				if (services.length > 0) {
					const relPath = rel(absDir, file);
					result.serviceUsages.push({
						path: file,
						relativePath: relPath,
						services,
						accessPattern: 'c.var',
					});
				}
			}
		}
	}

	// Compute all services used
	const allServices = new Set<string>();
	for (const usage of result.serviceUsages) {
		for (const svc of usage.services) {
			allServices.add(svc);
		}
	}
	result.allServicesUsed = [...allServices].sort();

	if (result.serviceUsages.length > 0) {
		const ctxUsages = result.serviceUsages.filter((u) => u.accessPattern === 'ctx');
		const cVarUsages = result.serviceUsages.filter((u) => u.accessPattern === 'c.var');

		if (ctxUsages.length > 0) {
			findings.push({
				id: 'v3-service-agent-ctx',
				severity: 'guided',
				message: `${ctxUsages.length} file(s) access services via ctx.* (agent context)`,
				hint:
					'Service access through agent context (ctx.kv, ctx.vector, etc.) is removed\n' +
					'in v3. A shared src/services.ts will be generated with singleton clients.\n' +
					'\n' +
					"  import { kv } from './services'; // or '../services'\n" +
					"  const data = await kv.get('namespace', 'key');",
			});
		}

		if (cVarUsages.length > 0) {
			findings.push({
				id: 'v3-service-route-ctx',
				severity: 'guided',
				message: `${cVarUsages.length} file(s) access services via c.var.* (Hono context)`,
				hint:
					'Service access through Hono context variables (c.var.kv, etc.) is replaced\n' +
					'by direct imports from a shared services module.\n' +
					'\n' +
					"  import { kv } from './services';\n" +
					"  const data = await kv.get('namespace', 'key');",
			});
		}
	}

	// ── 5. Frontend / SPA ───────────────────────────────────────────────────
	const webDir = join(absDir, 'src', 'web');
	result.hasFrontend = existsSync(webDir);

	if (result.hasFrontend) {
		findings.push({
			id: 'v3-spa-detected',
			severity: 'guided',
			message: 'src/web/ frontend detected',
			hint:
				'In v3, SPAs are served by the Agentuity buildpack. For local development,\n' +
				"use your framework's dev server (e.g., vite dev). For production, the\n" +
				'buildpack detects static assets and injects a file server automatically.\n' +
				'\n' +
				'If you want to serve static files from your Hono app directly:\n' +
				'\n' +
				"  import { serveStatic } from 'hono/bun';\n" +
				"  app.use('/assets/*', serveStatic({ root: './src/web/dist' }));",
		});
	}

	// ── 6. agentuity.config.ts ──────────────────────────────────────────────
	const configPath = join(absDir, 'agentuity.config.ts');
	result.hasAgentuityConfig = existsSync(configPath);
	if (result.hasAgentuityConfig) {
		findings.push({
			id: 'v3-config-file',
			severity: 'auto',
			message: 'agentuity.config.ts exists — will be deleted',
			file: 'agentuity.config.ts',
			hint:
				'v3 uses standard framework configuration (vite.config.ts, etc.).\n' +
				'The agentuity.config.ts file is no longer used.',
		});
	}

	// Vite config
	const viteConfigPath = join(absDir, 'vite.config.ts');
	result.hasViteConfig = existsSync(viteConfigPath);

	// ── 7. @agentuity/react deprecation ─────────────────────────────────────
	if (result.hasReactPackage) {
		findings.push({
			id: 'v3-react-deprecated',
			severity: 'manual',
			message: '@agentuity/react is deprecated and will be removed',
			file: 'package.json',
			hint:
				'@agentuity/react is fully deprecated in v3. Replace with:\n' +
				'\n' +
				'  • AgentuityProvider/useAuth → Your auth provider directly (better-auth, Clerk, etc.)\n' +
				'  • useAPI/createAPIClient → Hono RPC client (hc from hono/client)\n' +
				'  • useAnalytics → getAnalytics() from @agentuity/analytics\n' +
				'  • useWebRTCCall → WebRTCManager from @agentuity/frontend\n' +
				'\n' +
				'Remove @agentuity/react from package.json after migrating all imports.',
		});
	}

	// Sort: auto first, guided second, manual last
	const order: Record<Severity, number> = { auto: 0, guided: 1, manual: 2 };
	findings.sort((a, b) => order[a.severity] - order[b.severity]);

	return result;
}
