import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseAgentMetadata } from '../src/cmd/build/ast';

const TEST_DIR = '/tmp/agentuity-cli-test-nested-agents';

describe('Agent Nested Directory Discovery', () => {
	beforeEach(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
		mkdirSync(TEST_DIR, { recursive: true });
	});

	afterEach(() => {
		rmSync(TEST_DIR, { recursive: true, force: true });
	});

	test('should parse agent in subdirectory', async () => {
		const agentDir = join(TEST_DIR, 'src', 'agent', 'auth');
		mkdirSync(agentDir, { recursive: true });
		const agentFile = join(agentDir, 'agent.ts');

		const code = `
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const authAgent = createAgent('auth-agent', {
	description: 'Authentication agent',
	schema: {
		input: s.object({ username: s.string() }),
		output: s.object({ token: s.string() })
	},
	handler: async (ctx, input) => {
		return { token: 'test-token' };
	}
});

export default authAgent;
		`;
		writeFileSync(agentFile, code);

		const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'bun' });
		const transpiled = transpiler.transformSync(code);

		const result = await parseAgentMetadata(TEST_DIR, agentFile, transpiled, 'proj_1', 'dep_1');

		expect(result).toBeDefined();
		const [, metadata] = result!;
		expect(metadata.get('name')).toBe('auth-agent');
		// Description comes from agent metadata object, not config
		expect(metadata.get('filename')).toContain('auth/agent.ts');
	});

	test('should parse agent in nested subdirectory', async () => {
		const agentDir = join(TEST_DIR, 'src', 'agent', 'v1', 'admin', 'users');
		mkdirSync(agentDir, { recursive: true });
		const agentFile = join(agentDir, 'agent.ts');

		const code = `
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const userAdminAgent = createAgent('v1-admin-users', {
	description: 'Admin user management',
	schema: {
		input: s.object({ operation: s.string() }),
		output: s.object({ success: s.boolean() })
	},
	handler: async (ctx, input) => {
		return { success: true };
	}
});

export default userAdminAgent;
		`;
		writeFileSync(agentFile, code);

		const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'bun' });
		const transpiled = transpiler.transformSync(code);

		const result = await parseAgentMetadata(TEST_DIR, agentFile, transpiled, 'proj_1', 'dep_1');

		expect(result).toBeDefined();
		const [, metadata] = result!;
		expect(metadata.get('name')).toBe('v1-admin-users');
		expect(metadata.get('filename')).toContain('v1/admin/users/agent.ts');
	});

	test('should parse agent with TypeScript interfaces', async () => {
		const agentDir = join(TEST_DIR, 'src', 'agent', 'data', 'processing');
		mkdirSync(agentDir, { recursive: true });
		const agentFile = join(agentDir, 'agent.ts');

		const code = `
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

interface ProcessingConfig {
	mode: 'sync' | 'async';
	timeout: number;
}

interface ProcessingResult {
	status: 'success' | 'failure';
	data: any;
}

const processingAgent = createAgent('data-processing', {
	description: 'Data processing agent',
	schema: {
		input: s.object({ data: s.any() }),
		output: s.object({ result: s.any() })
	},
	handler: async (ctx, input) => {
		const config: ProcessingConfig = { mode: 'sync', timeout: 5000 };
		const result: ProcessingResult = { status: 'success', data: input.data };
		return { result };
	}
});

export default processingAgent;
		`;
		writeFileSync(agentFile, code);

		const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'bun' });
		const transpiled = transpiler.transformSync(code);

		const result = await parseAgentMetadata(TEST_DIR, agentFile, transpiled, 'proj_1', 'dep_1');

		expect(result).toBeDefined();
		const [, metadata] = result!;
		expect(metadata.get('name')).toBe('data-processing');
	});

	test('should parse agent with enums and types', async () => {
		const agentDir = join(TEST_DIR, 'src', 'agent', 'workflow', 'orchestration');
		mkdirSync(agentDir, { recursive: true });
		const agentFile = join(agentDir, 'agent.ts');

		const code = `
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

enum WorkflowStatus {
	Pending = 'pending',
	Running = 'running',
	Completed = 'completed',
	Failed = 'failed'
}

type WorkflowStep = {
	id: string;
	name: string;
	status: WorkflowStatus;
};

const orchestrationAgent = createAgent('workflow-orchestration', {
	description: 'Workflow orchestration agent',
	schema: {
		input: s.object({ workflowId: s.string() }),
		output: s.object({ status: s.string() })
	},
	handler: async (ctx, input) => {
		const steps: WorkflowStep[] = [
			{ id: '1', name: 'Init', status: WorkflowStatus.Completed }
		];
		return { status: steps[0].status };
	}
});

export default orchestrationAgent;
		`;
		writeFileSync(agentFile, code);

		const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'bun' });
		const transpiled = transpiler.transformSync(code);

		const result = await parseAgentMetadata(TEST_DIR, agentFile, transpiled, 'proj_1', 'dep_1');

		expect(result).toBeDefined();
		const [, metadata] = result!;
		expect(metadata.get('name')).toBe('workflow-orchestration');
	});

	test('should parse multiple agents in different nested directories', async () => {
		const agents = [
			{ path: 'auth/login', name: 'login-agent' },
			{ path: 'auth/logout', name: 'logout-agent' },
			{ path: 'v1/users/create', name: 'create-user-agent' },
			{ path: 'v1/users/delete', name: 'delete-user-agent' },
			{ path: 'v2/admin/settings', name: 'admin-settings-agent' },
		];

		const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'bun' });
		const results = [];

		for (const agent of agents) {
			const agentDir = join(TEST_DIR, 'src', 'agent', agent.path);
			mkdirSync(agentDir, { recursive: true });
			const agentFile = join(agentDir, 'agent.ts');

			const code = `
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const agent = createAgent('${agent.name}', {
	description: '${agent.name} description',
	schema: {
		input: s.object({ test: s.string() }),
		output: s.object({ result: s.string() })
	},
	handler: async (ctx, input) => {
		return { result: 'ok' };
	}
});

export default agent;
			`;
			writeFileSync(agentFile, code);

			const transpiled = transpiler.transformSync(code);
			const result = await parseAgentMetadata(
				TEST_DIR,
				agentFile,
				transpiled,
				'proj_1',
				'dep_1'
			);

			if (result) {
				results.push(result[1]);
			}
		}

		expect(results).toHaveLength(5);

		const names = results.map((r) => r.get('name')).sort();
		expect(names).toEqual([
			'admin-settings-agent',
			'create-user-agent',
			'delete-user-agent',
			'login-agent',
			'logout-agent',
		]);
	});

	test('should handle agent file not named agent.ts', async () => {
		const agentDir = join(TEST_DIR, 'src', 'agent', 'utils');
		mkdirSync(agentDir, { recursive: true });
		const agentFile = join(agentDir, 'helper.ts');

		const code = `
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

const helperAgent = createAgent('helper-agent', {
	description: 'Helper utility agent',
	schema: {
		input: s.object({ value: s.string() }),
		output: s.object({ processed: s.string() })
	},
	handler: async (ctx, input) => {
		return { processed: input.value.toUpperCase() };
	}
});

export default helperAgent;
		`;
		writeFileSync(agentFile, code);

		const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'bun' });
		const transpiled = transpiler.transformSync(code);

		const result = await parseAgentMetadata(TEST_DIR, agentFile, transpiled, 'proj_1', 'dep_1');

		expect(result).toBeDefined();
		const [, metadata] = result!;
		expect(metadata.get('name')).toBe('helper-agent');
	});

	test('should skip utility files without createAgent', async () => {
		const agentDir = join(TEST_DIR, 'src', 'agent', 'shared');
		mkdirSync(agentDir, { recursive: true });
		const utilFile = join(agentDir, 'utils.ts');

		const code = `
export function formatDate(date: Date): string {
	return date.toISOString();
}

export function parseJSON(data: string): any {
	return JSON.parse(data);
}
		`;
		writeFileSync(utilFile, code);

		const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'bun' });
		const transpiled = transpiler.transformSync(code);

		const result = await parseAgentMetadata(TEST_DIR, utilFile, transpiled, 'proj_1', 'dep_1');

		// Should return undefined for files without createAgent
		expect(result).toBeUndefined();
	});

	test('should parse agent with generics and complex types', async () => {
		const agentDir = join(TEST_DIR, 'src', 'agent', 'generic');
		mkdirSync(agentDir, { recursive: true });
		const agentFile = join(agentDir, 'agent.ts');

		const code = `
import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';

interface ApiResponse<T> {
	data: T;
	meta: { timestamp: number };
}

type Paginated<T> = {
	items: T[];
	total: number;
};

const genericAgent = createAgent('generic-agent', {
	description: 'Agent with generics',
	schema: {
		input: s.object({ query: s.string() }),
		output: s.object({ results: s.any() })
	},
	handler: async (ctx, input) => {
		const response: ApiResponse<Paginated<string>> = {
			data: { items: [], total: 0 },
			meta: { timestamp: Date.now() }
		};
		return { results: response };
	}
});

export default genericAgent;
		`;
		writeFileSync(agentFile, code);

		const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'bun' });
		const transpiled = transpiler.transformSync(code);

		const result = await parseAgentMetadata(TEST_DIR, agentFile, transpiled, 'proj_1', 'dep_1');

		expect(result).toBeDefined();
		const [, metadata] = result!;
		expect(metadata.get('name')).toBe('generic-agent');
	});
});
