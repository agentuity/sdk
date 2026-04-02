/**
 * Transform: v1 route files → v2 Hono chained style
 *
 * v1 pattern:
 *   import { createRouter } from '@agentuity/runtime';
 *   const router = createRouter();
 *   router.get('/foo', handler);
 *   router.post('/bar', handler);
 *   export default router;
 *
 * v2 pattern:
 *   import { Hono } from 'hono';
 *   import type { Env } from '@agentuity/runtime';
 *
 *   const router = new Hono<Env>()
 *     .get('/foo', handler)
 *     .post('/bar', handler);
 *
 *   export default router;
 *
 * WHY CHAINING MATTERS — Hono RPC type inference:
 *   Hono accumulates route types via TypeScript's return-type inference on
 *   each chained call.  If you break the chain (e.g. `router.get(...)` on a
 *   separate statement after the variable declaration), the Schema type
 *   parameter never accumulates new routes and `typeof router` carries no
 *   route information.  The chained style is the ONLY way to get the full
 *   AppRouter type used by `hc<AppRouter>()` on the frontend.
 *
 *   Individual route files export a typed router; the barrel (src/api/index.ts)
 *   composes them with `.route()` and re-exports `AppRouter = typeof router`.
 *   Frontend code imports that type:
 *
 *     import { hc } from 'hono/client';
 *     import type { AppRouter } from '../api';          // or wherever
 *     const client = hc<AppRouter>(window.location.origin + '/api');
 *     const res = await client.hello.$post({ json: { name: 'World' } });
 *
 * COMPLEXITY GUARD: if the file:
 *   • Has more than one createRouter() call
 *   • Uses variable re-assignment of the router variable
 * …we refuse and return a complexityError.
 */

import ts from 'typescript';

function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface RouteTransformResult {
	source: string | null;
	complexityError?: string;
	changes: string[];
}

// HTTP methods supported by Hono (chained)
const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'all', 'route', 'use']);

interface RouterCall {
	method: string;
	/** Full text of `router.<method>(args)` statement */
	statementText: string;
	/** Just the argument list text, e.g. `'/foo', handler` */
	argsText: string;
}

