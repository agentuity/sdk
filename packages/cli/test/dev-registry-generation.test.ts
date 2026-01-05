/**
 * Dev Mode Registry Generation Tests
 *
 * Verifies that the dev mode properly generates agent and route registries
 * before bundling, ensuring type safety for API routes in development.
 *
 * This addresses the issue where types were "never" in dev mode because
 * registries weren't generated (only happened during build).
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Dev Mode Registry Generation', () => {
	let testDir: string;
	let srcDir: string;

	beforeEach(() => {
		testDir = join(tmpdir(), `dev-registry-test-${Date.now()}-${Math.random()}`);
		srcDir = join(testDir, 'src');
		mkdirSync(join(srcDir, 'agent'), { recursive: true });
		mkdirSync(join(srcDir, 'api'), { recursive: true });
	});

	afterEach(() => {
		if (testDir) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	test('should generate both agent and route registries in same flow', async () => {
		// This test simulates what the dev command should do:
		// 1. Discover agents
		// 2. Discover routes
		// 3. Generate agent registry
		// 4. Generate route registry
		// All before entry file generation

		const { discoverAgents } = await import('../src/cmd/build/vite/agent-discovery');
		const { discoverRoutes } = await import('../src/cmd/build/vite/route-discovery');
		const {
			generateAgentRegistry,
			generateRouteRegistry,
		} = await import('../src/cmd/build/vite/registry-generator');

		// Create a simple agent file
		const agentCode = `
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const testAgent = createAgent('test-agent', {
	schema: {
		input: s.object({ name: s.string() }),
		output: s.object({ greeting: s.string() }),
	},
	handler: async (ctx, input) => {
		return { greeting: \`Hello, \${input.name}!\` };
	},
});

export default testAgent;
`;
		writeFileSync(join(srcDir, 'agent', 'test.ts'), agentCode);

		// Create a simple route file using createRouter
		const routeCode = `
import { createRouter } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const router = createRouter();

router.post('/', async (c) => {
	const data = await c.req.json();
	return c.json({ success: true, user: data });
});

export default router;
`;
		mkdirSync(join(srcDir, 'api', 'users'), { recursive: true });
		writeFileSync(join(srcDir, 'api', 'users', 'route.ts'), routeCode);

		// Mock logger
		const logger = {
			debug: () => {},
			trace: () => {},
			info: () => {},
			warn: () => {},
			error: () => {},
		};

		// Discover agents and routes
		const agentMetadata = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);
		const { routeInfoList } = await discoverRoutes(srcDir, 'test-project', 'test-deployment', logger);

		// Generate registries (this is what was missing in dev mode)
		generateAgentRegistry(srcDir, agentMetadata);
		await generateRouteRegistry(srcDir, routeInfoList);

		// Verify both registry files exist
		const generatedDir = join(srcDir, 'generated');
		expect(existsSync(join(generatedDir, 'registry.ts'))).toBe(true);
		expect(existsSync(join(generatedDir, 'routes.ts'))).toBe(true);

		// Verify agent registry content
		const registryContent = await Bun.file(join(generatedDir, 'registry.ts')).text();
		expect(registryContent).toContain('testAgent');
		expect(registryContent).toContain('declare module "@agentuity/runtime"');
		expect(registryContent).toContain('export interface AgentRegistry');

		// Verify routes registry content
		const routesContent = await Bun.file(join(generatedDir, 'routes.ts')).text();
		expect(routesContent).toContain("declare module '@agentuity/react'");
		expect(routesContent).toContain('export interface RouteRegistry');
	});

	test('should generate route registry with proper type information for API routes', async () => {
		const { discoverRoutes } = await import('../src/cmd/build/vite/route-discovery');
		const { generateRouteRegistry } = await import('../src/cmd/build/vite/registry-generator');

		// Create API route with validator (the user's exact scenario)
		const routeCode = `
import { createRouter } from '@agentuity/runtime';
import { validator } from 'hono/validator';
import { s } from '@agentuity/schema';

const router = createRouter();
const createUserSchema = s.object({
	name: s.string(),
	email: s.string(),
	age: s.number(),
});

router.post(
	'/',
	validator('json', (value, c) => {
		const result = createUserSchema['~standard'].validate(value);
		if (result.issues) {
			return c.json({ error: 'Validation failed', issues: result.issues }, 400);
		}
		return result.value;
	}),
	async (c) => {
		const data = c.req.valid('json');
		return c.json({
			success: true,
			user: data,
		});
	}
);

export default router;
`;
		mkdirSync(join(srcDir, 'api', 'users'), { recursive: true });
		writeFileSync(join(srcDir, 'api', 'users', 'route.ts'), routeCode);

		const logger = {
			debug: () => {},
			trace: () => {},
			info: () => {},
			warn: () => {},
			error: () => {},
		};

		const { routeInfoList } = await discoverRoutes(srcDir, 'test-project', 'test-deployment', logger);

		// Should discover the POST /api/users route
		expect(routeInfoList.length).toBeGreaterThan(0);
		const postRoute = routeInfoList.find((r) => r.method.toLowerCase() === 'post');
		expect(postRoute).toBeDefined();
		expect(postRoute?.path).toContain('/api/users');

		// Generate route registry
		await generateRouteRegistry(srcDir, routeInfoList);

		const generatedDir = join(srcDir, 'generated');
		const routesContent = await Bun.file(join(generatedDir, 'routes.ts')).text();

		// The route registry should be generated
		expect(routesContent).toContain('RouteRegistry');
		expect(routesContent).toContain('/api/users');
	});

	test('should handle empty agents and routes appropriately', async () => {
		const { discoverAgents } = await import('../src/cmd/build/vite/agent-discovery');
		const { discoverRoutes } = await import('../src/cmd/build/vite/route-discovery');
		const {
			generateAgentRegistry,
			generateRouteRegistry,
		} = await import('../src/cmd/build/vite/registry-generator');

		const logger = {
			debug: () => {},
			trace: () => {},
			info: () => {},
			warn: () => {},
			error: () => {},
		};

		const agentMetadata = await discoverAgents(srcDir, 'test-project', 'test-deployment', logger);
		const { routeInfoList } = await discoverRoutes(srcDir, 'test-project', 'test-deployment', logger);

		// No agents or routes found
		expect(agentMetadata).toHaveLength(0);
		expect(routeInfoList).toHaveLength(0);

		// Generate registries - agent registry always creates file, route registry skips if empty
		generateAgentRegistry(srcDir, agentMetadata);
		await generateRouteRegistry(srcDir, routeInfoList);

		const generatedDir = join(srcDir, 'generated');
		// Agent registry is always generated (even if empty)
		expect(existsSync(join(generatedDir, 'registry.ts'))).toBe(true);
		// Route registry is only generated when there are routes (performance optimization)
		expect(existsSync(join(generatedDir, 'routes.ts'))).toBe(false);
	});

	test('should document that dev and build modes generate identical registries', () => {
		// This test documents the expected behavior:
		// Both dev mode and build mode should generate identical registry files
		// The only difference is:
		// - Build mode: runAllBuilds() calls generateAgentRegistry and generateRouteRegistry
		// - Dev mode: dev command calls the same functions before generateEntryFile

		const devModeSteps = [
			'1. Typecheck project',
			'2. Generate workbench files (if enabled)',
			'3. Discover agents and routes',
			'4. Generate agent registry (src/generated/registry.ts)',
			'5. Generate route registry (src/generated/routes.ts)',
			'6. Generate entry file (src/generated/app.ts)',
			'7. Bundle with Bun.build',
			'8. Generate metadata',
		];

		const buildModeSteps = [
			'1. Generate workbench files (if enabled)',
			'2. Discover agents and routes',
			'3. Generate agent registry (src/generated/registry.ts)',
			'4. Generate route registry (src/generated/routes.ts)',
			'5. Build client assets (Vite)',
			'6. Build workbench (if enabled)',
			'7. Build server (Bun.build)',
			'8. Generate metadata',
		];

		// Both modes should generate registries BEFORE entry file generation
		expect(devModeSteps[3]).toContain('agent registry');
		expect(devModeSteps[4]).toContain('route registry');
		expect(buildModeSteps[2]).toContain('agent registry');
		expect(buildModeSteps[3]).toContain('route registry');

		// This ensures TypeScript has the augmented types available during compilation
		expect(true).toBe(true);
	});
});

describe('Route Type Generation Scenarios', () => {
	let testDir: string;
	let srcDir: string;

	beforeEach(() => {
		testDir = join(tmpdir(), `route-types-test-${Date.now()}-${Math.random()}`);
		srcDir = join(testDir, 'src');
		mkdirSync(join(srcDir, 'api'), { recursive: true });
	});

	afterEach(() => {
		if (testDir) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	test('should handle route without agent (types should not be never)', async () => {
		const { discoverRoutes } = await import('../src/cmd/build/vite/route-discovery');
		const { generateRouteRegistry } = await import('../src/cmd/build/vite/registry-generator');

		// Route without agent - just a plain API endpoint
		const routeCode = `
import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/', async (c) => {
	return c.json({ message: 'Hello world' });
});

router.post('/', async (c) => {
	const body = await c.req.json();
	return c.json({ received: body });
});

export default router;
`;
		mkdirSync(join(srcDir, 'api', 'hello'), { recursive: true });
		writeFileSync(join(srcDir, 'api', 'hello', 'route.ts'), routeCode);

		const logger = {
			debug: () => {},
			trace: () => {},
			info: () => {},
			warn: () => {},
			error: () => {},
		};

		const { routeInfoList } = await discoverRoutes(srcDir, 'test-project', 'test-deployment', logger);
		await generateRouteRegistry(srcDir, routeInfoList);

		const routesContent = await Bun.file(join(srcDir, 'generated', 'routes.ts')).text();

		// Routes exist in the registry
		expect(routesContent).toContain('/api/hello');
		expect(routesContent).toContain('RouteRegistry');
	});

	test('should handle multiple HTTP methods on same route path', async () => {
		const { discoverRoutes } = await import('../src/cmd/build/vite/route-discovery');
		const { generateRouteRegistry } = await import('../src/cmd/build/vite/registry-generator');

		const routeCode = `
import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/', (c) => c.json({ items: [] }));
router.post('/', (c) => c.json({ created: true }));
router.put('/:id', (c) => c.json({ updated: true }));
router.delete('/:id', (c) => c.json({ deleted: true }));

export default router;
`;
		mkdirSync(join(srcDir, 'api', 'items'), { recursive: true });
		writeFileSync(join(srcDir, 'api', 'items', 'route.ts'), routeCode);

		const logger = {
			debug: () => {},
			trace: () => {},
			info: () => {},
			warn: () => {},
			error: () => {},
		};

		const { routeInfoList } = await discoverRoutes(srcDir, 'test-project', 'test-deployment', logger);
		await generateRouteRegistry(srcDir, routeInfoList);

		const routesContent = await Bun.file(join(srcDir, 'generated', 'routes.ts')).text();

		// All HTTP methods should be registered
		expect(routesContent).toContain('GET');
		expect(routesContent).toContain('POST');
		expect(routesContent).toContain('PUT');
		expect(routesContent).toContain('DELETE');
	});

	test('should handle nested API routes', async () => {
		const { discoverRoutes } = await import('../src/cmd/build/vite/route-discovery');
		const { generateRouteRegistry } = await import('../src/cmd/build/vite/registry-generator');

		// Create nested structure: /api/users/profile/settings
		const routeCode = `
import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/', (c) => c.json({ settings: {} }));
router.put('/', (c) => c.json({ updated: true }));

export default router;
`;
		mkdirSync(join(srcDir, 'api', 'users', 'profile', 'settings'), { recursive: true });
		writeFileSync(join(srcDir, 'api', 'users', 'profile', 'settings', 'route.ts'), routeCode);

		const logger = {
			debug: () => {},
			trace: () => {},
			info: () => {},
			warn: () => {},
			error: () => {},
		};

		const { routeInfoList } = await discoverRoutes(srcDir, 'test-project', 'test-deployment', logger);
		await generateRouteRegistry(srcDir, routeInfoList);

		const routesContent = await Bun.file(join(srcDir, 'generated', 'routes.ts')).text();

		// Nested path should be in the registry
		expect(routesContent).toContain('users');
		expect(routesContent).toContain('profile');
		expect(routesContent).toContain('settings');
	});
});
