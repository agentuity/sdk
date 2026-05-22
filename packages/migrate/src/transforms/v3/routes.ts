/**
 * Transform: rewrite service access in route files.
 *
 * Replaces c.var.kv, c.var.vector, etc. with direct imports from the
 * shared services module.
 *
 * Uses string-level surgery rather than AST round-trip to preserve
 * formatting and comments.
 */

import ts from 'typescript';
import type { ServiceUsage } from '../../detect-v3';
import { relative, dirname } from 'node:path';

export interface RouteServiceTransformResult {
	/** The transformed source, or null if no changes */
	source: string | null;
	/** What was changed */
	changes: string[];
}

/**
 * Rewrite c.var.* service access patterns to direct imports.
 *
 * @param source     - File source text
 * @param usage      - Detected service usage info
 * @param servicesRelativePath - Relative import path to services module (e.g., '../services')
 */
/**
 * Remove all imports from @agentuity/runtime and re-route individual symbols
 * to their v3 replacements where applicable.
 *
 * Recognised re-routes:
 *   - `Env`                → local types file (generated elsewhere)
 *   - `validator`          → dropped (v3 has no equivalent middleware; callers
 *                           now parse input via zod inline)
 *   - everything else      → dropped silently (deprecation stubs)
 *
 * Returns the rewritten source plus flags for each recognised symbol so the
 * caller can emit the replacement imports in the right order.
 */
export interface RuntimeImportCleanup {
	source: string;
	removed: boolean;
	/** Whether `Env` was imported from @agentuity/runtime */
	needsEnvType: boolean;
	/** Whether `validator` (the Agentuity validator helper) was imported */
	hadAgentuityValidator: boolean;
}

export function removeRuntimeImports(source: string): RuntimeImportCleanup {
	let needsEnvType = false;
	let hadAgentuityValidator = false;
	let removed = false;

	// Match both `import { ... } from '@agentuity/runtime'` and
	// `import type { ... } from '@agentuity/runtime'` (incl. multiline).
	const pattern =
		/import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]@agentuity\/runtime['"]\s*;?\s*\n?/g;
	const output = source.replace(pattern, (_match, inner: string) => {
		removed = true;
		const names = inner
			.split(',')
			.map((s) => s.trim())
			.map((s) => s.replace(/^type\s+/, ''))
			.filter(Boolean);
		if (names.includes('Env')) needsEnvType = true;
		if (names.includes('validator')) hadAgentuityValidator = true;
		return '';
	});

	return { source: output, removed, needsEnvType, hadAgentuityValidator };
}

