import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseRoute } from '../src/cmd/build/ast';

/**
 * Unit tests for AST parsing of stream flag in validator options.
 * These tests validate edge cases and different AST representations
 * that can occur when TypeScript is transpiled to JavaScript.
 */
describe('AST Stream Flag Extraction - Edge Cases', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), 'ast-stream-test-'));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	test('stream: true as UnaryExpression !0', async () => {
		// When TypeScript transpiles true, it often becomes !0
		const code = `
import { createRouter, validator } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const OutputSchema = s.object({ data: s.string() });

const router = createRouter();
router.post('/test', validator({ output: OutputSchema, stream: true }), async (c) => {
	return new ReadableStream();
});

export default router;
`;
		const filename = join(tempDir, 'route.ts');
		writeFileSync(filename, code, 'utf-8');

		const routes = await parseRoute(tempDir, filename, 'test-project', 'test-deployment');

		expect(routes).toHaveLength(1);
		expect(routes[0].config?.stream).toBe(true);
	});

	test('stream: false as UnaryExpression !1', async () => {
		// When TypeScript transpiles false, it often becomes !1
		const code = `
import { createRouter, validator } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const OutputSchema = s.object({ data: s.string() });

const router = createRouter();
router.post('/test', validator({ output: OutputSchema, stream: false }), async (c) => {
	return c.json({ data: 'test' });
});

export default router;
`;
		const filename = join(tempDir, 'route.ts');
		writeFileSync(filename, code, 'utf-8');

		const routes = await parseRoute(tempDir, filename, 'test-project', 'test-deployment');

		expect(routes).toHaveLength(1);
		expect(routes[0].config?.stream).toBe(false);
	});

	test('stream: true as Identifier', async () => {
		// In some transpilation contexts, true might be an Identifier
		const code = `
import { createRouter, validator } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const OutputSchema = s.object({ data: s.string() });
const streamFlag = true;

const router = createRouter();
// Note: inline true in validator should still work
router.post('/test', validator({ output: OutputSchema, stream: true }), async (c) => {
	return new ReadableStream();
});

export default router;
`;
		const filename = join(tempDir, 'route.ts');
		writeFileSync(filename, code, 'utf-8');

		const routes = await parseRoute(tempDir, filename, 'test-project', 'test-deployment');

		expect(routes).toHaveLength(1);
		expect(routes[0].config?.stream).toBe(true);
	});

	test('stream: true as boolean Literal (if parser supports it)', async () => {
		// Some parsers might emit true as a Literal with boolean value
		const code = `
import { createRouter, validator } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const OutputSchema = s.object({ data: s.string() });

const router = createRouter();
router.post('/test', validator({ output: OutputSchema, stream: true }), async (c) => {
	return new ReadableStream();
});

export default router;
`;
		const filename = join(tempDir, 'route.ts');
		writeFileSync(filename, code, 'utf-8');

		const routes = await parseRoute(tempDir, filename, 'test-project', 'test-deployment');

		expect(routes).toHaveLength(1);
		// Should handle whatever format the parser emits
		expect(routes[0].config?.stream).toBe(true);
	});

	test('negated boolean: stream: !false should be true', async () => {
		const code = `
import { createRouter, validator } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const OutputSchema = s.object({ data: s.string() });

const router = createRouter();
router.post('/test', validator({ output: OutputSchema, stream: !false }), async (c) => {
	return new ReadableStream();
});

export default router;
`;
		const filename = join(tempDir, 'route.ts');
		writeFileSync(filename, code, 'utf-8');

		const routes = await parseRoute(tempDir, filename, 'test-project', 'test-deployment');

		expect(routes).toHaveLength(1);
		expect(routes[0].config?.stream).toBe(true);
	});

	test('negated boolean: stream: !true should be false', async () => {
		const code = `
import { createRouter, validator } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const OutputSchema = s.object({ data: s.string() });

const router = createRouter();
router.post('/test', validator({ output: OutputSchema, stream: !true }), async (c) => {
	return c.json({ data: 'test' });
});

export default router;
`;
		const filename = join(tempDir, 'route.ts');
		writeFileSync(filename, code, 'utf-8');

		const routes = await parseRoute(tempDir, filename, 'test-project', 'test-deployment');

		expect(routes).toHaveLength(1);
		expect(routes[0].config?.stream).toBe(false);
	});

	test('stream with input and output schemas', async () => {
		const code = `
import { createRouter, validator } from '@agentuity/runtime';
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
		return new ReadableStream();
	}
);

export default router;
`;
		const filename = join(tempDir, 'route.ts');
		writeFileSync(filename, code, 'utf-8');

		const routes = await parseRoute(tempDir, filename, 'test-project', 'test-deployment');

		expect(routes).toHaveLength(1);
		expect(routes[0].config?.hasValidator).toBe(true);
		expect(routes[0].config?.inputSchemaVariable).toBe('InputSchema');
		expect(routes[0].config?.outputSchemaVariable).toBe('OutputSchema');
		expect(routes[0].config?.stream).toBe(true);
	});

	test('stream with only input schema', async () => {
		const code = `
import { createRouter, validator } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const InputSchema = s.object({ data: s.string() });

const router = createRouter();
router.post('/process',
	validator({
		input: InputSchema,
		stream: true
	}),
	async (c) => {
		return new ReadableStream();
	}
);

export default router;
`;
		const filename = join(tempDir, 'route.ts');
		writeFileSync(filename, code, 'utf-8');

		const routes = await parseRoute(tempDir, filename, 'test-project', 'test-deployment');

		expect(routes).toHaveLength(1);
		expect(routes[0].config?.inputSchemaVariable).toBe('InputSchema');
		expect(routes[0].config?.outputSchemaVariable).toBeUndefined();
		expect(routes[0].config?.stream).toBe(true);
	});

	test('stream with only output schema', async () => {
		const code = `
import { createRouter, validator } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const OutputSchema = s.object({ events: s.array(s.string()) });

const router = createRouter();
router.get('/events',
	validator({
		output: OutputSchema,
		stream: true
	}),
	async (c) => {
		return new ReadableStream();
	}
);

export default router;
`;
		const filename = join(tempDir, 'route.ts');
		writeFileSync(filename, code, 'utf-8');

		const routes = await parseRoute(tempDir, filename, 'test-project', 'test-deployment');

		expect(routes).toHaveLength(1);
		expect(routes[0].config?.inputSchemaVariable).toBeUndefined();
		expect(routes[0].config?.outputSchemaVariable).toBe('OutputSchema');
		expect(routes[0].config?.stream).toBe(true);
	});

	test('different HTTP methods with stream flag', async () => {
		const code = `
import { createRouter, validator } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const Schema = s.object({ value: s.string() });

const router = createRouter();

router.get('/get-stream', validator({ output: Schema, stream: true }), async (c) => new ReadableStream());
router.post('/post-stream', validator({ input: Schema, output: Schema, stream: true }), async (c) => new ReadableStream());
router.put('/put-stream', validator({ input: Schema, stream: true }), async (c) => new ReadableStream());
router.patch('/patch-stream', validator({ output: Schema, stream: true }), async (c) => new ReadableStream());
router.delete('/delete-stream', validator({ stream: true }), async (c) => new ReadableStream());

export default router;
`;
		const filename = join(tempDir, 'route.ts');
		writeFileSync(filename, code, 'utf-8');

		const routes = await parseRoute(tempDir, filename, 'test-project', 'test-deployment');

		expect(routes).toHaveLength(5);
		routes.forEach((route) => {
			expect(route.config?.stream).toBe(true);
		});
	});

	test('mixed streaming and non-streaming routes', async () => {
		const code = `
import { createRouter, validator } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const Schema = s.object({ value: s.string() });

const router = createRouter();

router.post('/stream1', validator({ output: Schema, stream: true }), async (c) => new ReadableStream());
router.post('/normal1', validator({ output: Schema }), async (c) => c.json({ value: 'test' }));
router.post('/stream2', validator({ output: Schema, stream: true }), async (c) => new ReadableStream());
router.post('/normal2', validator({ output: Schema, stream: false }), async (c) => c.json({ value: 'test' }));

export default router;
`;
		const filename = join(tempDir, 'route.ts');
		writeFileSync(filename, code, 'utf-8');

		const routes = await parseRoute(tempDir, filename, 'test-project', 'test-deployment');

		expect(routes).toHaveLength(4);

		const stream1 = routes.find((r) => r.path === '/api/stream1');
		expect(stream1?.config?.stream).toBe(true);

		const normal1 = routes.find((r) => r.path === '/api/normal1');
		expect(normal1?.config?.stream).toBeUndefined();

		const stream2 = routes.find((r) => r.path === '/api/stream2');
		expect(stream2?.config?.stream).toBe(true);

		const normal2 = routes.find((r) => r.path === '/api/normal2');
		expect(normal2?.config?.stream).toBe(false);
	});

	test('agent.validator() should not extract stream from validator options', async () => {
		// Stream flag should come from agent definition, not validator({ stream: ... })
		const code = `
import { createRouter, createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const myAgent = createAgent({
	schema: {
		input: s.object({ query: s.string() }),
		output: s.object({ result: s.string() }),
		stream: true // ← This is where stream comes from
	},
	handler: async (ctx, input) => new ReadableStream()
});

const router = createRouter();

// Even if we pass stream to validator options, it should be ignored for agent.validator()
router.post('/test', myAgent.validator(), async (c) => {
	return await myAgent.run(c.req.valid('json'));
});

export default router;
`;
		const filename = join(tempDir, 'route.ts');
		writeFileSync(filename, code, 'utf-8');

		const routes = await parseRoute(tempDir, filename, 'test-project', 'test-deployment');

		expect(routes).toHaveLength(1);
		expect(routes[0].config?.hasValidator).toBe(true);
		expect(routes[0].config?.agentVariable).toBe('myAgent');
		// Stream flag should not be extracted from validator options for agent.validator()
		// It will be inferred from agent type during registry generation
		expect(routes[0].config?.stream).toBeUndefined();
	});

	test('agent.validator({ output: Schema, stream: true }) should extract stream override', async () => {
		// Even though agent has stream, explicit validator option should be extracted
		const code = `
import { createRouter, createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const CustomSchema = s.object({ custom: s.string() });

const myAgent = createAgent({
	schema: {
		input: s.object({ query: s.string() }),
		output: s.object({ result: s.string() }),
		stream: false
	},
	handler: async (ctx, input) => ({ result: 'ok' })
});

const router = createRouter();

router.post('/test',
	myAgent.validator({ output: CustomSchema, stream: true }),
	async (c) => {
		// Override agent behavior - return stream instead
		return new ReadableStream();
	}
);

export default router;
`;
		const filename = join(tempDir, 'route.ts');
		writeFileSync(filename, code, 'utf-8');

		const routes = await parseRoute(tempDir, filename, 'test-project', 'test-deployment');

		expect(routes).toHaveLength(1);
		expect(routes[0].config?.agentVariable).toBe('myAgent');
		expect(routes[0].config?.outputSchemaVariable).toBe('CustomSchema');
		expect(routes[0].config?.stream).toBe(true);
	});

	test('property key as Literal (quoted) should be handled', async () => {
		// Some transpilers might emit { "stream": true } with quoted keys
		const code = `
import { createRouter, validator } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const OutputSchema = s.object({ data: s.string() });

const router = createRouter();
router.post('/test', validator({ "output": OutputSchema, "stream": true }), async (c) => {
	return new ReadableStream();
});

export default router;
`;
		const filename = join(tempDir, 'route.ts');
		writeFileSync(filename, code, 'utf-8');

		const routes = await parseRoute(tempDir, filename, 'test-project', 'test-deployment');

		expect(routes).toHaveLength(1);
		expect(routes[0].config?.outputSchemaVariable).toBe('OutputSchema');
		expect(routes[0].config?.stream).toBe(true);
	});

	test('multiple validators with different stream values in same file', async () => {
		const code = `
import { createRouter, validator } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const Schema = s.object({ data: s.string() });

const router = createRouter();

router.post('/v1', validator({ output: Schema, stream: true }), async (c) => new ReadableStream());
router.post('/v2', validator({ output: Schema, stream: false }), async (c) => c.json({ data: 'ok' }));
router.post('/v3', validator({ output: Schema, stream: true }), async (c) => new ReadableStream());
router.post('/v4', validator({ output: Schema }), async (c) => c.json({ data: 'ok' }));
router.post('/v5', validator({ output: Schema, stream: false }), async (c) => c.json({ data: 'ok' }));

export default router;
`;
		const filename = join(tempDir, 'route.ts');
		writeFileSync(filename, code, 'utf-8');

		const routes = await parseRoute(tempDir, filename, 'test-project', 'test-deployment');

		expect(routes).toHaveLength(5);

		expect(routes.find((r) => r.path === '/api/v1')?.config?.stream).toBe(true);
		expect(routes.find((r) => r.path === '/api/v2')?.config?.stream).toBe(false);
		expect(routes.find((r) => r.path === '/api/v3')?.config?.stream).toBe(true);
		expect(routes.find((r) => r.path === '/api/v4')?.config?.stream).toBeUndefined();
		expect(routes.find((r) => r.path === '/api/v5')?.config?.stream).toBe(false);
	});

	test('stream flag with inline schemas (no variables)', async () => {
		const code = `
import { createRouter, validator } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const router = createRouter();

router.post('/inline-stream',
	validator({
		input: s.object({ q: s.string() }),
		output: s.object({ result: s.string() }),
		stream: true
	}),
	async (c) => {
		return new ReadableStream();
	}
);

export default router;
`;
		const filename = join(tempDir, 'route.ts');
		writeFileSync(filename, code, 'utf-8');

		const routes = await parseRoute(tempDir, filename, 'test-project', 'test-deployment');

		expect(routes).toHaveLength(1);
		// Inline schemas won't have variable names
		expect(routes[0].config?.inputSchemaVariable).toBeUndefined();
		expect(routes[0].config?.outputSchemaVariable).toBeUndefined();
		// But stream flag should still be extracted
		expect(routes[0].config?.stream).toBe(true);
	});

	test('multiple middleware with validator containing stream', async () => {
		const code = `
import { createRouter, validator } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const OutputSchema = s.object({ data: s.string() });
const authMiddleware = async (c, next) => {
	c.set('user', 'test');
	await next();
};

const router = createRouter();

router.post('/protected',
	authMiddleware,
	validator({ output: OutputSchema, stream: true }),
	async (c) => {
		return new ReadableStream();
	}
);

export default router;
`;
		const filename = join(tempDir, 'route.ts');
		writeFileSync(filename, code, 'utf-8');

		const routes = await parseRoute(tempDir, filename, 'test-project', 'test-deployment');

		expect(routes).toHaveLength(1);
		expect(routes[0].config?.hasValidator).toBe(true);
		expect(routes[0].config?.stream).toBe(true);
	});

	test('validator after other middleware still extracts stream', async () => {
		const code = `
import { createRouter, validator } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const OutputSchema = s.object({ data: s.string() });

const router = createRouter();

router.post('/test',
	async (c, next) => { await next(); },
	async (c, next) => { await next(); },
	validator({ output: OutputSchema, stream: true }),
	async (c) => {
		return new ReadableStream();
	}
);

export default router;
`;
		const filename = join(tempDir, 'route.ts');
		writeFileSync(filename, code, 'utf-8');

		const routes = await parseRoute(tempDir, filename, 'test-project', 'test-deployment');

		expect(routes).toHaveLength(1);
		expect(routes[0].config?.stream).toBe(true);
	});

	test('validator with complex schema expressions and stream', async () => {
		const code = `
import { createRouter, validator } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const BaseSchema = s.object({ id: s.string() });
const ExtendedSchema = s.object({ id: s.string(), data: s.string() });

const router = createRouter();

router.post('/complex',
	validator({
		input: BaseSchema,
		output: ExtendedSchema,
		stream: true
	}),
	async (c) => {
		return new ReadableStream();
	}
);

export default router;
`;
		const filename = join(tempDir, 'route.ts');
		writeFileSync(filename, code, 'utf-8');

		const routes = await parseRoute(tempDir, filename, 'test-project', 'test-deployment');

		expect(routes).toHaveLength(1);
		expect(routes[0].config?.inputSchemaVariable).toBe('BaseSchema');
		expect(routes[0].config?.outputSchemaVariable).toBe('ExtendedSchema');
		expect(routes[0].config?.stream).toBe(true);
	});
});
