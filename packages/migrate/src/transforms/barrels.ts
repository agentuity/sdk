/**
 * Transform: generate/update barrel files
 *
 *  • src/agent/index.ts  — exports default array of all agent runners
 *  • src/api/index.ts    — exports composed Hono router + AppRouter type
 *
 * These are generated fresh; if a file already exists and is not the empty
 * v1 stub we leave it alone (detection layer already decided).
 */

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Agent barrel
// ---------------------------------------------------------------------------

interface AgentEntry {
	importName: string; // camelCase identifier
	relativePath: string; // './hello/agent'
}

function toImportName(agentDirName: string): string {
	// kebab-case or snake_case → camelCase
	return agentDirName
		.split(/[-_]/)
		.map((part, i) => (i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
		.join('');
}

function findAgentDirs(agentDir: string): AgentEntry[] {
	if (!existsSync(agentDir)) return [];
	const entries: AgentEntry[] = [];

	for (const entry of readdirSync(agentDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const agentFile = join(agentDir, entry.name, 'agent.ts');
		if (existsSync(agentFile)) {
			entries.push({
				importName: toImportName(entry.name),
				relativePath: `./${entry.name}/agent`,
			});
		}
	}

	return entries.sort((a, b) => a.importName.localeCompare(b.importName));
}

export function generateAgentBarrel(projectDir: string): string | null {
	const agentDir = join(projectDir, 'src', 'agent');
	const agents = findAgentDirs(agentDir);

	if (agents.length === 0) return null;

	const imports = agents
		.map(({ importName, relativePath }) => `import ${importName} from '${relativePath}';`)
		.join('\n');

	const exportList = agents.map(({ importName }) => `\t${importName},`).join('\n');

	return `${imports}\n\n` + `const agents = [\n${exportList}\n];\n\n` + `export default agents;\n`;
}

// ---------------------------------------------------------------------------
// API barrel
// ---------------------------------------------------------------------------

interface RouteEntry {
	importName: string; // camelCase identifier, e.g. `helloRouter`
	mountPath: string; // '/hello'
	relativePath: string; // './hello/route'
}

function toRouterImportName(routeDirName: string): string {
	const camel = toImportName(routeDirName);
	return `${camel}Router`;
}

function findRouteFiles(apiDir: string): RouteEntry[] {
	if (!existsSync(apiDir)) return [];
	const entries: RouteEntry[] = [];

	for (const entry of readdirSync(apiDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const routeFile = join(apiDir, entry.name, 'route.ts');
		if (existsSync(routeFile)) {
			entries.push({
				importName: toRouterImportName(entry.name),
				mountPath: `/${entry.name}`,
				relativePath: `./${entry.name}/route`,
			});
		}
	}

	return entries.sort((a, b) => a.mountPath.localeCompare(b.mountPath));
}

export function generateApiBarrel(projectDir: string): string | null {
	const apiDir = join(projectDir, 'src', 'api');
	const routes = findRouteFiles(apiDir);

	if (routes.length === 0) return null;

	const imports = [
		`import { Hono } from 'hono';`,
		`import type { Env } from '@agentuity/runtime';`,
		...routes.map(
			({ importName, relativePath }) => `import ${importName} from '${relativePath}';`
		),
	].join('\n');

	const chain = routes
		.map(({ mountPath, importName }) => `\t.route('${mountPath}', ${importName})`)
		.join('\n');

	// The router MUST be built as a single chained expression so that TypeScript
	// accumulates every route's schema into `typeof router` (AppRouter).
	// Breaking the chain (e.g. separate `router.route(...)` statements) would
	// produce an empty/incomplete AppRouter and break hc<AppRouter>() on the
	// frontend.
	//
	// Frontend usage:
	//   import { hc } from 'hono/client';
	//   import type { AppRouter } from '../api';
	//   const client = hc<AppRouter>(window.location.origin + '/api');
	//   const res = await client.hello.$post({ json: { name: 'World' } });
	return (
		`${imports}\n\n` +
		`// Routes are chained in a single expression so TypeScript can accumulate\n` +
		`// every sub-router's schema into AppRouter — required for Hono RPC typing.\n` +
		`const router = new Hono<Env>()\n${chain};\n\n` +
		`// AppRouter is the fully-typed entry point for the Hono client.\n` +
		`// Import it in your frontend:  import type { AppRouter } from '../api';\n` +
		`// Then use:  hc<AppRouter>(window.location.origin + '/api')\n` +
		`export type AppRouter = typeof router;\n\n` +
		`export default router;\n`
	);
}
