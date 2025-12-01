import { describe, test, expect } from 'bun:test';
import { parseRoute, parseAgentMetadata } from './ast';
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

describe('parseAgentMetadata - Schema Code Extraction', () => {
	const setup = () => {
		rmSync(TEST_DIR, { recursive: true, force: true });
		mkdirSync(TEST_DIR, { recursive: true });
	};

	const cleanup = () => {
		rmSync(TEST_DIR, { recursive: true, force: true });
	};

	test('should extract input and output schema code', async () => {
		setup();
		const agentFile = join(TEST_DIR, 'agent.ts');
		const code = `
import { createAgent } from '@agentuity/runtime';
import { z } from 'zod';

const agent = createAgent({
	metadata: {
		name: 'test-agent',
		description: 'Test agent',
	},
	schema: {
		input: z.object({
			name: z.string(),
			age: z.number(),
		}),
		output: z.object({
			result: z.string(),
		}),
	},
	handler: async (ctx, input) => {
		return { result: 'success' };
	},
});

export default agent;
		`;
		writeFileSync(agentFile, code);

		const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'bun' });
		const contents = transpiler.transformSync(code);
		const [, metadata] = await parseAgentMetadata(
			TEST_DIR,
			agentFile,
			contents,
			'proj_1',
			'dep_1'
		);

		expect(metadata.has('inputSchemaCode')).toBe(true);
		expect(metadata.has('outputSchemaCode')).toBe(true);

		const inputSchemaCode = metadata.get('inputSchemaCode');
		const outputSchemaCode = metadata.get('outputSchemaCode');

		expect(inputSchemaCode).toContain('z.object');
		expect(inputSchemaCode).toContain('name');
		expect(inputSchemaCode).toContain('age');

		expect(outputSchemaCode).toContain('z.object');
		expect(outputSchemaCode).toContain('result');

		cleanup();
	});

	test('should extract only input schema code when output is missing', async () => {
		setup();
		const agentFile = join(TEST_DIR, 'agent.ts');
		const code = `
import { createAgent } from '@agentuity/runtime';
import { z } from 'zod';

const agent = createAgent({
	metadata: {
		name: 'test-agent',
	},
	schema: {
		input: z.string(),
	},
	handler: async (ctx, input) => {
		return 'success';
	},
});

export default agent;
		`;
		writeFileSync(agentFile, code);

		const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'bun' });
		const contents = transpiler.transformSync(code);
		const [, metadata] = await parseAgentMetadata(
			TEST_DIR,
			agentFile,
			contents,
			'proj_1',
			'dep_1'
		);

		expect(metadata.has('inputSchemaCode')).toBe(true);
		expect(metadata.has('outputSchemaCode')).toBe(false);

		const inputSchemaCode = metadata.get('inputSchemaCode');
		expect(inputSchemaCode).toContain('z.string');

		cleanup();
	});

	test('should extract only output schema code when input is missing', async () => {
		setup();
		const agentFile = join(TEST_DIR, 'agent.ts');
		const code = `
import { createAgent } from '@agentuity/runtime';
import { z } from 'zod';

const agent = createAgent({
	metadata: {
		name: 'test-agent',
	},
	schema: {
		output: z.array(z.string()),
	},
	handler: async (ctx) => {
		return ['item1', 'item2'];
	},
});

export default agent;
		`;
		writeFileSync(agentFile, code);

		const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'bun' });
		const contents = transpiler.transformSync(code);
		const [, metadata] = await parseAgentMetadata(
			TEST_DIR,
			agentFile,
			contents,
			'proj_1',
			'dep_1'
		);

		expect(metadata.has('inputSchemaCode')).toBe(false);
		expect(metadata.has('outputSchemaCode')).toBe(true);

		const outputSchemaCode = metadata.get('outputSchemaCode');
		expect(outputSchemaCode).toContain('z.array');
		expect(outputSchemaCode).toContain('z.string');

		cleanup();
	});

	test('should handle complex nested schemas', async () => {
		setup();
		const agentFile = join(TEST_DIR, 'agent.ts');
		const code = `
import { createAgent } from '@agentuity/runtime';
import { z } from 'zod';

const agent = createAgent({
	metadata: {
		name: 'test-agent',
	},
	schema: {
		input: z.object({
			user: z.object({
				name: z.string(),
				email: z.string().email(),
			}),
			tags: z.array(z.string()),
		}),
		output: z.union([
			z.object({ success: z.boolean() }),
			z.object({ error: z.string() }),
		]),
	},
	handler: async (ctx, input) => {
		return { success: true };
	},
});

export default agent;
		`;
		writeFileSync(agentFile, code);

		const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'bun' });
		const contents = transpiler.transformSync(code);
		const [, metadata] = await parseAgentMetadata(
			TEST_DIR,
			agentFile,
			contents,
			'proj_1',
			'dep_1'
		);

		expect(metadata.has('inputSchemaCode')).toBe(true);
		expect(metadata.has('outputSchemaCode')).toBe(true);

		const inputSchemaCode = metadata.get('inputSchemaCode');
		const outputSchemaCode = metadata.get('outputSchemaCode');

		expect(inputSchemaCode).toContain('z.object');
		expect(inputSchemaCode).toContain('user');
		expect(inputSchemaCode).toContain('tags');

		expect(outputSchemaCode).toContain('z.union');

		cleanup();
	});

	test('should handle agent without schema property', async () => {
		setup();
		const agentFile = join(TEST_DIR, 'agent.ts');
		const code = `
import { createAgent } from '@agentuity/runtime';

const agent = createAgent({
	metadata: {
		name: 'test-agent',
	},
	handler: async (ctx) => {
		return 'success';
	},
});

export default agent;
		`;
		writeFileSync(agentFile, code);

		const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'bun' });
		const contents = transpiler.transformSync(code);
		const [, metadata] = await parseAgentMetadata(
			TEST_DIR,
			agentFile,
			contents,
			'proj_1',
			'dep_1'
		);

		expect(metadata.has('inputSchemaCode')).toBe(false);
		expect(metadata.has('outputSchemaCode')).toBe(false);

		cleanup();
	});
});
