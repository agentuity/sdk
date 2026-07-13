import { describe, expect, mock, test } from 'bun:test';
import { z } from 'zod';
import type { CommandContext } from '../../../../src/types';

const dbQuery = mock(async () => ({
	rows: [{ result: 1 }],
	rowCount: 1,
	truncated: false,
}));

const getCatalystAPIClient = mock(() => ({ regional: true }));

mock.module('@agentuity/server', () => ({
	listOrgResources: mock(async () => ({
		db: [
			{
				name: 'my-db',
				cloud_region: 'usw',
				org_id: 'org_owner',
				org_name: 'Owner Org',
				url: 'postgres://example',
				description: '',
			},
		],
	})),
	// types.ts composes these into schemas at module-eval time.
	DeploymentConfig: z.any(),
	ProjectBuildConfig: z.any(),
	BuildMetadataSchema: z.any(),
}));

mock.module('@agentuity/db', () => ({ dbQuery }));

mock.module('../../../../src/config', () => ({
	getCatalystAPIClient,
	getGlobalCatalystAPIClient: mock(async () => ({ global: true })),
}));

mock.module('../../../../src/cache/index.ts', () => ({
	setResourceInfo: mock(async () => {}),
}));

mock.module('../../../../src/tui', () => ({
	spinner: async ({ callback }: { callback: () => Promise<unknown> }) => callback(),
	table: mock(() => {}),
	success: mock(() => {}),
	info: mock(() => {}),
	newline: mock(() => {}),
	fatal: mock((msg: string) => {
		throw new Error(msg);
	}),
	bold: (s: string) => s,
}));

describe('cloud db sql command', () => {
	test("runs the query in the database's own region, not the ambient region", async () => {
		dbQuery.mockClear();
		getCatalystAPIClient.mockClear();

		const { sqlSubcommand } = await import('../../../../src/cmd/cloud/db/sql');

		await sqlSubcommand.handler({
			logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
			args: { name: 'my-db', query: 'select 1' },
			options: { json: true },
			orgId: 'org_ambient',
			region: 'usc',
			auth: { apiKey: 'ag_test', userId: 'usr_test', expires: new Date(Date.now() + 60_000) },
			config: { name: 'production' },
		} as unknown as CommandContext);

		// The database lives in usw; the ambient CLI region is usc. The regional
		// client and the query must both target the database's real region.
		const regionalCall = getCatalystAPIClient.mock.calls[0];
		expect(regionalCall?.[2]).toBe('usw');

		const queryRequest = dbQuery.mock.calls[0]?.[1] as { region: string; orgId: string };
		expect(queryRequest.region).toBe('usw');
		expect(queryRequest.orgId).toBe('org_owner');
	});
});
