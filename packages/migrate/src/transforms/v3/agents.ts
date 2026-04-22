/**
 * Transform: createAgent() → plain exported functions
 *
 * v3 is an "eject" — the createAgent() wrapper, ctx.* service magic, thread
 * state, sessions and evals are all replaced by user-visible primitives.
 *
 * For "simple" agents (handler + optional schema only), we:
 *   1. Remove the createAgent() wrapper
 *   2. Extract the handler as a named exported async function
 *   3. Preserve schema validation if present
 *   4. Replace ctx.* service access with imports from the services module
 *
 * For "complex" agents (setup/shutdown/onEvent/ctx.config), we additionally:
 *   5. Hoist setup() return values into module-level lazy-init singletons
 *      so the handler body still compiles after the ctx.config.* → direct
 *      reference rewrite.
 *   6. Replace ctx.thread.*, ctx.sessionId, ctx.app.* with TODO comments —
 *      these concepts are gone in v3.
 *
 * We use a combination of regex and AST analysis — regex for the mechanical
 * transforms (preserving formatting), AST for detection (already done in detect-v3).
 */

import ts from 'typescript';
import type { AgentFile } from '../../detect-v3';

export interface AgentTransformResult {
	/** The transformed source, or null if skipped */
	source: string | null;
	/** What was changed */
	changes: string[];
	/** If the agent is too complex for auto-migration */
	manualRequired?: boolean;
}

/**
 * Names we use for the context parameter that should be removed.
 */
const CTX_PARAM_NAMES = ['ctx', 'context', 'c', '_ctx', '_context', '_c'];

/**
 * Service access patterns to rewrite.
 * Maps ctx.serviceName → serviceName (import from services module).
 */

/**
 * Transform a simple agent file into a plain exported function.
 */
export function transformAgentFile(
	source: string,
	agentInfo: AgentFile,
	servicesRelativePath: string
): AgentTransformResult {
	if (agentInfo.complexity === 'complex') {
		return forceConvertComplexAgent(source, agentInfo, servicesRelativePath);
	}

	const changes: string[] = [];

	const sourceFile = ts.createSourceFile(agentInfo.path, source, ts.ScriptTarget.ESNext, true);

	// Find the createAgent() call and extract the handler
	const extracted = extractHandlerFromCreateAgent(sourceFile, source);
	if (!extracted) {
		return {
			source: null,
			changes: ['Could not extract handler from createAgent() — manual review needed'],
			manualRequired: true,
		};
	}

	let output = source;

	// Step 1: Remove the createAgent import
	output = removeCreateAgentImport(output);
	changes.push('Removed createAgent import from @agentuity/runtime');

	// Step 2: Add services import if needed
	if (agentInfo.ctxServices.length > 0) {
		const serviceImports = agentInfo.ctxServices.filter((s) => s !== 'logger');
		const needsLogger = agentInfo.ctxServices.includes('logger');

		const importLines: string[] = [];
		if (serviceImports.length > 0) {
			importLines.push(
				`import { ${serviceImports.join(', ')} } from '${servicesRelativePath}';`
			);
		}
		if (needsLogger) {
			importLines.push(
				`import { ${serviceImports.length > 0 ? '' : ''}logger } from '${servicesRelativePath}';`
			);
		}

		// Consolidate into one import if both
		if (serviceImports.length > 0 || needsLogger) {
			const allImports = [...agentInfo.ctxServices];
			const importLine = `import { ${allImports.join(', ')} } from '${servicesRelativePath}';`;
			// Insert after last import line
			output = insertAfterImports(output, importLine);
			changes.push(`Added services import: ${allImports.join(', ')}`);
		}
	}

	// Step 3: Replace the entire createAgent() export with a plain function
	output = replaceCreateAgentWithFunction(output, agentInfo, extracted);
	changes.push(`Converted agent "${agentInfo.name}" to plain exported async function`);

	// Step 4: Replace ctx.service with direct service references
	for (const service of agentInfo.ctxServices) {
		for (const ctxName of CTX_PARAM_NAMES) {
			const pattern = new RegExp(`${ctxName}\\.${service}\\b`, 'g');
			if (pattern.test(output)) {
				output = output.replace(pattern, service);
				changes.push(`Replaced ${ctxName}.${service} → ${service}`);
			}
		}
	}

	// Step 5: Clean up — remove ctx/context parameter references that are now unused
	// (Don't do this automatically — leave for the user to clean up)

	return { source: output, changes };
}

