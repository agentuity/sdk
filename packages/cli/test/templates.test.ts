/**
 * Unit tests for agent and API templates.
 * Verifies that generated templates have correct structure, exports, and syntax.
 */

import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAgentTemplates, createAPITemplates } from '../src/cmd/dev/templates';

describe('createAgentTemplates', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), 'agent-templates-test-'));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	test('creates agent.ts with default export', () => {
		const agentDir = join(tempDir, 'my-agent');
		mkdirSync(agentDir);

		createAgentTemplates(agentDir);

		const agentContent = readFileSync(join(agentDir, 'agent.ts'), 'utf-8');

		// Should use default export, not named export
		expect(agentContent).toContain('export default createAgent');
		expect(agentContent).not.toContain('export const');
	});

	test('creates index.ts that re-exports default', () => {
		const agentDir = join(tempDir, 'my-agent');
		mkdirSync(agentDir);

		createAgentTemplates(agentDir);

		const indexContent = readFileSync(join(agentDir, 'index.ts'), 'utf-8');

		// Should re-export default from agent.ts
		expect(indexContent).toContain("export { default } from './agent'");
	});

	test('creates both agent.ts and index.ts files', () => {
		const agentDir = join(tempDir, 'test-agent');
		mkdirSync(agentDir);

		createAgentTemplates(agentDir);

		expect(existsSync(join(agentDir, 'agent.ts'))).toBe(true);
		expect(existsSync(join(agentDir, 'index.ts'))).toBe(true);
	});

	test('uses PascalCase agent name in createAgent call', () => {
		const agentDir = join(tempDir, 'my-cool-agent');
		mkdirSync(agentDir);

		createAgentTemplates(agentDir);

		const agentContent = readFileSync(join(agentDir, 'agent.ts'), 'utf-8');

		// Agent name should be PascalCase version of directory name
		expect(agentContent).toContain("createAgent('MyCoolAgent'");
	});

	test('includes required imports', () => {
		const agentDir = join(tempDir, 'imports-test');
		mkdirSync(agentDir);

		createAgentTemplates(agentDir);

		const agentContent = readFileSync(join(agentDir, 'agent.ts'), 'utf-8');

		expect(agentContent).toContain("import { createAgent } from '@agentuity/runtime'");
		expect(agentContent).toContain("import { s } from '@agentuity/schema'");
	});

	test('includes schema definition', () => {
		const agentDir = join(tempDir, 'schema-test');
		mkdirSync(agentDir);

		createAgentTemplates(agentDir);

		const agentContent = readFileSync(join(agentDir, 'agent.ts'), 'utf-8');

		expect(agentContent).toContain('schema:');
		expect(agentContent).toContain('input: s.string()');
		expect(agentContent).toContain('output: s.string()');
	});

	test('includes handler with async signature', () => {
		const agentDir = join(tempDir, 'handler-test');
		mkdirSync(agentDir);

		createAgentTemplates(agentDir);

		const agentContent = readFileSync(join(agentDir, 'agent.ts'), 'utf-8');

		expect(agentContent).toContain('handler: async (_c, input)');
		expect(agentContent).toContain('return input');
	});

	test('does not create files for invalid directory names', () => {
		// Pass invalid path directly - validation is basename-based, no need to create directory
		const invalidDir = join(tempDir, 'invalid<name');

		createAgentTemplates(invalidDir);

		expect(existsSync(join(invalidDir, 'agent.ts'))).toBe(false);
		expect(existsSync(join(invalidDir, 'index.ts'))).toBe(false);
	});

	test('does not create files for reserved Windows names', () => {
		// Pass reserved name directly - validation is basename-based
		const reservedDir = join(tempDir, 'con');

		createAgentTemplates(reservedDir);

		expect(existsSync(join(reservedDir, 'agent.ts'))).toBe(false);
		expect(existsSync(join(reservedDir, 'index.ts'))).toBe(false);
	});

	test('does not create files for directory names ending with dot', () => {
		// Pass trailing dot path directly - validation is basename-based
		const trailingDotDir = join(tempDir, 'name.');

		createAgentTemplates(trailingDotDir);

		expect(existsSync(join(trailingDotDir, 'agent.ts'))).toBe(false);
		expect(existsSync(join(trailingDotDir, 'index.ts'))).toBe(false);
	});

	test('does not create files for directory names ending with space', () => {
		// Pass trailing space path directly - validation is basename-based
		const trailingSpaceDir = join(tempDir, 'name ');

		createAgentTemplates(trailingSpaceDir);

		expect(existsSync(join(trailingSpaceDir, 'agent.ts'))).toBe(false);
		expect(existsSync(join(trailingSpaceDir, 'index.ts'))).toBe(false);
	});
});

describe('createAPITemplates', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), 'api-templates-test-'));
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	test('creates index.ts with router', () => {
		const routeDir = join(tempDir, 'my-route');
		mkdirSync(routeDir);

		createAPITemplates(routeDir);

		expect(existsSync(join(routeDir, 'index.ts'))).toBe(true);
	});

	test('includes createRouter import', () => {
		const routeDir = join(tempDir, 'route-test');
		mkdirSync(routeDir);

		createAPITemplates(routeDir);

		const content = readFileSync(join(routeDir, 'index.ts'), 'utf-8');

		expect(content).toContain("import { createRouter } from '@agentuity/runtime'");
	});

	test('includes default export of router', () => {
		const routeDir = join(tempDir, 'export-test');
		mkdirSync(routeDir);

		createAPITemplates(routeDir);

		const content = readFileSync(join(routeDir, 'index.ts'), 'utf-8');

		expect(content).toContain('export default router');
	});

	test('includes GET route handler', () => {
		const routeDir = join(tempDir, 'handler-test');
		mkdirSync(routeDir);

		createAPITemplates(routeDir);

		const content = readFileSync(join(routeDir, 'index.ts'), 'utf-8');

		expect(content).toContain("router.get('/'");
		expect(content).toContain('async (c)');
	});

	test('does not create files for invalid directory names', () => {
		// Pass invalid path directly - validation is basename-based, no need to create directory
		const invalidDir = join(tempDir, 'invalid|name');

		createAPITemplates(invalidDir);

		expect(existsSync(join(invalidDir, 'index.ts'))).toBe(false);
	});
});
