import { describe, test, expect } from 'bun:test';
import { parseRoute } from '../src/cmd/build/ast';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Test schema extraction for different route validator patterns
 */
describe('Route Schema Extraction', () => {
	const projectId = 'test-project';
	const deploymentId = 'test-deployment';

	function createTempFile(content: string): {
		tempDir: string;
		path: string;
		cleanup: () => void;
	} {
		const tempDir = mkdtempSync(join(tmpdir(), 'route-schema-test-'));
		const filePath = join(tempDir, 'test.ts');
		writeFileSync(filePath, content, 'utf-8');
		return {
			tempDir,
			path: filePath,
			cleanup: () => rmSync(tempDir, { recursive: true, force: true }),
		};
	}

	test('agent.validator() - should extract schemas from agent', async () => {
		const content = `
import { createRouter } from '@agentuity/runtime';
import myAgent from '@agent/hello';

const router = createRouter();
router.post('/test', myAgent.validator(), async (c) => {
	return c.json({ ok: true });
});

export default router;
		`;

		const { tempDir, path, cleanup } = createTempFile(content);
		try {
			const routes = await parseRoute(tempDir, path, projectId, deploymentId);
			expect(routes).toHaveLength(1);
			expect(routes[0].config?.hasValidator).toBe(true);
			expect(routes[0].config?.agentVariable).toBe('myAgent');
			expect(routes[0].config?.agentImportPath).toBe('@agent/hello');
		} finally {
			cleanup();
		}
	});

	test('agent.validator({ input: CustomSchema }) - should detect input override', async () => {
		const content = `
import { createRouter } from '@agentuity/runtime';
import myAgent from '@agent/hello';
import { CustomInputSchema } from './schemas';

const router = createRouter();
router.post('/test', myAgent.validator({ input: CustomInputSchema }), async (c) => {
	return c.json({ ok: true });
});

export default router;
		`;

		const { tempDir, path, cleanup } = createTempFile(content);
		try {
			const routes = await parseRoute(tempDir, path, projectId, deploymentId);
			expect(routes).toHaveLength(1);
			expect(routes[0].config?.hasValidator).toBe(true);
			expect(routes[0].config?.agentVariable).toBe('myAgent');
			expect(routes[0].config?.inputSchemaVariable).toBe('CustomInputSchema');
			expect(routes[0].config?.outputSchemaVariable).toBeUndefined();
		} finally {
			cleanup();
		}
	});

	test('agent.validator({ output: CustomSchema }) - should detect output override', async () => {
		const content = `
import { createRouter } from '@agentuity/runtime';
import myAgent from '@agent/hello';
import { CustomOutputSchema } from './schemas';

const router = createRouter();
router.post('/test', myAgent.validator({ output: CustomOutputSchema }), async (c) => {
	return c.json({ ok: true });
});

export default router;
		`;

		const { tempDir, path, cleanup } = createTempFile(content);
		try {
			const routes = await parseRoute(tempDir, path, projectId, deploymentId);
			expect(routes).toHaveLength(1);
			expect(routes[0].config?.hasValidator).toBe(true);
			expect(routes[0].config?.agentVariable).toBe('myAgent');
			expect(routes[0].config?.inputSchemaVariable).toBeUndefined();
			expect(routes[0].config?.outputSchemaVariable).toBe('CustomOutputSchema');
		} finally {
			cleanup();
		}
	});

	test('agent.validator({ input, output }) - should detect both overrides', async () => {
		const content = `
import { createRouter } from '@agentuity/runtime';
import myAgent from '@agent/hello';
import { CustomInput, CustomOutput } from './schemas';

const router = createRouter();
router.post('/test', myAgent.validator({ input: CustomInput, output: CustomOutput }), async (c) => {
	return c.json({ ok: true });
});

export default router;
		`;

		const { tempDir, path, cleanup } = createTempFile(content);
		try {
			const routes = await parseRoute(tempDir, path, projectId, deploymentId);
			expect(routes).toHaveLength(1);
			expect(routes[0].config?.hasValidator).toBe(true);
			expect(routes[0].config?.agentVariable).toBe('myAgent');
			expect(routes[0].config?.inputSchemaVariable).toBe('CustomInput');
			expect(routes[0].config?.outputSchemaVariable).toBe('CustomOutput');
		} finally {
			cleanup();
		}
	});

	test('validator({ input, output }) - standalone validator without agent', async () => {
		const content = `
import { createRouter } from '@agentuity/runtime';
import { validator } from '@agentuity/runtime';
import { MyInputSchema, MyOutputSchema } from './schemas';

const router = createRouter();
router.post('/test', validator({ input: MyInputSchema, output: MyOutputSchema }), async (c) => {
	return c.json({ ok: true });
});

export default router;
		`;

		const { tempDir, path, cleanup } = createTempFile(content);
		try {
			const routes = await parseRoute(tempDir, path, projectId, deploymentId);
			expect(routes).toHaveLength(1);
			expect(routes[0].config?.hasValidator).toBe(true);
			expect(routes[0].config?.agentVariable).toBeUndefined();
			expect(routes[0].config?.inputSchemaVariable).toBe('MyInputSchema');
			expect(routes[0].config?.outputSchemaVariable).toBe('MyOutputSchema');
		} finally {
			cleanup();
		}
	});

	test('no validator - should not have validator config', async () => {
		const content = `
import { createRouter } from '@agentuity/runtime';

const router = createRouter();
router.get('/test', async (c) => {
	return c.json({ ok: true });
});

export default router;
		`;

		const { tempDir, path, cleanup } = createTempFile(content);
		try {
			const routes = await parseRoute(tempDir, path, projectId, deploymentId);
			expect(routes).toHaveLength(1);
			expect(routes[0].config?.hasValidator).toBeUndefined();
			expect(routes[0].config?.agentVariable).toBeUndefined();
		} finally {
			cleanup();
		}
	});

	test('multiple routes with different validator patterns', async () => {
		const content = `
import { createRouter } from '@agentuity/runtime';
import agent1 from '@agent/hello';
import agent2 from '@agent/goodbye';

const router = createRouter();
router.post('/hello', agent1.validator(), async (c) => c.json({ ok: true }));
router.post('/goodbye', agent2.validator({ input: CustomSchema }), async (c) => c.json({ ok: true }));
router.get('/health', async (c) => c.json({ ok: true }));

export default router;
		`;

		const { tempDir, path, cleanup } = createTempFile(content);
		try {
			const routes = await parseRoute(tempDir, path, projectId, deploymentId);
			expect(routes).toHaveLength(3);

			// First route: agent1.validator()
			expect(routes[0].config?.hasValidator).toBe(true);
			expect(routes[0].config?.agentVariable).toBe('agent1');
			expect(routes[0].config?.agentImportPath).toBe('@agent/hello');

			// Second route: agent2.validator({ input: CustomSchema })
			expect(routes[1].config?.hasValidator).toBe(true);
			expect(routes[1].config?.agentVariable).toBe('agent2');
			expect(routes[1].config?.inputSchemaVariable).toBe('CustomSchema');

			// Third route: no validator
			expect(routes[2].config?.hasValidator).toBeUndefined();
		} finally {
			cleanup();
		}
	});

	test('middleware before validator - should still detect validator', async () => {
		const content = `
import { createRouter } from '@agentuity/runtime';
import myAgent from '@agent/hello';
import { authMiddleware, loggingMiddleware } from './middleware';

const router = createRouter();
router.post('/test', authMiddleware, loggingMiddleware, myAgent.validator(), async (c) => {
	return c.json({ ok: true });
});

export default router;
		`;

		const { tempDir, path, cleanup } = createTempFile(content);
		try {
			const routes = await parseRoute(tempDir, path, projectId, deploymentId);
			expect(routes).toHaveLength(1);
			expect(routes[0].config?.hasValidator).toBe(true);
			expect(routes[0].config?.agentVariable).toBe('myAgent');
		} finally {
			cleanup();
		}
	});

	test('middleware after validator - should still detect validator', async () => {
		const content = `
import { createRouter } from '@agentuity/runtime';
import myAgent from '@agent/hello';
import { rateLimiter } from './middleware';

const router = createRouter();
router.post('/test', myAgent.validator(), rateLimiter, async (c) => {
	return c.json({ ok: true });
});

export default router;
		`;

		const { tempDir, path, cleanup } = createTempFile(content);
		try {
			const routes = await parseRoute(tempDir, path, projectId, deploymentId);
			expect(routes).toHaveLength(1);
			expect(routes[0].config?.hasValidator).toBe(true);
			expect(routes[0].config?.agentVariable).toBe('myAgent');
		} finally {
			cleanup();
		}
	});

	test('middleware before and after validator - should still detect validator', async () => {
		const content = `
import { createRouter } from '@agentuity/runtime';
import myAgent from '@agent/hello';
import { auth, logger, rateLimit } from './middleware';

const router = createRouter();
router.post('/test', auth, logger, myAgent.validator(), rateLimit, async (c) => {
	return c.json({ ok: true });
});

export default router;
		`;

		const { tempDir, path, cleanup } = createTempFile(content);
		try {
			const routes = await parseRoute(tempDir, path, projectId, deploymentId);
			expect(routes).toHaveLength(1);
			expect(routes[0].config?.hasValidator).toBe(true);
			expect(routes[0].config?.agentVariable).toBe('myAgent');
		} finally {
			cleanup();
		}
	});

	test('zValidator with variable reference', async () => {
		const content = `
import { createRouter } from '@agentuity/runtime';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

const schema = z.object({
	name: z.string(),
	age: z.number(),
});

const router = createRouter();
router.post('/test', zValidator('json', schema), async (c) => {
	return c.json({ ok: true });
});

export default router;
		`;

		const { tempDir, path, cleanup } = createTempFile(content);
		try {
			const routes = await parseRoute(tempDir, path, projectId, deploymentId);
			expect(routes).toHaveLength(1);
			expect(routes[0].config?.hasValidator).toBe(true);
			expect(routes[0].config?.agentVariable).toBeUndefined();
			expect(routes[0].config?.inputSchemaVariable).toBe('schema');
		} finally {
			cleanup();
		}
	});

	test('zValidator with inline schema', async () => {
		const content = `
import { createRouter } from '@agentuity/runtime';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

const router = createRouter();
router.post('/test', zValidator('json', z.object({ name: z.string() })), async (c) => {
	return c.json({ ok: true });
});

export default router;
		`;

		const { tempDir, path, cleanup } = createTempFile(content);
		try {
			const routes = await parseRoute(tempDir, path, projectId, deploymentId);
			expect(routes).toHaveLength(1);
			expect(routes[0].config?.hasValidator).toBe(true);
			// Inline schemas are detected but code not extracted yet
		} finally {
			cleanup();
		}
	});

	test('zValidator with middleware', async () => {
		const content = `
import { createRouter } from '@agentuity/runtime';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware } from './middleware';

const schema = z.object({ name: z.string() });

const router = createRouter();
router.post('/test', authMiddleware, zValidator('json', schema), async (c) => {
	return c.json({ ok: true });
});

export default router;
		`;

		const { tempDir, path, cleanup } = createTempFile(content);
		try {
			const routes = await parseRoute(tempDir, path, projectId, deploymentId);
			expect(routes).toHaveLength(1);
			expect(routes[0].config?.hasValidator).toBe(true);
			expect(routes[0].config?.inputSchemaVariable).toBe('schema');
		} finally {
			cleanup();
		}
	});

	test('mixed validators - zValidator and agent.validator()', async () => {
		const content = `
import { createRouter } from '@agentuity/runtime';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import myAgent from '@agent/hello';

const zodSchema = z.object({ email: z.string() });

const router = createRouter();
router.post('/zod', zValidator('json', zodSchema), async (c) => c.json({ ok: true }));
router.post('/agent', myAgent.validator(), async (c) => c.json({ ok: true }));

export default router;
		`;

		const { tempDir, path, cleanup } = createTempFile(content);
		try {
			const routes = await parseRoute(tempDir, path, projectId, deploymentId);
			expect(routes).toHaveLength(2);

			// First route: zValidator
			expect(routes[0].config?.hasValidator).toBe(true);
			expect(routes[0].config?.inputSchemaVariable).toBe('zodSchema');

			// Second route: agent.validator
			expect(routes[1].config?.hasValidator).toBe(true);
			expect(routes[1].config?.agentVariable).toBe('myAgent');
		} finally {
			cleanup();
		}
	});

	test('zValidator with query - should NOT extract schema', async () => {
		const content = `
import { createRouter } from '@agentuity/runtime';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

const querySchema = z.object({ page: z.string() });

const router = createRouter();
router.get('/test', zValidator('query', querySchema), async (c) => {
	return c.json({ ok: true });
});

export default router;
		`;

		const { tempDir, path, cleanup } = createTempFile(content);
		try {
			const routes = await parseRoute(tempDir, path, projectId, deploymentId);
			expect(routes).toHaveLength(1);
			// Should detect validator but NOT extract schema since it's 'query' not 'json'
			expect(routes[0].config?.hasValidator).toBe(true);
			expect(routes[0].config?.inputSchemaVariable).toBeUndefined();
		} finally {
			cleanup();
		}
	});

	test('zValidator with param - should NOT extract schema', async () => {
		const content = `
import { createRouter } from '@agentuity/runtime';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

const paramSchema = z.object({ id: z.string() });

const router = createRouter();
router.get('/test/:id', zValidator('param', paramSchema), async (c) => {
	return c.json({ ok: true });
});

export default router;
		`;

		const { tempDir, path, cleanup } = createTempFile(content);
		try {
			const routes = await parseRoute(tempDir, path, projectId, deploymentId);
			expect(routes).toHaveLength(1);
			// Should detect validator but NOT extract schema since it's 'param' not 'json'
			expect(routes[0].config?.hasValidator).toBe(true);
			expect(routes[0].config?.inputSchemaVariable).toBeUndefined();
		} finally {
			cleanup();
		}
	});

	test('websocket with exported schemas - should extract inputSchema and outputSchema', async () => {
		const content = `
import { createRouter } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

export const inputSchema = s.object({
	message: s.string(),
});

export const outputSchema = s.object({
	echo: s.string(),
});

const router = createRouter();
router.websocket('/echo', (c) => (ws) => {
	ws.onMessage((event) => {
		ws.send(event.data);
	});
});

export default router;
		`;

		const { tempDir, path, cleanup } = createTempFile(content);
		try {
			const routes = await parseRoute(tempDir, path, projectId, deploymentId);
			expect(routes).toHaveLength(1);
			expect(routes[0].type).toBe('websocket');
			expect(routes[0].path).toBe('/api/echo');
			expect(routes[0].config?.hasValidator).toBeFalsy();
			expect(routes[0].config?.inputSchemaVariable).toBe('inputSchema');
			expect(routes[0].config?.outputSchemaVariable).toBe('outputSchema');
		} finally {
			cleanup();
		}
	});

	test('websocket without schemas - should have no schema variables', async () => {
		const content = `
import { createRouter } from '@agentuity/runtime';

const router = createRouter();
router.websocket('/untyped', (c) => (ws) => {
	ws.onMessage((event) => {
		ws.send(event.data);
	});
});

export default router;
		`;

		const { tempDir, path, cleanup } = createTempFile(content);
		try {
			const routes = await parseRoute(tempDir, path, projectId, deploymentId);
			expect(routes).toHaveLength(1);
			expect(routes[0].type).toBe('websocket');
			expect(routes[0].path).toBe('/api/untyped');
			expect(routes[0].config?.hasValidator).toBeFalsy();
			expect(routes[0].config?.inputSchemaVariable).toBeUndefined();
			expect(routes[0].config?.outputSchemaVariable).toBeUndefined();
		} finally {
			cleanup();
		}
	});

	test('sse with exported outputSchema - should extract schema', async () => {
		const content = `
import { createRouter } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

export const outputSchema = s.object({
	event: s.string(),
	count: s.number(),
});

const router = createRouter();
router.sse('/events', (c) => async (stream) => {
	stream.writeSSE({ data: 'test' });
});

export default router;
		`;

		const { tempDir, path, cleanup } = createTempFile(content);
		try {
			const routes = await parseRoute(tempDir, path, projectId, deploymentId);
			expect(routes).toHaveLength(1);
			expect(routes[0].type).toBe('sse');
			expect(routes[0].path).toBe('/api/events');
			expect(routes[0].config?.hasValidator).toBeFalsy();
			expect(routes[0].config?.inputSchemaVariable).toBeUndefined();
			expect(routes[0].config?.outputSchemaVariable).toBe('outputSchema');
		} finally {
			cleanup();
		}
	});

	test('sse without schemas - should have no schema variables', async () => {
		const content = `
import { createRouter } from '@agentuity/runtime';

const router = createRouter();
router.sse('/stream', (c) => async (stream) => {
	stream.writeSSE({ data: 'test' });
});

export default router;
		`;

		const { tempDir, path, cleanup } = createTempFile(content);
		try {
			const routes = await parseRoute(tempDir, path, projectId, deploymentId);
			expect(routes).toHaveLength(1);
			expect(routes[0].type).toBe('sse');
			expect(routes[0].path).toBe('/api/stream');
			expect(routes[0].config?.hasValidator).toBeFalsy();
			expect(routes[0].config?.inputSchemaVariable).toBeUndefined();
			expect(routes[0].config?.outputSchemaVariable).toBeUndefined();
		} finally {
			cleanup();
		}
	});

	test('websocket with only outputSchema - should extract just output', async () => {
		const content = `
import { createRouter } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

export const outputSchema = s.object({
	message: s.string(),
});

const router = createRouter();
router.websocket('/one-way', (c) => (ws) => {
	ws.send('hello');
});

export default router;
		`;

		const { tempDir, path, cleanup } = createTempFile(content);
		try {
			const routes = await parseRoute(tempDir, path, projectId, deploymentId);
			expect(routes).toHaveLength(1);
			expect(routes[0].type).toBe('websocket');
			expect(routes[0].config?.inputSchemaVariable).toBeUndefined();
			expect(routes[0].config?.outputSchemaVariable).toBe('outputSchema');
		} finally {
			cleanup();
		}
	});
});
