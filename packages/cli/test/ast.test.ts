import { describe, test, expect } from 'bun:test';
import { parseRoute } from '../src/cmd/build/ast';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DIR = '/tmp/agentuity-cli-test-routes';
const API_DIR = join(TEST_DIR, 'src', 'api');

describe('parseRoute - Crash Prevention Scenarios', () => {
	const setup = () => {
		rmSync(TEST_DIR, { recursive: true, force: true });
		mkdirSync(API_DIR, { recursive: true });
	};

	const cleanup = () => {
		rmSync(TEST_DIR, { recursive: true, force: true });
	};

	test('should handle files with interface definitions', async () => {
		setup();
		const routeFile = join(API_DIR, 'route.ts');
		const code = `
import { createRouter } from '@agentuity/runtime';
const router = createRouter();

interface SomeInterface {
	foo: string;
	bar: string;
}

router.get('/', (c) => c.json({ status: 'ok' }));

export default router;
		`;
		writeFileSync(routeFile, code);

		const routes = await parseRoute(TEST_DIR, routeFile, 'proj_1', 'dep_1');
		expect(routes).toHaveLength(1);
		expect(routes[0].method).toBe('get');

		cleanup();
	});

	test('should handle non-call expression statements', async () => {
		setup();
		const routeFile = join(API_DIR, 'route.ts');
		const code = `
import { createRouter } from '@agentuity/runtime';
const router = createRouter();

1 + 1;
"string literal";
true;

router.get('/', (c) => c.text('ok'));

export default router;
		`;
		writeFileSync(routeFile, code);

		const routes = await parseRoute(TEST_DIR, routeFile, 'proj_1', 'dep_1');
		expect(routes).toHaveLength(1);

		cleanup();
	});

	test('should handle variable access identifiers', async () => {
		setup();
		const routeFile = join(API_DIR, 'route.ts');
		const code = `
import { createRouter } from '@agentuity/runtime';
const router = createRouter();

router; // Just accessing the variable

router.get('/', (c) => c.text('ok'));

export default router;
		`;
		writeFileSync(routeFile, code);

		const routes = await parseRoute(TEST_DIR, routeFile, 'proj_1', 'dep_1');
		expect(routes).toHaveLength(1);

		cleanup();
	});

	test('should handle direct function calls (not member expressions)', async () => {
		setup();
		const routeFile = join(API_DIR, 'route.ts');
		const code = `
import { createRouter } from '@agentuity/runtime';
const router = createRouter();

console.log("logging");
(function() { })();

router.get('/', (c) => c.text('ok'));

export default router;
		`;
		writeFileSync(routeFile, code);

		const routes = await parseRoute(TEST_DIR, routeFile, 'proj_1', 'dep_1');
		expect(routes).toHaveLength(1);

		cleanup();
	});

	test('should skip wildcard use() middleware without error', async () => {
		setup();
		const routeFile = join(API_DIR, 'route.ts');
		const code = `
import { createRouter } from '@agentuity/runtime';
import { clerkMiddleware } from '@clerk/clerk-sdk-node';

const router = createRouter();

router.use('*', clerkMiddleware());
router.get('/users', (c) => c.json({ users: [] }));
router.post('/users', (c) => c.json({ created: true }));

export default router;
		`;
		writeFileSync(routeFile, code);

		const routes = await parseRoute(TEST_DIR, routeFile, 'proj_1', 'dep_1');
		expect(routes).toHaveLength(2);
		expect(routes[0].method).toBe('get');
		expect(routes[1].method).toBe('post');

		cleanup();
	});

	test('should handle on and all methods, and skip route/use methods', async () => {
		setup();
		const routeFile = join(API_DIR, 'route.ts');
		const code = `
import { createRouter } from '@agentuity/runtime';
import { authMiddleware, loggerMiddleware } from './middleware';

const router = createRouter();
const subRouter = createRouter();

router.on('GET', '/test', (c) => c.text('test'));
router.all('/catch-all', (c) => c.text('all'));
router.route('/api', subRouter);
router.use('*', authMiddleware());
router.get('/users', (c) => c.json({ users: [] }));
router.post('/users', (c) => c.json({ created: true }));

export default router;
		`;
		writeFileSync(routeFile, code);

		const routes = await parseRoute(TEST_DIR, routeFile, 'proj_1', 'dep_1');
		// on('GET', '/test') → 1 route
		// all('/catch-all') → 5 routes (get, post, put, delete, patch)
		// route('/api', subRouter) → 0 routes (skipped)
		// use('*', authMiddleware()) → 0 routes (skipped)
		// get('/users') → 1 route
		// post('/users') → 1 route
		expect(routes).toHaveLength(8);

		// Group routes by path - file is route.ts in src/api/, so mount is /api
		const routesByPath = routes.reduce<Record<string, string[]>>((acc, r) => {
			acc[r.path] ??= [];
			acc[r.path].push(r.method);
			return acc;
		}, {});

		expect(routesByPath['/api/test']).toEqual(['get']);
		expect(routesByPath['/api/catch-all']?.sort()).toEqual([
			'delete',
			'get',
			'patch',
			'post',
			'put',
		]);
		expect(routesByPath['/api/users']?.sort()).toEqual(['get', 'post']);

		cleanup();
	});

	test('should support on() with array of methods and wildcard path', async () => {
		setup();
		const routeFile = join(API_DIR, 'route.ts');
		const code = `
import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.on(['GET', 'POST'], '/auth/*', (c) => c.text('auth'));

export default router;
		`;
		writeFileSync(routeFile, code);

		const routes = await parseRoute(TEST_DIR, routeFile, 'proj_1', 'dep_1');
		expect(routes).toHaveLength(2);

		const methods = routes.map((r) => r.method).sort();
		const paths = routes.map((r) => r.path);

		expect(methods).toEqual(['get', 'post']);
		expect(new Set(paths)).toEqual(new Set(['/api/auth/*']));

		cleanup();
	});

	test('should skip unsupported HTTP methods in on()', async () => {
		setup();
		const routeFile = join(API_DIR, 'route.ts');
		const code = `
import { createRouter } from '@agentuity/runtime';

const router = createRouter();

// HEAD and OPTIONS are not supported in BuildMetadata, should be skipped
router.on(['GET', 'HEAD', 'OPTIONS'], '/health', (c) => c.text('ok'));

export default router;
		`;
		writeFileSync(routeFile, code);

		const routes = await parseRoute(TEST_DIR, routeFile, 'proj_1', 'dep_1');
		// Only GET should be captured, HEAD and OPTIONS are skipped
		expect(routes).toHaveLength(1);
		expect(routes[0].method).toBe('get');
		expect(routes[0].path).toBe('/api/health');

		cleanup();
	});

	test('should handle mixed complex scenarios', async () => {
		setup();
		const routeFile = join(API_DIR, 'route.ts');
		const code = `
import { createRouter } from '@agentuity/runtime';

// Variable declarations
const router = createRouter();
const someVar = "test";

// Interface
interface User {
	id: string;
}

// Function declaration
function helper() {
	return true;
}

// Direct call
helper();

// Non-route member expression
console.log(someVar);

// Valid route
router.post('/users', (c) => c.json({ id: '1' }));

// Another expression type
if (true) {
	console.log("block");
}

export default router;
		`;
		writeFileSync(routeFile, code);

		const routes = await parseRoute(TEST_DIR, routeFile, 'proj_1', 'dep_1');
		expect(routes).toHaveLength(1);
		expect(routes[0].method).toBe('post');

		cleanup();
	});
	test('should reject invalid router method', async () => {
		setup();
		const routeFile = join(API_DIR, 'route.ts');
		const code = `
import { createRouter } from '@agentuity/runtime';

// Variable declarations
const router = createRouter();

// Invalid route with unknown method
router.foo('/users', (c) => c.json({ id: '1' }));

export default router;
		`;
		writeFileSync(routeFile, code);

		await expect(parseRoute(TEST_DIR, routeFile, 'proj_1', 'dep_1')).rejects.toThrow();

		cleanup();
	});

	test('should skip Hono lifecycle and config methods (onError, notFound, basePath, mount)', async () => {
		setup();
		const routeFile = join(API_DIR, 'route.ts');
		const code = `
import { createRouter } from '@agentuity/runtime';

const router = createRouter();

// Hono lifecycle and config methods should be silently skipped
router.onError((err, c) => c.json({ error: 'Internal error' }, 500));
router.notFound((c) => c.json({ error: 'Not found' }, 404));
router.basePath('/v1');
router.mount('/external', (req) => new Response('external'));

// Regular route should still be parsed
router.get('/health', (c) => c.json({ status: 'ok' }));

export default router;
		`;
		writeFileSync(routeFile, code);

		const routes = await parseRoute(TEST_DIR, routeFile, 'proj_1', 'dep_1');
		// Only the GET /health route should be parsed, lifecycle/config methods should be skipped
		expect(routes).toHaveLength(1);
		expect(routes[0].method).toBe('get');
		expect(routes[0].path).toBe('/api/health');

		cleanup();
	});

	test('should skip basePath() when setting router base path', async () => {
		setup();
		const routeFile = join(API_DIR, 'route.ts');
		const code = `
import { createRouter } from '@agentuity/runtime';

const router = createRouter();

// basePath() is a config method, not a route
router.basePath('/api/v1');

router.get('/users', (c) => c.json({ users: [] }));

export default router;
		`;
		writeFileSync(routeFile, code);

		const routes = await parseRoute(TEST_DIR, routeFile, 'proj_1', 'dep_1');
		expect(routes).toHaveLength(1);
		expect(routes[0].path).toBe('/api/users');

		cleanup();
	});

	test('should skip mount() when mounting external applications', async () => {
		setup();
		const routeFile = join(API_DIR, 'route.ts');
		const code = `
import { createRouter } from '@agentuity/runtime';

const router = createRouter();

// mount() is for mounting external apps, not defining routes
router.mount('/external', (req) => new Response('from external app'));

router.post('/internal', (c) => c.json({ source: 'internal' }));

export default router;
		`;
		writeFileSync(routeFile, code);

		const routes = await parseRoute(TEST_DIR, routeFile, 'proj_1', 'dep_1');
		expect(routes).toHaveLength(1);
		expect(routes[0].method).toBe('post');
		expect(routes[0].path).toBe('/api/internal');

		cleanup();
	});

	test('should skip notFound() 404 handler', async () => {
		setup();
		const routeFile = join(API_DIR, 'route.ts');
		const code = `
import { createRouter } from '@agentuity/runtime';

const router = createRouter();

// notFound() is a lifecycle method for 404 handling
router.notFound((c) => c.text('Custom 404', 404));

router.get('/exists', (c) => c.text('Found'));

export default router;
		`;
		writeFileSync(routeFile, code);

		const routes = await parseRoute(TEST_DIR, routeFile, 'proj_1', 'dep_1');
		expect(routes).toHaveLength(1);
		expect(routes[0].path).toBe('/api/exists');

		cleanup();
	});
});


