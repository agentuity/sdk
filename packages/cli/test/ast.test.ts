import { describe, test, expect } from 'bun:test';
import { parseRoute, analyzeWorkbench } from '../src/cmd/build/ast';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const TEST_DIR = '/tmp/agentuity-cli-test-routes';

describe('parseRoute - Crash Prevention Scenarios', () => {
	const setup = () => {
		rmSync(TEST_DIR, { recursive: true, force: true });
		mkdirSync(TEST_DIR, { recursive: true });
	};

	const cleanup = () => {
		rmSync(TEST_DIR, { recursive: true, force: true });
	};

	test('should handle files with interface definitions', async () => {
		setup();
		const routeFile = join(TEST_DIR, 'route.ts');
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
		const routeFile = join(TEST_DIR, 'route.ts');
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
		const routeFile = join(TEST_DIR, 'route.ts');
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
		const routeFile = join(TEST_DIR, 'route.ts');
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
		const routeFile = join(TEST_DIR, 'route.ts');
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

	test('should skip on, all, and route methods without error', async () => {
		setup();
		const routeFile = join(TEST_DIR, 'route.ts');
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
		expect(routes).toHaveLength(2);
		expect(routes[0].method).toBe('get');
		expect(routes[1].method).toBe('post');

		cleanup();
	});

	test('should handle mixed complex scenarios', async () => {
		setup();
		const routeFile = join(TEST_DIR, 'route.ts');
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
		const routeFile = join(TEST_DIR, 'route.ts');
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
});

describe('analyzeWorkbench - Detection Scenarios', () => {
	test('should detect workbench when properly used in services', () => {
		const code = `
import { createApp } from '@agentuity/runtime';
import { createWorkbench } from '@agentuity/workbench';

const workbench = createWorkbench();

const { server } = await createApp({
	services: {
		workbench
	}
});
		`;
		const result = analyzeWorkbench(code);
		expect(result.hasWorkbench).toBe(true);
		expect(result.config).toEqual({ route: '/workbench' });
	});

	test('should detect workbench with custom config', () => {
		const code = `
import { createApp } from '@agentuity/runtime';
import { createWorkbench } from '@agentuity/workbench';

const workbench = createWorkbench({ route: '/admin' });

const { server } = await createApp({
	services: {
		workbench
	}
});
		`;
		const result = analyzeWorkbench(code);
		expect(result.hasWorkbench).toBe(true);
		expect(result.config).toEqual({ route: '/admin' });
	});

	test('should NOT detect workbench when called but not used in services', () => {
		const code = `
import { createApp } from '@agentuity/runtime';
import { createWorkbench } from '@agentuity/workbench';

const workbench = createWorkbench();

const { server } = await createApp({
	services: {
		// workbench commented out
	}
});
		`;
		const result = analyzeWorkbench(code);
		expect(result.hasWorkbench).toBe(false);
		expect(result.config).toBe(null);
	});

	test('should NOT detect workbench when not imported', () => {
		const code = `
import { createApp } from '@agentuity/runtime';

const { server } = await createApp({
	services: {}
});
		`;
		const result = analyzeWorkbench(code);
		expect(result.hasWorkbench).toBe(false);
		expect(result.config).toBe(null);
	});

	test('should NOT detect workbench when imported but never called', () => {
		const code = `
import { createApp } from '@agentuity/runtime';
import { createWorkbench } from '@agentuity/workbench';

const { server } = await createApp({
	services: {}
});
		`;
		const result = analyzeWorkbench(code);
		expect(result.hasWorkbench).toBe(false);
		expect(result.config).toBe(null);
	});

	test('should detect workbench with property value syntax', () => {
		const code = `
import { createApp } from '@agentuity/runtime';
import { createWorkbench } from '@agentuity/workbench';

const wb = createWorkbench();

const { server } = await createApp({
	services: {
		workbench: wb
	}
});
		`;
		const result = analyzeWorkbench(code);
		expect(result.hasWorkbench).toBe(true);
		expect(result.config).toEqual({ route: '/workbench' });
	});

	test('should detect workbench with different variable name', () => {
		const code = `
import { createApp } from '@agentuity/runtime';
import { createWorkbench } from '@agentuity/workbench';

const myWorkbench = createWorkbench({ route: '/dashboard' });

const { server } = await createApp({
	services: {
		workbench: myWorkbench
	}
});
		`;
		const result = analyzeWorkbench(code);
		expect(result.hasWorkbench).toBe(true);
		expect(result.config).toEqual({ route: '/dashboard' });
	});

	test('should NOT detect when workbench variable used elsewhere but not in services', () => {
		const code = `
import { createApp } from '@agentuity/runtime';
import { createWorkbench } from '@agentuity/workbench';

const workbench = createWorkbench();

console.log(workbench); // Used but not in services

const { server } = await createApp({
	services: {}
});
		`;
		const result = analyzeWorkbench(code);
		expect(result.hasWorkbench).toBe(false);
		expect(result.config).toBe(null);
	});

	test('should handle empty services object', () => {
		const code = `
import { createApp } from '@agentuity/runtime';
import { createWorkbench } from '@agentuity/workbench';

const workbench = createWorkbench();

const { server } = await createApp({
	setup: async () => {},
	services: {}
});
		`;
		const result = analyzeWorkbench(code);
		expect(result.hasWorkbench).toBe(false);
		expect(result.config).toBe(null);
	});

	test('should handle missing services property', () => {
		const code = `
import { createApp } from '@agentuity/runtime';
import { createWorkbench } from '@agentuity/workbench';

const workbench = createWorkbench();

const { server } = await createApp({
	setup: async () => {}
});
		`;
		const result = analyzeWorkbench(code);
		expect(result.hasWorkbench).toBe(false);
		expect(result.config).toBe(null);
	});
});