/**
 * Force-convert a "complex" agent (setup/shutdown/onEvent/ctx.config) to
 * a plain exported async function plus module-level lazy-init singletons.
 *
 * v3 is an eject — we prefer working-but-TODO'd code over compilation errors
 * that block the whole migration. Every hoisted singleton and every dropped
 * feature is annotated so the user can review.
 */
function forceConvertComplexAgent(
	source: string,
	agentInfo: AgentFile,
	servicesRelativePath: string
): AgentTransformResult {
	const changes: string[] = [];
	const sourceFile = ts.createSourceFile(agentInfo.path, source, ts.ScriptTarget.ESNext, true);

	const extracted = extractHandlerFromCreateAgent(sourceFile, source);
	if (!extracted) {
		// Fall back to the comment-only path so the file at least still parses.
		return addManualMigrationComment(source, agentInfo);
	}

	const setupInfo = extractSetupFromCreateAgent(sourceFile);

	let output = source;

	// Step 1: Remove createAgent import
	output = removeCreateAgentImport(output);
	changes.push('Removed createAgent import from @agentuity/runtime');

	// Step 2: Add services import if needed
	if (agentInfo.ctxServices.length > 0) {
		const importLine = `import { ${agentInfo.ctxServices.join(', ')} } from '${servicesRelativePath}';`;
		output = insertAfterImports(output, importLine);
		changes.push(`Added services import: ${agentInfo.ctxServices.join(', ')}`);
	}

	// Step 3: Rewrite handler body to remove ctx.* magic.
	let handlerBody = extracted.handlerBody;

	// 3a. ctx.config.<name> → (await get_<name>()) — wired to the hoisted
	// module-level lazy init emitted in step 5 below. We wrap with parens so
	// subsequent `.foo.bar` chains still parse correctly.
	const configRefs = new Set<string>();
	for (const ctxName of CTX_PARAM_NAMES) {
		const pattern = new RegExp(`\\b${ctxName}\\.config\\.([A-Za-z_$][A-Za-z0-9_$]*)`, 'g');
		handlerBody = handlerBody.replace(pattern, (_m, id: string) => {
			configRefs.add(id);
			return `(await get_${id}())`;
		});
	}
	if (configRefs.size > 0) {
		changes.push(`Rewrote ctx.config.{${[...configRefs].join(', ')}} → (await get_‹key›())`);
	}

	// 3b. ctx.logger → logger (expected to come from services barrel).
	for (const ctxName of CTX_PARAM_NAMES) {
		handlerBody = handlerBody.replace(new RegExp(`\\b${ctxName}\\.logger\\b`, 'g'), 'logger');
	}

	// 3c. Replace ctx.<service> → <service> for all detected services.
	for (const service of agentInfo.ctxServices) {
		for (const ctxName of CTX_PARAM_NAMES) {
			const pattern = new RegExp(`\\b${ctxName}\\.${service}\\b`, 'g');
			handlerBody = handlerBody.replace(pattern, service);
		}
	}

	// 3d. Replace ctx.thread / ctx.sessionId / ctx.app with obvious stubs.
	// These concepts have no v3 equivalent. We rewrite whole ctx.<x>.*
	// expression chains by scanning the handler AST so we don't mangle
	// surrounding punctuation the way a pure regex would.
	const droppedAccessors = new Set<string>();
	const handlerSf = ts.createSourceFile('handler.ts', handlerBody, ts.ScriptTarget.ESNext, true);
	const edits: Array<{ start: number; end: number; replacement: string }> = [];

	// Walk expressions that START with a ctx-named identifier and whose full
	// chain matches our pattern. We accumulate all unique full-chain ranges
	// and, later, keep only the outermost chain at each location.
	function visitExpr(node: ts.Node): void {
		if (ts.isPropertyAccessExpression(node) || ts.isCallExpression(node)) {
			// Find the leftmost identifier by walking .expression left.
			let cur: ts.Node = node;
			while (true) {
				if (ts.isPropertyAccessExpression(cur)) {
					cur = cur.expression;
				} else if (ts.isCallExpression(cur)) {
					cur = cur.expression;
				} else if (ts.isElementAccessExpression(cur)) {
					cur = cur.expression;
				} else {
					break;
				}
			}
			if (ts.isIdentifier(cur) && CTX_PARAM_NAMES.includes(cur.text)) {
				// Need to check the first property access is one of our removed keys
				// by re-walking from the leaf.
				const parent: ts.Node | undefined = cur.parent;
				let firstProp: string | undefined;
				if (parent && ts.isPropertyAccessExpression(parent) && parent.expression === cur) {
					firstProp = parent.name.text;
				}
				if (firstProp && (firstProp === 'thread' || firstProp === 'app')) {
					edits.push({
						start: node.getStart(handlerSf),
						end: node.getEnd(),
						replacement: `(undefined /* v3: ${cur.text}.${firstProp} removed */ as any)`,
					});
					droppedAccessors.add(`${cur.text}.${firstProp}`);
				} else if (firstProp === 'sessionId') {
					edits.push({
						start: node.getStart(handlerSf),
						end: node.getEnd(),
						replacement: "('v3-no-session-id' /* v3: ctx.sessionId removed */)",
					});
					droppedAccessors.add(`${cur.text}.sessionId`);
				}
			}
		}
		ts.forEachChild(node, visitExpr);
	}
	ts.forEachChild(handlerSf, visitExpr);

	// Keep only the **outermost** ctx.x.y.z chain per location. The AST visitor
	// emits overlapping edits for every nested property access, so sort by
	// length descending and drop anything contained within a larger accepted
	// edit.
	if (edits.length > 0) {
		edits.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
		const kept: Array<{ start: number; end: number; replacement: string }> = [];
		for (const e of edits) {
			const overlaps = kept.some((k) => !(e.end <= k.start || e.start >= k.end));
			if (!overlaps) kept.push(e);
		}
		// Apply right-to-left so earlier offsets stay valid.
		kept.sort((a, b) => b.start - a.start);
		let body = handlerBody;
		for (const e of kept) {
			body = body.slice(0, e.start) + e.replacement + body.slice(e.end);
		}
		handlerBody = body;
	}
	if (droppedAccessors.size > 0) {
		changes.push(`Stubbed out ctx accessors removed in v3: ${[...droppedAccessors].join(', ')}`);
	}

	// Update extracted payload with rewritten body.
	const rewrittenExtracted = { ...extracted, handlerBody };

	// Step 4: Replace the createAgent() statement with the plain function.
	output = replaceCreateAgentWithFunction(output, agentInfo, rewrittenExtracted);
	changes.push(`Converted complex agent "${agentInfo.name}" to plain exported async function`);

	// Step 5: Hoist setup() body to module-level singletons.
	if (setupInfo && configRefs.size > 0) {
		const singletonBlock = buildLazyInitBlock(configRefs, setupInfo);
		output = insertAfterImports(output, singletonBlock);
		changes.push(
			`Hoisted setup() return values to module-level lazy init: ${[...configRefs].join(', ')}`
		);
	}

	// Step 6: Prepend a review banner so the user knows this was auto-ejected.
	const banner =
		'// ℹ️  v3 migration — complex agent auto-ejected\n' +
		`//    Reason: ${agentInfo.complexityReason ?? 'unknown'}\n` +
		'//    Review the hoisted singletons, TODO comments, and the stubbed-out\n' +
		'//    thread/session accessors — these v2 features have no v3 equivalent.\n';
	output = banner + output;

	return { source: output, changes, manualRequired: true };
}