export function transformRouteServices(
	source: string,
	usage: ServiceUsage,
	servicesRelativePath: string
): RouteServiceTransformResult {
	let output = source;
	const changes: string[] = [];
	const servicesAdded = new Set<string>();

	// Remove @agentuity/runtime imports (Env type, sse, stream, websocket, etc.)
	const runtimeCleanup = removeRuntimeImports(output);
	if (runtimeCleanup.removed) {
		output = runtimeCleanup.source;
		changes.push('Removed @agentuity/runtime imports');

		// Re-route Env to the generated types file
		if (runtimeCleanup.needsEnvType) {
			output = insertAfterImports(output, "import type { Env } from '../types/hono-env';");
			changes.push("Added: import type { Env } from '../types/hono-env'");
		}

		// Strip v2-era validator middleware calls that have no v3 equivalent.
		const stripped = stripAgentuityValidators(output);
		if (stripped.changed) {
			output = stripped.source;
			changes.push(...stripped.changes);
		}
	}

	// Rewrite v2-era agent method calls in route files.
	const agentRewrite = rewriteV2AgentMethods(output);
	if (agentRewrite.changed) {
		output = agentRewrite.source;
		changes.push(...agentRewrite.changes);
	}

	// Stub out c.var.thread / c.var.sessionId — v2 concepts with no v3 replacement.
	const stubRewrite = stubV2HonoContext(output);
	if (stubRewrite.changed) {
		output = stubRewrite.source;
		changes.push(...stubRewrite.changes);
	}

	if (usage.accessPattern === 'c.var') {
		// Replace c.var.serviceName patterns
		// We need to handle various Hono context variable names: c, ctx, context
		const contextNames = ['c', 'ctx', 'context'];

		for (const service of usage.services) {
			for (const ctxName of contextNames) {
				// Match: c.var.kv  c.var.vector  etc.
				const pattern = new RegExp(`\\b${ctxName}\\.var\\.${service}\\b`, 'g');
				if (pattern.test(output)) {
					output = output.replace(pattern, service);
					servicesAdded.add(service);
					changes.push(`Replaced ${ctxName}.var.${service} → ${service}`);
				}
			}
		}
	} else if (usage.accessPattern === 'ctx') {
		// Replace ctx.serviceName patterns (agent context)
		const contextNames = ['ctx', 'context', 'c'];

		for (const service of usage.services) {
			for (const ctxName of contextNames) {
				const pattern = new RegExp(`\\b${ctxName}\\.${service}\\b`, 'g');
				if (pattern.test(output)) {
					output = output.replace(pattern, service);
					servicesAdded.add(service);
					changes.push(`Replaced ${ctxName}.${service} → ${service}`);
				}
			}
		}
	}

	// Clean up self-referencing declarations: `const kv = kv;` or `const stream = await stream.create(...)`
	// These happen when the original code had `const kv = c.var.kv;`
	if (servicesAdded.size > 0) {
		for (const service of servicesAdded) {
			// Pattern: const/let/var service = service; (entire line)
			const selfRefPattern = new RegExp(
				`^\\s*(?:const|let|var)\\s+${service}\\s*=\\s*${service}\\s*;?\\s*$`,
				'gm'
			);
			if (selfRefPattern.test(output)) {
				output = output.replace(selfRefPattern, '');
				changes.push(`Removed self-referencing declaration: const ${service} = ${service}`);
			}
		}
	}

	// Add import for services if any were rewritten
	if (servicesAdded.size > 0) {
		const importList = [...servicesAdded].sort().join(', ');
		const importLine = `import { ${importList} } from '${servicesRelativePath}';`;

		// Check if there's already an import from the services module
		const existingServicesImport = new RegExp(
			`import\\s*\\{[^}]*\\}\\s*from\\s*['"]${escapeRegex(servicesRelativePath)}['"]`
		);

		if (existingServicesImport.test(output)) {
			// Merge with existing import
			output = output.replace(existingServicesImport, (match) => {
				// Extract existing imports
				const existingMatch = match.match(/\{([^}]*)\}/);
				if (!existingMatch) return match;
				const existing = existingMatch[1]!
					.split(',')
					.map((s) => s.trim())
					.filter(Boolean);
				const merged = [...new Set([...existing, ...servicesAdded])].sort();
				return `import { ${merged.join(', ')} } from '${servicesRelativePath}'`;
			});
		} else {
			// Insert new import after existing imports
			output = insertAfterImports(output, importLine);
		}

		changes.push(`Added import for: ${importList}`);
	}

	if (changes.length === 0) {
		return { source: null, changes: [] };
	}

	return { source: output, changes };
}

/**
 * Compute the relative import path from a source file to src/services.ts.
 */
