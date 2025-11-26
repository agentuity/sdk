import { describe, test, expect } from 'bun:test';
import { parseRoute } from './ast';
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