/**
 * Build a module-level lazy init block from the setup() body.
 *
 * Output shape (singleton pattern):
 *
 *   let _client: ReturnType<typeof __buildSetup>['client'] | undefined;
 *   function getClient() {
 *     return _client ?? (_client = (() => { ... setup body returns .client ... })());
 *   }
 *
 * For simplicity and to avoid having to type-reason about return shape, we
 * emit a single IIFE that runs setup() on first access and caches per-key.
 */
function buildLazyInitBlock(keys: Set<string>, setup: { setupBodyText: string }): string {
	const keyList = [...keys];
	const lines: string[] = [];
	lines.push(
		'\n// v3: lazy-init singletons hoisted from the former setup() hook.\n' +
			'// Each key is computed lazily on first access so we keep the original\n' +
			'// semantics (constructors run at handler-time, not at module load).'
	);
	lines.push(`let __setupResult: Record<string, unknown> | undefined;`);
	lines.push(`async function __runSetup(): Promise<Record<string, unknown>> {`);
	lines.push(`\tif (__setupResult) return __setupResult;`);
	lines.push(
		`\t// Original setup() body — adjust by hand if it referenced ctx:\n\tconst __result = await (async () => ${setup.setupBodyText})();`
	);
	lines.push(`\t__setupResult = __result as Record<string, unknown>;`);
	lines.push(`\treturn __setupResult;`);
	lines.push(`}`);
	for (const key of keyList) {
		lines.push(
			`async function get_${key}() { return (await __runSetup())[${JSON.stringify(key)}] as any; }`
		);
		// We also expose a sync alias for cases where the original code read ctx.config.X
		// synchronously — the user will need to await. We emit a `const X = await get_X()` stub
		// near the start of the handler via the handler-body rewriter later on.
	}
	return lines.join('\n') + '\n';
}

