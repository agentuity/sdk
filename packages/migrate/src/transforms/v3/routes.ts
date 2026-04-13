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
 * Remove all imports from @agentuity/runtime.
 * In v3, this package is a deprecation stub — nothing should be imported from it.
 */
export function removeRuntimeImports(source: string): { source: string; removed: boolean } {
	const pattern =
		/import\s+(?:type\s+)?\{[^}]*\}\s*from\s*['"]@agentuity\/runtime['"]\s*;?\s*\n?/g;
	const replaced = source.replace(pattern, '');
	return { source: replaced, removed: replaced !== source };
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

	return importLine + '\n' + source;
}

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
