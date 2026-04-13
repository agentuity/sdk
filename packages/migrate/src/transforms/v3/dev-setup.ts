/**
 * Transform: dev setup for Hono + SPA projects.
 *
 * When a project has both a Hono backend (src/index.ts) and a Vite SPA
 * (src/web/), we need to set up a dev workflow that runs both:
 *
 *   1. Add a Vite proxy config so /api requests go to the Hono backend
 *   2. Set up dev scripts to run both servers concurrently
 *
 * In production, the buildpack handles this (static server + Hono backend).
 * In dev, we use Vite's built-in proxy to keep it a single-port experience.
 */

import ts from 'typescript';

const API_PORT = 3001;

export interface DevSetupResult {
	/** Patched vite.config.ts content, or null if no changes */
	viteConfig: string | null;
	/** Changes made to vite.config.ts */
	viteChanges: string[];
	/** dev script value for package.json */
	devScript: string;
	/** server:api script value for package.json */
	serverScript: string;
}

/**
 * Generate dev setup for a Hono + Vite SPA project.
 */
export function generateDevSetup(viteConfigSource: string | null): DevSetupResult {
	const serverScript = `PORT=${API_PORT} bun --hot src/index.ts`;
	const devScript = `bun run server:api & vite dev`;

	if (!viteConfigSource) {
		// No vite.config.ts — just return scripts, no vite changes
		return {
			viteConfig: null,
			viteChanges: [],
			devScript: serverScript, // No SPA, just run the server
			serverScript,
		};
	}

	// Check if proxy is already configured
	if (viteConfigSource.includes('proxy')) {
		return {
			viteConfig: null,
			viteChanges: ['Vite proxy already configured — skipped'],
			devScript,
			serverScript,
		};
	}

	// Add server.proxy to vite.config.ts using AST to find the right insertion point
	const patched = addViteProxy(viteConfigSource);

	return {
		viteConfig: patched.source,
		viteChanges: patched.changes,
		devScript,
		serverScript,
	};
}

/**
 * Add server.proxy configuration to vite.config.ts.
 *
 * Finds the defineConfig() call and injects a `server` property with proxy config.
 */
function addViteProxy(source: string): { source: string; changes: string[] } {
	const changes: string[] = [];

	const proxyConfig =
		`\tserver: {\n` +
		`\t\tproxy: {\n` +
		`\t\t\t'/api': {\n` +
		`\t\t\t\ttarget: 'http://localhost:${API_PORT}',\n` +
		`\t\t\t\tchangeOrigin: true,\n` +
		`\t\t\t},\n` +
		`\t\t},\n` +
		`\t},`;

	const sf = ts.createSourceFile('vite.config.ts', source, ts.ScriptTarget.ESNext, true);

	// Find the defineConfig() call's object literal argument
	let configObjectEnd = -1;

	function visit(node: ts.Node) {
		if (configObjectEnd >= 0) return;

		if (
			ts.isCallExpression(node) &&
			ts.isIdentifier(node.expression) &&
			node.expression.text === 'defineConfig'
		) {
			const arg = node.arguments[0];
			if (arg && ts.isObjectLiteralExpression(arg)) {
				// Insert before the closing brace of the config object
				configObjectEnd = arg.getEnd() - 1; // Position of `}`
			}
		}

		ts.forEachChild(node, visit);
	}

	visit(sf);

	if (configObjectEnd >= 0) {
		// Insert the proxy config before the closing `}` of defineConfig({...})
		const before = source.substring(0, configObjectEnd);
		const after = source.substring(configObjectEnd);

		// Check if there's already content (need a comma)
		const trimmedBefore = before.trimEnd();
		const needsComma = trimmedBefore.endsWith(',') || trimmedBefore.endsWith('{') ? '' : ',';

		const result = `${before}${needsComma}\n${proxyConfig}\n${after}`;
		changes.push(`Added server.proxy config: /api → http://localhost:${API_PORT}`);

		return { source: result, changes };
	}

	// Fallback: couldn't find defineConfig — append a comment
	const fallback =
		source +
		'\n\n// TODO: Add Vite proxy for dev mode:\n' +
		'// server: {\n' +
		'//   proxy: {\n' +
		`//     '/api': { target: 'http://localhost:${API_PORT}', changeOrigin: true },\n` +
		'//   },\n' +
		'// },\n';

	changes.push('Could not auto-patch vite.config.ts — added proxy config as comment');
	return { source: fallback, changes };
}