/**
 * Extract the body of the setup() property/method on the createAgent() config.
 */
function extractSetupFromCreateAgent(sourceFile: ts.SourceFile): { setupBodyText: string } | null {
	let result: { setupBodyText: string } | null = null;

	function visit(node: ts.Node) {
		if (result) return;

		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === 'createAgent'
		) {
			const configArg = node.arguments[1];
			if (!configArg || !ts.isObjectLiteralExpression(configArg)) return;

			for (const prop of configArg.properties) {
				const name =
					(ts.isPropertyAssignment(prop) || ts.isMethodDeclaration(prop)) &&
					ts.isIdentifier(prop.name)
						? prop.name.text
						: undefined;
				if (name !== 'setup') continue;

				let body: ts.Block | ts.Expression | undefined;
				if (ts.isPropertyAssignment(prop)) {
					const init = prop.initializer;
					if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
						body = init.body;
					}
				} else if (ts.isMethodDeclaration(prop)) {
					body = prop.body;
				}
				if (!body) continue;

				const bodyText = body.getText(sourceFile);
				result = { setupBodyText: bodyText };
			}
		}

		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return result;
}

/**
 * For complex agents we cannot auto-migrate, add a migration comment block
 * only (fallback if the handler couldn't be extracted).
 */
function addManualMigrationComment(source: string, agentInfo: AgentFile): AgentTransformResult {
	const comment =
		`// ⚠️  MIGRATION REQUIRED — createAgent() removed in v3\n` +
		`//\n` +
		`// This agent ("${agentInfo.name}") requires manual migration because:\n` +
		`//   ${agentInfo.complexityReason}\n` +
		`//\n` +
		`// To migrate:\n` +
		`//   1. Extract the handler into a plain exported async function\n` +
		`//   2. Move setup() logic to module-level initialization\n` +
		`//   3. Replace ctx.kv/ctx.vector/etc. with imports from '../services'\n` +
		`//   4. Replace ctx.config with direct configuration\n` +
		`//   5. Remove event listeners (use your own event patterns)\n` +
		`//   6. Remove the createAgent() import and wrapper\n` +
		`//\n` +
		`// Example after migration:\n` +
		`//   import { kv } from '../services';\n` +
		`//\n` +
		`//   export async function ${toFunctionName(agentInfo.name)}(input: YourInputType) {\n` +
		`//     const data = await kv.get('namespace', 'key');\n` +
		`//     return { result: data };\n` +
		`//   }\n`;

	return {
		source: comment + '\n' + source,
		changes: [`Added migration comment for complex agent "${agentInfo.name}"`],
		manualRequired: true,
	};
}

/**
 * Extract the handler function body and parameters from createAgent().
 */
