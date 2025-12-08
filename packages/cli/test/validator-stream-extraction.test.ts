import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseRoute } from '../src/cmd/build/ast';

describe('Validator Stream Flag Extraction', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), 'validator-stream-test-'));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	test('validator({ stream: true }) - should extract stream flag', async () => {
		const code = `
import { createRouter } from '@agentuity/runtime';
import { validator } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const InputSchema = s.object({ query: s.string() });
const OutputSchema = s.object({ result: s.string() });

const router = createRouter();

router.post('/search',
	validator({
		input: InputSchema,
		output: OutputSchema,
		stream: true
	}),
	async (c) => {
		const data = c.req.valid('json');
		return new ReadableStream({ /* ... */ });
	}
);

export default router;
`;
		const filename = join(tempDir, 'route.ts');
		writeFileSync(filename, code, 'utf-8');

		const routes = await parseRoute(tempDir, filename, 'test-project', 'test-deployment');

		expect(routes).toHaveLength(1);
		expect(routes[0].method).toBe('post');
		expect(routes[0].path).toBe('/api/search');
		expect(routes[0].config?.hasValidator).toBe(true);
		expect(routes[0].config?.stream).toBe(true);
		expect(routes[0].config?.inputSchemaVariable).toBe('InputSchema');
		expect(routes[0].config?.outputSchemaVariable).toBe('OutputSchema');
	});

	test('validator({ stream: false }) - should extract stream flag as false', async () => {
		const code = `
import { createRouter } from '@agentuity/runtime';
import { validator } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const OutputSchema = s.object({ id: s.string() });

const router = createRouter();

router.get('/items',
	validator({
		output: OutputSchema,
		stream: false
	}),
	async (c) => {
		return c.json({ id: '123' });
	}
);

export default router;
`;
		const filename = join(tempDir, 'route.ts');
		writeFileSync(filename, code, 'utf-8');

		const routes = await parseRoute(tempDir, filename, 'test-project', 'test-deployment');

		expect(routes).toHaveLength(1);
		expect(routes[0].config?.hasValidator).toBe(true);
		expect(routes[0].config?.stream).toBe(false);
	});

	test('validator without stream flag - should not set stream property', async () => {
		const code = `
import { createRouter } from '@agentuity/runtime';
import { validator } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const OutputSchema = s.object({ data: s.string() });

const router = createRouter();

router.get('/data',
	validator({ output: OutputSchema }),
	async (c) => {
		return c.json({ data: 'test' });
	}
);

export default router;
`;
		const filename = join(tempDir, 'route.ts');
		writeFileSync(filename, code, 'utf-8');

		const routes = await parseRoute(tempDir, filename, 'test-project', 'test-deployment');

		expect(routes).toHaveLength(1);
		expect(routes[0].config?.hasValidator).toBe(true);
		expect(routes[0].config?.stream).toBeUndefined();
	});

	test('multiple routes with different stream flags', async () => {
		const code = `
import { createRouter } from '@agentuity/runtime';
import { validator } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const Schema = s.object({ value: s.string() });

const router = createRouter();

router.post('/stream',
	validator({ output: Schema, stream: true }),
	async (c) => new ReadableStream()
);

router.post('/normal',
	validator({ output: Schema }),
	async (c) => c.json({ value: 'test' })
);

router.put('/stream-put',
	validator({ input: Schema, output: Schema, stream: true }),
	async (c) => new ReadableStream()
);

export default router;
`;
		const filename = join(tempDir, 'route.ts');
		writeFileSync(filename, code, 'utf-8');

		const routes = await parseRoute(tempDir, filename, 'test-project', 'test-deployment');

		expect(routes).toHaveLength(3);

		const streamRoute = routes.find((r) => r.path === '/api/stream');
		expect(streamRoute?.config?.stream).toBe(true);

		const normalRoute = routes.find((r) => r.path === '/api/normal');
		expect(normalRoute?.config?.stream).toBeUndefined();

		const streamPutRoute = routes.find((r) => r.path === '/api/stream-put');
		expect(streamPutRoute?.config?.stream).toBe(true);
	});

	test('agent.validator() should not have stream from validator options', async () => {
		const code = `
import { createRouter } from '@agentuity/runtime';
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const streamAgent = createAgent({
	schema: {
		input: s.object({ query: s.string() }),
		output: s.object({ result: s.string() }),
		stream: true
	},
	handler: async (ctx, input) => new ReadableStream()
});

const router = createRouter();

router.post('/agent-stream', streamAgent.validator(), async (c) => {
	const data = c.req.valid('json');
	return await streamAgent.run(data);
});

export default router;
`;
		const filename = join(tempDir, 'route.ts');
		writeFileSync(filename, code, 'utf-8');

		const routes = await parseRoute(tempDir, filename, 'test-project', 'test-deployment');

		expect(routes).toHaveLength(1);
		expect(routes[0].config?.hasValidator).toBe(true);
		expect(routes[0].config?.agentVariable).toBe('streamAgent');
		// Stream flag comes from agent, not validator options
		expect(routes[0].config?.stream).toBeUndefined();
	});
});