export function computeServicesRelativePath(projectDir: string, sourceFilePath: string): string {
	const servicesPath = 'src/services';
	const sourceDir = dirname(relative(projectDir, sourceFilePath));

	let rel = relative(sourceDir, servicesPath);
	// Ensure it starts with ./ or ../
	if (!rel.startsWith('.')) {
		rel = './' + rel;
	}
	// Remove .ts extension if present
	rel = rel.replace(/\.ts$/, '');

	return rel;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Rewrite v2-era agent method invocations to plain function calls in route
 * files.
 *
 *   translate.run(data)   → translate(data)
 *   translate.validator() → /* stripped above * /
 *
 * We also rewrite `c.req.valid('json')` → `await c.req.json()` — the former
 * was the output of the v2 validator middleware that we stripped.
 */
export function rewriteV2AgentMethods(source: string): {
	source: string;
	changed: boolean;
	changes: string[];
} {
	let output = source;
	const changes: string[] = [];

	// <agent>.run(x) → <agent>(x)
	const before1 = output;
	output = output.replace(
		/\b([A-Za-z_$][A-Za-z0-9_$]*)\.run\(/g,
		(_m, name: string) => `${name}(`
	);
	if (output !== before1) {
		changes.push('Rewrote <agent>.run(…) → <agent>(…)');
	}

	// c.req.valid('json') → (await c.req.json())
	const before2 = output;
	output = output.replace(/\bc\.req\.valid\(\s*['"]json['"]\s*\)/g, '(await c.req.json())');
	if (output !== before2) {
		changes.push("Rewrote c.req.valid('json') → await c.req.json()");
	}

	return { source: output, changed: changes.length > 0, changes };
}

/**
 * Stub out v2-era Hono context variables that no longer exist in v3.
 *
 * v3's Services interface only includes storage clients (kv, vector, stream,
 * etc.). Thread state, sessionId, and app-level state were removed when v3
 * dropped the createApp() abstraction.
 */
export function stubV2HonoContext(source: string): {
	source: string;
	changed: boolean;
	changes: string[];
} {
	let output = source;
	const changes = new Set<string>();

	// c.var.thread.*  — stub out the whole chain as `(undefined as any)`.
	//
	// The chain can include:
	//   • Dotted property access:       c.var.thread.state
	//   • Generic type arguments:       .get<HistoryEntry[]>
	//   • Call sites:                   .get<T>('key')
	//   • Multiple chained calls:       .state.push(…).something()
	//
	// We do this greedily by chaining an alternation until we hit a terminator.
	const before1 = output;
	output = output.replace(
		/c\.var\.thread(?:\.[A-Za-z0-9_$]+|<[^>]*>|\([^()]*\))*/g,
		'(undefined as any) /* v3: c.var.thread removed */'
	);
	if (output !== before1) {
		changes.add('Stubbed c.var.thread.* (removed in v3)');
	}

	const before2 = output;
	output = output.replace(
		/c\.var\.sessionId\b/g,
		"('v3-no-session-id' as string) /* v3: c.var.sessionId removed */"
	);
	if (output !== before2) {
		changes.add('Stubbed c.var.sessionId (removed in v3)');
	}

	return { source: output, changed: changes.size > 0, changes: [...changes] };
}

/**
 * Strip v2 validator middleware from a source string.
 *
 * Removes two shapes:
 *   - `validator({ input: ... })` / `validator({ output: ... })` imported
 *     from @agentuity/runtime (used as Hono middleware)
 *   - `<agent>.validator()` — the auto-generated method on v2 agents used as
 *     middleware on routes that forward to the agent
 *
 * Both become comments so the file parses but the user can see where to wire
 * up manual validation (typically via `zod.parse(await c.req.json())`).
 */
export function stripAgentuityValidators(source: string): {
	source: string;
	changed: boolean;
	changes: string[];
} {
	let output = source;
	const changes: string[] = [];

	// validator({ ... }),   — tolerate whitespace/newlines
	const before1 = output;
	output = output.replace(
		/\s*validator\(\s*\{[\s\S]*?\}\s*\)\s*,?/g,
		' /* v3: validator() removed — validate inline with zod */ '
	);
	if (output !== before1) {
		changes.push('Stripped Agentuity validator() middleware calls');
	}

	// <agent>.validator(),
	const before2 = output;
	output = output.replace(
		/\s*[A-Za-z_$][A-Za-z0-9_$]*\.validator\(\s*\)\s*,?/g,
		' /* v3: agent.validator() removed — parse input with zod */ '
	);
	if (output !== before2) {
		changes.push('Stripped <agent>.validator() middleware calls');
	}

	return { source: output, changed: changes.length > 0, changes };
}

export function insertAfterImports(source: string, importLine: string): string {
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

	return importLine + '\n' + source;
}

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