describe('parseRoute - SSE Output Schema Extraction', () => {
	const setup = () => {
		rmSync(TEST_DIR, { recursive: true, force: true });
		mkdirSync(API_DIR, { recursive: true });
	};

	const cleanup = () => {
		rmSync(TEST_DIR, { recursive: true, force: true });
	};

	test('should extract output schema from sse({ output: schema }, handler) pattern', async () => {
		setup();
		const routeFile = join(API_DIR, 'route.ts');
		const code = `
import { createRouter, sse } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const router = createRouter();

export const outputSchema = s.object({
	type: s.enum(['token', 'complete']),
	content: s.optional(s.string()),
});

router.get('/stream', sse({ output: outputSchema }, async (c, stream) => {
	await stream.writeSSE({ data: JSON.stringify({ type: 'token', content: 'hello' }) });
	stream.close();
}));

export default router;
		`;
		writeFileSync(routeFile, code);

		const routes = await parseRoute(TEST_DIR, routeFile, 'proj_1', 'dep_1');
		expect(routes).toHaveLength(1);
		expect(routes[0].method).toBe('get');
		expect(routes[0].type).toBe('sse');
		expect(routes[0].config?.outputSchemaVariable).toBe('outputSchema');

		cleanup();
	});

	test('should extract output schema imported from another file', async () => {
		setup();
		// Create the shared schema file
		const schemaDir = join(TEST_DIR, 'src', 'schemas');
		mkdirSync(schemaDir, { recursive: true });
		const schemaFile = join(schemaDir, 'sse-events.ts');
		writeFileSync(
			schemaFile,
			`
import { s } from '@agentuity/schema';
export const StreamEventSchema = s.object({
	type: s.string(),
	data: s.unknown(),
});
		`
		);

		const routeFile = join(API_DIR, 'route.ts');
		const code = `
import { createRouter, sse } from '@agentuity/runtime';
import { StreamEventSchema } from '../schemas/sse-events';

const router = createRouter();

router.get('/events', sse({ output: StreamEventSchema }, async (c, stream) => {
	await stream.writeSSE({ data: 'test' });
	stream.close();
}));

export default router;
		`;
		writeFileSync(routeFile, code);

		const routes = await parseRoute(TEST_DIR, routeFile, 'proj_1', 'dep_1');
		expect(routes).toHaveLength(1);
		expect(routes[0].type).toBe('sse');
		expect(routes[0].config?.outputSchemaVariable).toBe('StreamEventSchema');
		expect(routes[0].config?.outputSchemaImportPath).toBe('../schemas/sse-events');

		cleanup();
	});

	test('should handle sse without options (backward compatible)', async () => {
		setup();
		const routeFile = join(API_DIR, 'route.ts');
		const code = `
import { createRouter, sse } from '@agentuity/runtime';

const router = createRouter();

router.get('/simple', sse(async (c, stream) => {
	await stream.writeSSE({ data: 'hello' });
	stream.close();
}));

export default router;
		`;
		writeFileSync(routeFile, code);

		const routes = await parseRoute(TEST_DIR, routeFile, 'proj_1', 'dep_1');
		expect(routes).toHaveLength(1);
		expect(routes[0].type).toBe('sse');
		// No output schema expected when using simple sse(handler) pattern
		expect(routes[0].config?.outputSchemaVariable).toBeUndefined();

		cleanup();
	});

	test('should still support exported outputSchema fallback for SSE routes', async () => {
		setup();
		const routeFile = join(API_DIR, 'route.ts');
		const code = `
import { createRouter, sse } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const router = createRouter();

// Exported schema without passing to sse()
export const outputSchema = s.object({
	message: s.string(),
});

router.get('/fallback', sse(async (c, stream) => {
	await stream.writeSSE({ data: 'hello' });
	stream.close();
}));

export default router;
		`;
		writeFileSync(routeFile, code);

		const routes = await parseRoute(TEST_DIR, routeFile, 'proj_1', 'dep_1');
		expect(routes).toHaveLength(1);
		expect(routes[0].type).toBe('sse');
		// Should pick up exported outputSchema as fallback
		expect(routes[0].config?.outputSchemaVariable).toBe('outputSchema');

		cleanup();
	});

	test('should prefer sse({ output }) over exported schema', async () => {
		setup();
		const routeFile = join(API_DIR, 'route.ts');
		const code = `
import { createRouter, sse } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const router = createRouter();

export const outputSchema = s.object({ fallback: s.boolean() });
export const specificSchema = s.object({ specific: s.string() });

router.get('/prefer', sse({ output: specificSchema }, async (c, stream) => {
	await stream.writeSSE({ data: 'hello' });
	stream.close();
}));

export default router;
		`;
		writeFileSync(routeFile, code);

		const routes = await parseRoute(TEST_DIR, routeFile, 'proj_1', 'dep_1');
		expect(routes).toHaveLength(1);
		expect(routes[0].type).toBe('sse');
		// Should use specificSchema from sse(), not exported outputSchema
		expect(routes[0].config?.outputSchemaVariable).toBe('specificSchema');

		cleanup();
	});

	test('should throw error when SSE output schema is locally defined but not exported', async () => {
		setup();
		const routeFile = join(API_DIR, 'route.ts');
		const code = `
import { createRouter, sse } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const router = createRouter();

// Not exported - should fail validation
const localSchema = s.object({ local: s.boolean() });

router.get('/local', sse({ output: localSchema }, async (c, stream) => {
	await stream.writeSSE({ data: 'hello' });
	stream.close();
}));

export default router;
		`;
		writeFileSync(routeFile, code);

		// Should throw SchemaNotExportedError
		await expect(parseRoute(TEST_DIR, routeFile, 'proj_1', 'dep_1')).rejects.toThrow(
			'Schema "localSchema" used as the output validator'
		);

		cleanup();
	});
});