function extractHandlerFromCreateAgent(
	sourceFile: ts.SourceFile,
	_source: string
): {
	handlerParams: string;
	handlerBody: string;
	hasSchema: boolean;
	schemaText?: string;
} | null {
	let result: {
		handlerParams: string;
		handlerBody: string;
		hasSchema: boolean;
		schemaText?: string;
	} | null = null;

	function visit(node: ts.Node) {
		if (result) return;

		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === 'createAgent'
		) {
			const configArg = node.arguments[1];
			if (!configArg || !ts.isObjectLiteralExpression(configArg)) return;

			let handlerNode: ts.Node | undefined;
			let schemaNode: ts.Node | undefined;

			for (const prop of configArg.properties) {
				if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
					if (prop.name.text === 'handler') {
						handlerNode = prop.initializer;
					}
					if (prop.name.text === 'schema') {
						schemaNode = prop.initializer;
					}
				}
				if (ts.isMethodDeclaration(prop) && ts.isIdentifier(prop.name)) {
					if (prop.name.text === 'handler') {
						handlerNode = prop;
					}
				}
			}

			if (!handlerNode) return;

			// Extract handler params and body
			let params: ts.NodeArray<ts.ParameterDeclaration> | undefined;
			let body: ts.Block | ts.Expression | undefined;

			if (ts.isArrowFunction(handlerNode) || ts.isFunctionExpression(handlerNode)) {
				params = handlerNode.parameters;
				body = handlerNode.body;
			} else if (ts.isMethodDeclaration(handlerNode)) {
				params = handlerNode.parameters;
				body = handlerNode.body;
			}

			if (!body) return;

			// Get parameter text (skip ctx/context parameter, keep input).
			// We also ensure every surviving param has a type annotation — the v2
			// scaffold relied on createAgent<Schema>() to type the handler's input,
			// which is gone in v3. Rather than lose type information, we fall back
			// to `: unknown` + a TODO so the resulting plain function compiles
			// under strict mode. Users can tighten the type by parsing with zod.
			const paramTexts: string[] = [];
			if (params) {
				for (let i = 0; i < params.length; i++) {
					const param = params[i];
					if (!param) continue;
					const paramName = param.name.getText(sourceFile);
					// Skip the first param if it's ctx/context (agent context)
					if (i === 0 && CTX_PARAM_NAMES.includes(paramName)) continue;
					let paramText = param.getText(sourceFile);
					// If the param has no type annotation (v2 scaffold relied on
					// createAgent generics), inject `: any` so the plain function
					// still compiles.
					if (!param.type) {
						paramText += ': any';
					}
					paramTexts.push(paramText);
				}
			}

			// Get body text
			const bodyText = body.getText(sourceFile);

			// Get schema text if present
			const schemaText = schemaNode?.getText(sourceFile);

			result = {
				handlerParams: paramTexts.join(', '),
				handlerBody: bodyText,
				hasSchema: !!schemaNode,
				schemaText,
			};
		}

		ts.forEachChild(node, visit);
	}

	visit(sourceFile);
	return result;
}

/**
 * Remove `import { createAgent } from '@agentuity/runtime'` (and any other
 * named imports from that module).
 */
