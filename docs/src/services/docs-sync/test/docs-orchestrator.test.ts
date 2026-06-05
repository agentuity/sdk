import { expect, test } from 'bun:test';
import { syncDocsFromPayload } from '../docs-orchestrator';
import type { DocsSyncContext } from '../docs-orchestrator';

function makeLogger() {
	return {
		debug: () => undefined,
		error: () => undefined,
		info: () => undefined,
		warn: () => undefined,
	};
}

function makeContext(vector: Partial<DocsSyncContext['vector']>): DocsSyncContext {
	return {
		logger: makeLogger(),
		vector: {
			async delete(): Promise<number> {
				return 0;
			},
			async search(): Promise<{ key: string }[]> {
				return [];
			},
			async upsert(): Promise<void> {
				return undefined;
			},
			async getStats(): Promise<{ count: number }> {
				return { count: 0 };
			},
			async deleteNamespace(): Promise<void> {
				return undefined;
			},
			...vector,
		},
	};
}

test('incremental sync does not clear the vector namespace', async () => {
	const calls: string[] = [];
	const ctx = makeContext({
		async getStats(name: string): Promise<{ count: number }> {
			calls.push(`getStats:${name}`);
			return { count: 12 };
		},
		async deleteNamespace(name: string): Promise<void> {
			calls.push(`deleteNamespace:${name}`);
		},
	});

	const stats = await syncDocsFromPayload(ctx, {
		mode: 'incremental',
		changed: [],
		removed: [],
	});

	expect(stats.deleted).toBe(0);
	expect(calls).toEqual([]);
});

test('default sync mode is incremental', async () => {
	const calls: string[] = [];
	const ctx = makeContext({
		async getStats(name: string): Promise<{ count: number }> {
			calls.push(`getStats:${name}`);
			return { count: 12 };
		},
		async deleteNamespace(name: string): Promise<void> {
			calls.push(`deleteNamespace:${name}`);
		},
	});

	const stats = await syncDocsFromPayload(ctx, {
		changed: [],
		removed: [],
	});

	expect(stats.deleted).toBe(0);
	expect(calls).toEqual([]);
});

test('full sync clears the vector namespace once before ingesting batches', async () => {
	const calls: string[] = [];
	const ctx = makeContext({
		async getStats(name: string): Promise<{ count: number }> {
			calls.push(`getStats:${name}`);
			return { count: 42 };
		},
		async deleteNamespace(name: string): Promise<void> {
			calls.push(`deleteNamespace:${name}`);
		},
	});

	const stats = await syncDocsFromPayload(ctx, {
		mode: 'full',
		changed: [],
		removed: [],
	});

	expect(stats.deleted).toBe(42);
	expect(calls).toEqual(['getStats:agentuity-docs', 'deleteNamespace:agentuity-docs']);
});

test('invalid base64 changed file is counted as a file error', async () => {
	const ctx = makeContext({
		async search(): Promise<[]> {
			return [];
		},
		async upsert(): Promise<void> {
			throw new Error('upsert should not run for invalid base64');
		},
	});

	const stats = await syncDocsFromPayload(ctx, {
		changed: [{ path: 'broken.mdx', content: 'not-base64!' }],
	});

	expect(stats).toEqual({
		processed: 0,
		deleted: 0,
		errors: 1,
		errorFiles: ['broken.mdx'],
	});
});