export function transformRouteFile(source: string): RouteTransformResult {
	const changes: string[] = [];

	// ── Parse ──────────────────────────────────────────────────────────────
	const sf = ts.createSourceFile('route.ts', source, ts.ScriptTarget.ESNext, true);

	// ── Find createRouter() variable declaration ───────────────────────────
	let routerVarName: string | null = null;

	ts.forEachChild(sf, (node) => {
		if (
			ts.isVariableStatement(node) ||
			(ts.isVariableDeclarationList(node) && node.declarations)
		) {
			const declList = ts.isVariableStatement(node)
				? node.declarationList.declarations
				: (node as ts.VariableDeclarationList).declarations;

			for (const decl of declList) {
				if (
					decl.initializer &&
					ts.isCallExpression(decl.initializer) &&
					ts.isIdentifier(decl.initializer.expression) &&
					decl.initializer.expression.text === 'createRouter' &&
					ts.isIdentifier(decl.name)
				) {
					if (routerVarName !== null) {
						return; // multiple createRouter calls
					}
					routerVarName = decl.name.text;
				}
			}
		}
	});

	if (!routerVarName) {
		// Not a v1 route file — nothing to do
		return { source, changes: [] };
	}

	// ── Complexity checks ─────────────────────────────────────────────────

	// Count how many times createRouter() is called
	let createRouterCount = 0;
	(source.match(/createRouter\s*\(/g) ?? []).forEach(() => createRouterCount++);
	if (createRouterCount > 1) {
		return {
			source: null,
			complexityError:
				`Route file calls createRouter() ${createRouterCount} times. ` +
				`Only a single top-level router variable is supported by the auto-migration.`,
			changes: [],
		};
	}

	// Check for re-assignment (after declaration)
	// The initial `const router = createRouter()` is one match; any additional = re-assignment
	const reassignPattern = new RegExp(`\\b${routerVarName}\\s*=(?!=)`, 'g');
	const reassignMatches = source.match(reassignPattern) ?? [];
	if (reassignMatches.length > 1) {
		return {
			source: null,
			complexityError:
				`Router variable '${routerVarName}' appears to be re-assigned. ` +
				`This pattern cannot be automatically migrated.`,
			changes: [],
		};
	}

	// ── Collect router.<method>(...) calls ────────────────────────────────
	const routerCalls: RouterCall[] = [];

	ts.forEachChild(sf, (node) => {
		if (!ts.isExpressionStatement(node)) return;
		const expr = node.expression;
		if (!ts.isCallExpression(expr)) return;
		if (!ts.isPropertyAccessExpression(expr.expression)) return;
		const obj = expr.expression.expression;
		const method = expr.expression.name.text;

		if (!ts.isIdentifier(obj) || obj.text !== routerVarName) return;
		if (!HTTP_METHODS.has(method)) return;

		const argsText = expr.arguments.map((a) => a.getText(sf)).join(', ');
		const statementText = node.getText(sf);

		routerCalls.push({ method, statementText, argsText });
	});

	if (routerCalls.length === 0) {
		// createRouter() declared but no method calls — still rewrite the declaration
	}

	// ── Build replacement source ──────────────────────────────────────────

	// 1. Replace `import { createRouter ... } from '@agentuity/runtime'` with
	//    `import { Hono } from 'hono';` + `import type { Env } from '@agentuity/runtime';`
	let out = source;

	// Remove createRouter from the @agentuity/runtime import
	out = out.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]@agentuity\/runtime['"]\s*;?/g,
		(_match, bindings: string) => {
			const parts = bindings
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean);

			const withoutCreateRouter = parts.filter((p) => p !== 'createRouter');

			const runtimeParts = withoutCreateRouter.filter((p) => !p.startsWith('type '));
			const typeParts = withoutCreateRouter
				.filter((p) => p.startsWith('type '))
				.map((p) => p.slice('type '.length).trim());

			// Always add `Env` to the type imports from @agentuity/runtime
			if (!typeParts.includes('Env')) typeParts.push('Env');

			const lines: string[] = [];

			if (runtimeParts.length > 0) {
				lines.push(`import { ${runtimeParts.join(', ')} } from '@agentuity/runtime';`);
			}
			if (typeParts.length > 0) {
				lines.push(`import type { ${typeParts.join(', ')} } from '@agentuity/runtime';`);
			}

			return lines.join('\n');
		}
	);

	// Add `import { Hono } from 'hono';` if not already present
	if (!out.includes("from 'hono'") && !out.includes('from "hono"')) {
		// Insert after the last import statement
		out = out.replace(
			/^(import\s[^;]+;?\s*\n)(?!import\s)/m,
			(match) => `import { Hono } from 'hono';\n${match}`
		);
	} else {
		// Ensure Hono is in the existing hono import
		out = out.replace(
			/import\s*\{([^}]*)\}\s*from\s*['"]hono['"]\s*;?/,
			(_match, bindings: string) => {
				const parts = bindings
					.split(',')
					.map((s) => s.trim())
					.filter(Boolean);
				if (!parts.includes('Hono')) {
					parts.unshift('Hono');
				}
				return `import { ${parts.join(', ')} } from 'hono';`;
			}
		);
	}

	// 2. Replace `const router = createRouter();` with `const router = new Hono<Env>()`
	//    and fold the method calls into a chain.
	const chainedCalls = routerCalls
		.map(({ method, argsText }) => `\t.${method}(${argsText})`)
		.join('\n');

	const varDecl = `const ${routerVarName} = createRouter();`;

	if (routerCalls.length > 0) {
		const replacement = `const ${routerVarName} = new Hono<Env>()\n${chainedCalls};`;

		// Remove individual router.<method>(...) statements
		let modified = out;
		for (const { statementText } of routerCalls) {
			// Use a literal string replacement (not regex) to avoid special char issues
			modified = modified.split(statementText).join('');
		}

		// Replace the createRouter() declaration
		modified = modified.split(varDecl).join(replacement);

		// Collapse extra blank lines
		modified = modified.replace(/\n{3,}/g, '\n\n');

		out = modified;
		changes.push(
			`Rewrote createRouter() declaration + ${routerCalls.length} method call(s) to chained Hono<Env>`
		);
	} else {
		// No method calls — just swap the declaration
		out = out.split(varDecl).join(`const ${routerVarName} = new Hono<Env>();`);
		changes.push('Rewrote createRouter() declaration to new Hono<Env>()');
	}

	// Add `export type` for the router if not already exported.
	// This lets the barrel (src/api/index.ts) compose routers in a
	// fully-typed way, and downstream consumers can reference sub-router types.
	const exportDefaultPattern = new RegExp(`export\\s+default\\s+${routerVarName}\\s*;?`);
	if (exportDefaultPattern.test(out) && !out.includes(`export type`)) {
		out = out.replace(
			exportDefaultPattern,
			`export type ${capitalize(routerVarName)}Type = typeof ${routerVarName};\n\nexport default ${routerVarName};`
		);
		changes.push(
			`Added 'export type ${capitalize(routerVarName)}Type' for Hono RPC sub-router typing`
		);
	}

	changes.push("Updated imports: added 'hono' import, replaced createRouter with Env type");

	return { source: out, changes };
}