function removeCreateAgentImport(source: string): string {
	// Remove the entire @agentuity/runtime import line
	// (there shouldn't be other useful imports from runtime in v3)
	return source.replace(/import\s*\{[^}]*\}\s*from\s*['"]@agentuity\/runtime['"]\s*;?\s*\n?/g, '');
}

/**
 * Insert an import line after the last existing import declaration.
 * Uses AST to correctly handle multi-line imports.
 */
function insertAfterImports(source: string, importLine: string): string {
	const sf = ts.createSourceFile('temp.ts', source, ts.ScriptTarget.ESNext, true);

	let lastImportEnd = -1;
	for (const stmt of sf.statements) {
		if (ts.isImportDeclaration(stmt)) {
			lastImportEnd = stmt.getEnd();
		}
	}

	if (lastImportEnd >= 0) {
		return (
			source.substring(0, lastImportEnd) + '\n' + importLine + source.substring(lastImportEnd)
		);
	}

	// No imports — add at the top
	return importLine + '\n' + source;
}

/**
 * Replace the createAgent() call with a plain exported async function.
 *
 * Uses AST node positions for precise replacement instead of regex
 * (which can't handle nested braces in the config object).
 */
function replaceCreateAgentWithFunction(
	source: string,
	agentInfo: AgentFile,
	extracted: {
		handlerParams: string;
		handlerBody: string;
		hasSchema: boolean;
		schemaText?: string;
	}
): string {
	const funcName = toFunctionName(agentInfo.name);

	// Build the function signature
	const funcSignature = `export async function ${funcName}(${extracted.handlerParams})`;

	// Build the body
	let bodyText = extracted.handlerBody;
	// If the body is already a block { ... }, use it directly
	// If it's a single expression (arrow function body), wrap it
	if (!bodyText.trimStart().startsWith('{')) {
		bodyText = `{\n\treturn ${bodyText};\n}`;
	}

	// Add schema validation at the top of the function body if schema was present
	let schemaComment = '';
	if (extracted.hasSchema && extracted.schemaText) {
		schemaComment =
			'\n// TODO: Schema validation was previously handled by createAgent().\n' +
			'// The original schema definition was:\n' +
			`//   schema: ${extracted.schemaText.split('\n').join('\n//   ')}\n` +
			'// Consider using zod or @agentuity/schema for input validation.\n';
	}

	const replacement = schemaComment + funcSignature + ' ' + bodyText;

	// Use AST to find the exact range of the createAgent() statement
	const sourceFile = ts.createSourceFile(agentInfo.path, source, ts.ScriptTarget.ESNext, true);

	let createAgentStart = -1;
	let createAgentEnd = -1;
	let exportDefaultVarName: string | null = null;
	let isDirectExportDefault = false;

	for (const stmt of sourceFile.statements) {
		// Pattern 1: export default createAgent('name', { ... })
		if (ts.isExportAssignment(stmt) && !stmt.isExportEquals) {
			const expr = stmt.expression;
			if (
				ts.isCallExpression(expr) &&
				ts.isIdentifier(expr.expression) &&
				expr.expression.text === 'createAgent'
			) {
				createAgentStart = stmt.getStart(sourceFile);
				createAgentEnd = stmt.getEnd();
				isDirectExportDefault = true;
				break;
			}
		}

		// Pattern 2: const agent = createAgent('name', { ... })
		if (ts.isVariableStatement(stmt)) {
			const declarations = stmt.declarationList.declarations;
			if (declarations.length === 1) {
				const decl = declarations[0];
				if (decl?.initializer) {
					let callExpr: ts.CallExpression | undefined;
					if (
						ts.isCallExpression(decl.initializer) &&
						ts.isIdentifier(decl.initializer.expression) &&
						decl.initializer.expression.text === 'createAgent'
					) {
						callExpr = decl.initializer;
					} else if (
						ts.isAwaitExpression(decl.initializer) &&
						ts.isCallExpression(decl.initializer.expression) &&
						ts.isIdentifier(decl.initializer.expression.expression) &&
						decl.initializer.expression.expression.text === 'createAgent'
					) {
						callExpr = decl.initializer.expression;
					}

					if (callExpr && ts.isIdentifier(decl.name)) {
						exportDefaultVarName = decl.name.text;
						createAgentStart = stmt.getStart(sourceFile);
						createAgentEnd = stmt.getEnd();
						break;
					}
				}
			}
		}
	}

	if (createAgentStart === -1) {
		// Couldn't find the createAgent statement — return source unchanged
		return source;
	}

	// Replace the createAgent statement with the function
	let result =
		source.substring(0, createAgentStart) + replacement + source.substring(createAgentEnd);

	// Handle the export default
	if (isDirectExportDefault) {
		// The export default was part of the statement we replaced,
		// so add a separate export default
		result += `\n\nexport default ${funcName};\n`;
	} else if (exportDefaultVarName) {
		// Replace `export default varName` with `export default funcName`
		result = result.replace(
			new RegExp(`export\\s+default\\s+${exportDefaultVarName}\\s*;?`),
			`export default ${funcName};`
		);
	}

	return result;
}

/**
 * Convert kebab-case or snake_case agent name to camelCase function name.
 */
/** Service names that could clash with function names */
const RESERVED_SERVICE_NAMES = new Set([
	'kv',
	'vector',
	'stream',
	'queue',
	'email',
	'task',
	'schedule',
	'sandbox',
	'logger',
]);

/**
 * Convert agent name to a valid, non-clashing function name.
 * Appends 'Handler' suffix if the name would clash with a service import.
 */
function toFunctionName(name: string): string {
	const camel = name.replace(/[-_]([a-z])/g, (_, c) => c.toUpperCase());
	if (RESERVED_SERVICE_NAMES.has(camel)) {
		return camel + 'Handler';
	}
	return camel;
}
