import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateLifecycleTypes } from '../../../src/cmd/build/vite/lifecycle-generator';
import { createLogger } from '@agentuity/server';

describe('lifecycle-generator', () => {
	let testDir: string;
	let rootDir: string;
	let srcDir: string;
	let generatedDir: string;
	const logger = createLogger('info');

	beforeEach(() => {
		testDir = join(tmpdir(), `lifecycle-gen-test-${Date.now()}-${Math.random()}`);
		rootDir = testDir;
		srcDir = join(testDir, 'src');
		generatedDir = join(srcDir, 'generated');
		mkdirSync(srcDir, { recursive: true });

		// Create fake node_modules/@agentuity/runtime for path resolution
		const runtimeDir = join(rootDir, 'node_modules', '@agentuity', 'runtime', 'src');
		mkdirSync(runtimeDir, { recursive: true });
		// Create minimal index.ts
		const indexPath = join(runtimeDir, 'index.ts');
		Bun.write(indexPath, 'export function createRouter() {}');
	});

	afterEach(() => {
		if (testDir) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	describe('setup inside createApp', () => {
		test('should generate types for inline arrow function with return', async () => {
			const appContent = `import { createApp } from '@agentuity/runtime';

const app = await createApp({
	setup: () => {
		return { foo: 'bar', count: 42 };
	},
});

export default app;`;

			const appPath = join(rootDir, 'app.ts');
			await Bun.write(appPath, appContent);

			const result = await generateLifecycleTypes(rootDir, srcDir, logger);

			expect(result).toBe(true);
			expect(existsSync(join(generatedDir, 'state.ts'))).toBe(true);
			expect(existsSync(join(generatedDir, 'router.ts'))).toBe(true);

			const typesContent = await Bun.file(join(generatedDir, 'state.ts')).text();
			expect(typesContent).toContain('foo: string');
			expect(typesContent).toContain('count: number');
		});

		test('should generate types for inline arrow function with expression body', async () => {
			const appContent = `import { createApp } from '@agentuity/runtime';

const app = await createApp({
	setup: () => ({ database: null, cache: true }),
});

export default app;`;

			const appPath = join(rootDir, 'app.ts');
			await Bun.write(appPath, appContent);

			const result = await generateLifecycleTypes(rootDir, srcDir, logger);

			expect(result).toBe(true);

			const typesContent = await Bun.file(join(generatedDir, 'state.ts')).text();
			expect(typesContent).toContain('database:');
			expect(typesContent).toContain('cache: boolean');
		});

		test('should generate types for function expression', async () => {
			const appContent = `import { createApp } from '@agentuity/runtime';

const app = await createApp({
	setup: function() {
		const db = { connected: true };
		return db;
	},
});

export default app;`;

			const appPath = join(rootDir, 'app.ts');
			await Bun.write(appPath, appContent);

			const result = await generateLifecycleTypes(rootDir, srcDir, logger);

			expect(result).toBe(true);
		});

		test('should generate types for async setup', async () => {
			const appContent = `import { createApp } from '@agentuity/runtime';

const app = await createApp({
	setup: async () => {
		return { ready: true };
	},
});

export default app;`;

			const appPath = join(rootDir, 'app.ts');
			await Bun.write(appPath, appContent);

			const result = await generateLifecycleTypes(rootDir, srcDir, logger);

			expect(result).toBe(true);

			const typesContent = await Bun.file(join(generatedDir, 'state.ts')).text();
			expect(typesContent).toContain('ready: boolean');
		});
	});

	describe('exported setup function', () => {
		test('should generate types for exported setup function', async () => {
			const appContent = `import { createApp } from '@agentuity/runtime';

export function setup() {
	return {
		database: 'connected',
		port: 3000,
	};
}

const app = await createApp({});

export default app;`;

			const appPath = join(rootDir, 'app.ts');
			await Bun.write(appPath, appContent);

			const result = await generateLifecycleTypes(rootDir, srcDir, logger);

			expect(result).toBe(true);

			const typesContent = await Bun.file(join(generatedDir, 'state.ts')).text();
			expect(typesContent).toContain('database: string');
			expect(typesContent).toContain('port: number');
		});

		test('should generate types for exported async setup', async () => {
			const appContent = `import { createApp } from '@agentuity/runtime';

export async function setup() {
	return {
		initialized: true,
	};
}

const app = await createApp({});

export default app;`;

			const appPath = join(rootDir, 'app.ts');
			await Bun.write(appPath, appContent);

			const result = await generateLifecycleTypes(rootDir, srcDir, logger);

			expect(result).toBe(true);
		});
	});

	describe('edge cases', () => {
		test('should handle variable reference in expression body', async () => {
			const appContent = `import { createApp } from '@agentuity/runtime';

const state = { connected: true, port: 3000 };

const app = await createApp({
	setup: () => state,
});

export default app;`;

			const appPath = join(rootDir, 'app.ts');
			await Bun.write(appPath, appContent);

			const result = await generateLifecycleTypes(rootDir, srcDir, logger);

			expect(result).toBe(true);

			const typesContent = await Bun.file(join(generatedDir, 'state.ts')).text();
			expect(typesContent).toContain('connected: boolean');
			expect(typesContent).toContain('port: number');
		});
	});

	describe('no setup function', () => {
		test('should return false when no setup exists', async () => {
			const appContent = `import { createApp } from '@agentuity/runtime';

const app = await createApp({
	services: {},
});

export default app;`;

			const appPath = join(rootDir, 'app.ts');
			await Bun.write(appPath, appContent);

			const result = await generateLifecycleTypes(rootDir, srcDir, logger);

			expect(result).toBe(false);
			expect(existsSync(join(generatedDir, 'state.ts'))).toBe(false);
		});
	});
});
