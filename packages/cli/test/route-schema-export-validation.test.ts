import { describe, test, expect } from 'bun:test';
import { parseRoute } from '../src/cmd/build/ast';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Test schema export validation for route validators.
 * When a schema is used in a validator and defined locally (not imported),
 * it must be exported so the generated route registry can import it.
 *
 * See: https://github.com/agentuity/sdk/issues/547
 */
describe('Route Schema Export Validation', () => {
	const projectId = 'test-project';
	const deploymentId = 'test-deployment';

	function createTempFile(content: string): {
		tempDir: string;
		path: string;
		cleanup: () => void;
	} {
		const tempDir = mkdtempSync(join(tmpdir(), 'route-schema-export-test-'));
		const filePath = join(tempDir, 'test.ts');
		writeFileSync(filePath, content, 'utf-8');
		return {
			tempDir,
			path: filePath,
			cleanup: () => rmSync(tempDir, { recursive: true, force: true }),
		};
	}

	describe('Non-exported local schemas should throw SchemaNotExportedError', () => {
		test('non-exported input schema in validator({ input }) throws error', async () => {
			const content = `
import { createRouter, validator } from '@agentuity/runtime';
import { s } from '@agentuity/core';

const mySchema = s.object({
	name: s.string(),
});

const router = createRouter();
router.post('/test', validator({ input: mySchema }), async (c) => {
	return c.json({ ok: true });
});

export default router;
			`;

			const { tempDir, path, cleanup } = createTempFile(content);
			try {
				await expect(parseRoute(tempDir, path, projectId, deploymentId)).rejects.toThrow(
					/Schema "mySchema" used as the input validator/
				);
			} finally {
				cleanup();
			}
		});

		test('non-exported output schema in validator({ output }) throws error', async () => {
			const content = `
import { createRouter, validator } from '@agentuity/runtime';
import { s } from '@agentuity/core';

const outputSchema = s.object({
	result: s.string(),
});

const router = createRouter();
router.post('/test', validator({ output: outputSchema }), async (c) => {
	return c.json({ result: 'ok' });
});

export default router;
			`;

			const { tempDir, path, cleanup } = createTempFile(content);
			try {
				await expect(parseRoute(tempDir, path, projectId, deploymentId)).rejects.toThrow(
					/Schema "outputSchema" used as the output validator/
				);
			} finally {
				cleanup();
			}
		});

		test('non-exported schemas in validator({ input, output }) throws error for input first', async () => {
			const content = `
import { createRouter, validator } from '@agentuity/runtime';
import { s } from '@agentuity/core';

const inputSchema = s.object({
	name: s.string(),
});

const outputSchema = s.object({
	result: s.string(),
});

const router = createRouter();
router.post('/test', validator({ input: inputSchema, output: outputSchema }), async (c) => {
	return c.json({ result: 'ok' });
});

export default router;
			`;

			const { tempDir, path, cleanup } = createTempFile(content);
			try {
				// Should throw for input schema first
				await expect(parseRoute(tempDir, path, projectId, deploymentId)).rejects.toThrow(
					/Schema "inputSchema" used as the input validator/
				);
			} finally {
				cleanup();
			}
		});

		test('non-exported schema with PUT method shows correct error', async () => {
			const content = `
import { createRouter, validator } from '@agentuity/runtime';
import { s } from '@agentuity/core';

const updateSchema = s.object({
	name: s.string().optional(),
	description: s.string().optional(),
});

const router = createRouter();
router.put('/:slug', validator({ input: updateSchema }), async (c) => {
	return c.json({ ok: true });
});

export default router;
			`;

			const { tempDir, path, cleanup } = createTempFile(content);
			try {
				await expect(parseRoute(tempDir, path, projectId, deploymentId)).rejects.toThrow(
					/Schema "updateSchema" used as the input validator for route "PUT/
				);
			} finally {
				cleanup();
			}
		});

		test('non-exported schema in agent.validator({ input }) throws error', async () => {
			const content = `
import { createRouter } from '@agentuity/runtime';
import myAgent from '@agent/hello';
import { s } from '@agentuity/core';

const customInput = s.object({
	customField: s.string(),
});

const router = createRouter();
router.post('/test', myAgent.validator({ input: customInput }), async (c) => {
	return c.json({ ok: true });
});

export default router;
			`;

			const { tempDir, path, cleanup } = createTempFile(content);
			try {
				await expect(parseRoute(tempDir, path, projectId, deploymentId)).rejects.toThrow(
					/Schema "customInput" used as the input validator/
				);
			} finally {
				cleanup();
			}
		});

		test('non-exported schema in router.on() method throws error', async () => {
			const content = `
import { createRouter, validator } from '@agentuity/runtime';
import { s } from '@agentuity/core';

const onSchema = s.object({
	data: s.string(),
});

const router = createRouter();
router.on(['GET', 'POST'], '/multi', validator({ input: onSchema }), async (c) => {
	return c.json({ ok: true });
});

export default router;
			`;

			const { tempDir, path, cleanup } = createTempFile(content);
			try {
				await expect(parseRoute(tempDir, path, projectId, deploymentId)).rejects.toThrow(
					/Schema "onSchema" used as the input validator/
				);
			} finally {
				cleanup();
			}
		});

		test('non-exported schema in router.all() method throws error', async () => {
			const content = `
import { createRouter, validator } from '@agentuity/runtime';
import { s } from '@agentuity/core';

const allSchema = s.object({
	data: s.string(),
});

const router = createRouter();
router.all('/catch-all', validator({ input: allSchema }), async (c) => {
	return c.json({ ok: true });
});

export default router;
			`;

			const { tempDir, path, cleanup } = createTempFile(content);
			try {
				await expect(parseRoute(tempDir, path, projectId, deploymentId)).rejects.toThrow(
					/Schema "allSchema" used as the input validator/
				);
			} finally {
				cleanup();
			}
		});
	});

	describe('Exported local schemas should pass validation', () => {
		test('export const inputSchema passes validation', async () => {
			const content = `
import { createRouter, validator } from '@agentuity/runtime';
import { s } from '@agentuity/core';

export const mySchema = s.object({
	name: s.string(),
});

const router = createRouter();
router.post('/test', validator({ input: mySchema }), async (c) => {
	return c.json({ ok: true });
});

export default router;
			`;

			const { tempDir, path, cleanup } = createTempFile(content);
			try {
				const routes = await parseRoute(tempDir, path, projectId, deploymentId);
				expect(routes).toHaveLength(1);
				expect(routes[0].config?.inputSchemaVariable).toBe('mySchema');
			} finally {
				cleanup();
			}
		});

		test('export const outputSchema passes validation', async () => {
			const content = `
import { createRouter, validator } from '@agentuity/runtime';
import { s } from '@agentuity/core';

export const outputSchema = s.object({
	result: s.string(),
});

const router = createRouter();
router.post('/test', validator({ output: outputSchema }), async (c) => {
	return c.json({ result: 'ok' });
});

export default router;
			`;

			const { tempDir, path, cleanup } = createTempFile(content);
			try {
				const routes = await parseRoute(tempDir, path, projectId, deploymentId);
				expect(routes).toHaveLength(1);
				expect(routes[0].config?.outputSchemaVariable).toBe('outputSchema');
			} finally {
				cleanup();
			}
		});

		test('export { schema } re-export pattern passes validation', async () => {
			const content = `
import { createRouter, validator } from '@agentuity/runtime';
import { s } from '@agentuity/core';

const mySchema = s.object({
	name: s.string(),
});

export { mySchema };

const router = createRouter();
router.post('/test', validator({ input: mySchema }), async (c) => {
	return c.json({ ok: true });
});

export default router;
			`;

			const { tempDir, path, cleanup } = createTempFile(content);
			try {
				const routes = await parseRoute(tempDir, path, projectId, deploymentId);
				expect(routes).toHaveLength(1);
				expect(routes[0].config?.inputSchemaVariable).toBe('mySchema');
			} finally {
				cleanup();
			}
		});

		test('export { schema as alias } pattern passes validation', async () => {
			const content = `
import { createRouter, validator } from '@agentuity/runtime';
import { s } from '@agentuity/core';

const internalSchema = s.object({
	name: s.string(),
});

export { internalSchema as PublicSchema };

const router = createRouter();
router.post('/test', validator({ input: internalSchema }), async (c) => {
	return c.json({ ok: true });
});

export default router;
			`;

			const { tempDir, path, cleanup } = createTempFile(content);
			try {
				const routes = await parseRoute(tempDir, path, projectId, deploymentId);
				expect(routes).toHaveLength(1);
				expect(routes[0].config?.inputSchemaVariable).toBe('internalSchema');
			} finally {
				cleanup();
			}
		});

		test('both input and output exported schemas pass validation', async () => {
			const content = `
import { createRouter, validator } from '@agentuity/runtime';
import { s } from '@agentuity/core';

export const inputSchema = s.object({
	name: s.string(),
});

export const outputSchema = s.object({
	result: s.string(),
});

const router = createRouter();
router.post('/test', validator({ input: inputSchema, output: outputSchema }), async (c) => {
	return c.json({ result: 'ok' });
});

export default router;
			`;

			const { tempDir, path, cleanup } = createTempFile(content);
			try {
				const routes = await parseRoute(tempDir, path, projectId, deploymentId);
				expect(routes).toHaveLength(1);
				expect(routes[0].config?.inputSchemaVariable).toBe('inputSchema');
				expect(routes[0].config?.outputSchemaVariable).toBe('outputSchema');
			} finally {
				cleanup();
			}
		});

		test('export class declaration passes validation', async () => {
			const content = `
import { createRouter, validator } from '@agentuity/runtime';

export class MySchema {
	static validate(data: unknown) { return data; }
}

const router = createRouter();
router.post('/test', validator({ input: MySchema }), async (c) => {
	return c.json({ ok: true });
});

export default router;
			`;

			const { tempDir, path, cleanup } = createTempFile(content);
			try {
				const routes = await parseRoute(tempDir, path, projectId, deploymentId);
				expect(routes).toHaveLength(1);
				expect(routes[0].config?.inputSchemaVariable).toBe('MySchema');
			} finally {
				cleanup();
			}
		});

		test('non-exported class declaration throws error', async () => {
			const content = `
import { createRouter, validator } from '@agentuity/runtime';

class MySchema {
	static validate(data: unknown) { return data; }
}

const router = createRouter();
router.post('/test', validator({ input: MySchema }), async (c) => {
	return c.json({ ok: true });
});

export default router;
			`;

			const { tempDir, path, cleanup } = createTempFile(content);
			try {
				await expect(parseRoute(tempDir, path, projectId, deploymentId)).rejects.toThrow(
					/Schema "MySchema" used as the input validator/
				);
			} finally {
				cleanup();
			}
		});

		test('export function declaration passes validation', async () => {
			const content = `
import { createRouter, validator } from '@agentuity/runtime';

export function mySchemaValidator(data: unknown) { return data; }

const router = createRouter();
router.post('/test', validator({ input: mySchemaValidator }), async (c) => {
	return c.json({ ok: true });
});

export default router;
			`;

			const { tempDir, path, cleanup } = createTempFile(content);
			try {
				const routes = await parseRoute(tempDir, path, projectId, deploymentId);
				expect(routes).toHaveLength(1);
				expect(routes[0].config?.inputSchemaVariable).toBe('mySchemaValidator');
			} finally {
				cleanup();
			}
		});
	});

	describe('Imported schemas should pass validation (no export required)', () => {
		test('imported schema from another file passes validation', async () => {
			const content = `
import { createRouter, validator } from '@agentuity/runtime';
import { MyInputSchema } from './schemas';

const router = createRouter();
router.post('/test', validator({ input: MyInputSchema }), async (c) => {
	return c.json({ ok: true });
});

export default router;
			`;

			const { tempDir, path, cleanup } = createTempFile(content);
			try {
				const routes = await parseRoute(tempDir, path, projectId, deploymentId);
				expect(routes).toHaveLength(1);
				expect(routes[0].config?.inputSchemaVariable).toBe('MyInputSchema');
			} finally {
				cleanup();
			}
		});

		test('default-imported schema passes validation', async () => {
			const content = `
import { createRouter, validator } from '@agentuity/runtime';
import MySchema from './my-schema';

const router = createRouter();
router.post('/test', validator({ input: MySchema }), async (c) => {
	return c.json({ ok: true });
});

export default router;
			`;

			const { tempDir, path, cleanup } = createTempFile(content);
			try {
				const routes = await parseRoute(tempDir, path, projectId, deploymentId);
				expect(routes).toHaveLength(1);
				expect(routes[0].config?.inputSchemaVariable).toBe('MySchema');
			} finally {
				cleanup();
			}
		});

		test('imported input with local non-exported output throws for output only', async () => {
			const content = `
import { createRouter, validator } from '@agentuity/runtime';
import { InputSchema } from './schemas';
import { s } from '@agentuity/core';

const localOutput = s.object({
	result: s.string(),
});

const router = createRouter();
router.post('/test', validator({ input: InputSchema, output: localOutput }), async (c) => {
	return c.json({ result: 'ok' });
});

export default router;
			`;

			const { tempDir, path, cleanup } = createTempFile(content);
			try {
				// Should throw for output schema since it's local and not exported
				await expect(parseRoute(tempDir, path, projectId, deploymentId)).rejects.toThrow(
					/Schema "localOutput" used as the output validator/
				);
			} finally {
				cleanup();
			}
		});

		test('mixed imported and exported schemas pass validation', async () => {
			const content = `
import { createRouter, validator } from '@agentuity/runtime';
import { InputSchema } from './schemas';
import { s } from '@agentuity/core';

export const localOutput = s.object({
	result: s.string(),
});

const router = createRouter();
router.post('/test', validator({ input: InputSchema, output: localOutput }), async (c) => {
	return c.json({ result: 'ok' });
});

export default router;
			`;

			const { tempDir, path, cleanup } = createTempFile(content);
			try {
				const routes = await parseRoute(tempDir, path, projectId, deploymentId);
				expect(routes).toHaveLength(1);
				expect(routes[0].config?.inputSchemaVariable).toBe('InputSchema');
				expect(routes[0].config?.outputSchemaVariable).toBe('localOutput');
			} finally {
				cleanup();
			}
		});
	});

	describe('agent.validator() without schema override should pass', () => {
		test('agent.validator() with no args passes (uses agent schemas)', async () => {
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
				// No schema variables since none were overridden
				expect(routes[0].config?.inputSchemaVariable).toBeUndefined();
			} finally {
				cleanup();
			}
		});

		test('agent.validator({ output: exportedSchema }) passes', async () => {
			const content = `
import { createRouter } from '@agentuity/runtime';
import myAgent from '@agent/hello';
import { s } from '@agentuity/core';

export const customOutput = s.object({
	custom: s.string(),
});

const router = createRouter();
router.post('/test', myAgent.validator({ output: customOutput }), async (c) => {
	return c.json({ custom: 'value' });
});

export default router;
			`;

			const { tempDir, path, cleanup } = createTempFile(content);
			try {
				const routes = await parseRoute(tempDir, path, projectId, deploymentId);
				expect(routes).toHaveLength(1);
				expect(routes[0].config?.hasValidator).toBe(true);
				expect(routes[0].config?.outputSchemaVariable).toBe('customOutput');
			} finally {
				cleanup();
			}
		});
	});

	describe('Routes without validators should pass', () => {
		test('route with no validator should pass', async () => {
			const content = `
import { createRouter } from '@agentuity/runtime';

const router = createRouter();
router.get('/health', async (c) => {
	return c.json({ ok: true });
});

export default router;
			`;

			const { tempDir, path, cleanup } = createTempFile(content);
			try {
				const routes = await parseRoute(tempDir, path, projectId, deploymentId);
				expect(routes).toHaveLength(1);
				expect(routes[0].config?.hasValidator).toBeUndefined();
			} finally {
				cleanup();
			}
		});
	});

	describe('Error message format', () => {
		test('error message includes file path', async () => {
			const content = `
import { createRouter, validator } from '@agentuity/runtime';
import { s } from '@agentuity/core';

const schema = s.object({ name: s.string() });

const router = createRouter();
router.post('/test', validator({ input: schema }), async (c) => c.json({ ok: true }));

export default router;
			`;

			const { tempDir, path, cleanup } = createTempFile(content);
			try {
				await expect(parseRoute(tempDir, path, projectId, deploymentId)).rejects.toThrow(
					/in test\.ts/
				);
			} finally {
				cleanup();
			}
		});

		test('error message includes fix suggestion', async () => {
			const content = `
import { createRouter, validator } from '@agentuity/runtime';
import { s } from '@agentuity/core';

const badSchema = s.object({ name: s.string() });

const router = createRouter();
router.post('/test', validator({ input: badSchema }), async (c) => c.json({ ok: true }));

export default router;
			`;

			const { tempDir, path, cleanup } = createTempFile(content);
			try {
				await expect(parseRoute(tempDir, path, projectId, deploymentId)).rejects.toThrow(
					/export const badSchema/
				);
			} finally {
				cleanup();
			}
		});

		test('error message explains why export is needed', async () => {
			const content = `
import { createRouter, validator } from '@agentuity/runtime';
import { s } from '@agentuity/core';

const someSchema = s.object({ name: s.string() });

const router = createRouter();
router.post('/test', validator({ input: someSchema }), async (c) => c.json({ ok: true }));

export default router;
			`;

			const { tempDir, path, cleanup } = createTempFile(content);
			try {
				await expect(parseRoute(tempDir, path, projectId, deploymentId)).rejects.toThrow(
					/generates a route registry that imports schema types/
				);
			} finally {
				cleanup();
			}
		});
	});

	describe('Multiple routes in same file', () => {
		test('multiple routes with exported schemas pass', async () => {
			const content = `
import { createRouter, validator } from '@agentuity/runtime';
import { s } from '@agentuity/core';

export const createSchema = s.object({ name: s.string() });
export const updateSchema = s.object({ name: s.string().optional() });

const router = createRouter();
router.post('/', validator({ input: createSchema }), async (c) => c.json({ ok: true }));
router.put('/:id', validator({ input: updateSchema }), async (c) => c.json({ ok: true }));

export default router;
			`;

			const { tempDir, path, cleanup } = createTempFile(content);
			try {
				const routes = await parseRoute(tempDir, path, projectId, deploymentId);
				expect(routes).toHaveLength(2);
				expect(routes[0].config?.inputSchemaVariable).toBe('createSchema');
				expect(routes[1].config?.inputSchemaVariable).toBe('updateSchema');
			} finally {
				cleanup();
			}
		});

		test('first non-exported schema throws even if others are exported', async () => {
			const content = `
import { createRouter, validator } from '@agentuity/runtime';
import { s } from '@agentuity/core';

const badSchema = s.object({ name: s.string() });
export const goodSchema = s.object({ name: s.string().optional() });

const router = createRouter();
router.post('/', validator({ input: badSchema }), async (c) => c.json({ ok: true }));
router.put('/:id', validator({ input: goodSchema }), async (c) => c.json({ ok: true }));

export default router;
			`;

			const { tempDir, path, cleanup } = createTempFile(content);
			try {
				await expect(parseRoute(tempDir, path, projectId, deploymentId)).rejects.toThrow(
					/Schema "badSchema"/
				);
			} finally {
				cleanup();
			}
		});
	});

	describe('Different HTTP methods', () => {
		test('GET with non-exported schema throws', async () => {
			const content = `
import { createRouter, validator } from '@agentuity/runtime';
import { s } from '@agentuity/core';

const querySchema = s.object({ page: s.number() });

const router = createRouter();
router.get('/list', validator({ input: querySchema }), async (c) => c.json({ items: [] }));

export default router;
			`;

			const { tempDir, path, cleanup } = createTempFile(content);
			try {
				await expect(parseRoute(tempDir, path, projectId, deploymentId)).rejects.toThrow(
					/Schema "querySchema" used as the input validator for route "GET/
				);
			} finally {
				cleanup();
			}
		});

		test('DELETE with non-exported schema throws', async () => {
			const content = `
import { createRouter, validator } from '@agentuity/runtime';
import { s } from '@agentuity/core';

const deleteSchema = s.object({ force: s.boolean() });

const router = createRouter();
router.delete('/:id', validator({ input: deleteSchema }), async (c) => c.json({ deleted: true }));

export default router;
			`;

			const { tempDir, path, cleanup } = createTempFile(content);
			try {
				await expect(parseRoute(tempDir, path, projectId, deploymentId)).rejects.toThrow(
					/Schema "deleteSchema" used as the input validator for route "DELETE/
				);
			} finally {
				cleanup();
			}
		});

		test('PATCH with non-exported schema throws', async () => {
			const content = `
import { createRouter, validator } from '@agentuity/runtime';
import { s } from '@agentuity/core';

const patchSchema = s.object({ partial: s.boolean() });

const router = createRouter();
router.patch('/:id', validator({ input: patchSchema }), async (c) => c.json({ updated: true }));

export default router;
			`;

			const { tempDir, path, cleanup } = createTempFile(content);
			try {
				await expect(parseRoute(tempDir, path, projectId, deploymentId)).rejects.toThrow(
					/Schema "patchSchema" used as the input validator for route "PATCH/
				);
			} finally {
				cleanup();
			}
		});
	});
});
