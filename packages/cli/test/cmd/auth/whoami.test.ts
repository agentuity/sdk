import { describe, expect, mock, test } from 'bun:test';
import type { CommandContext } from '../../../src/types';

mock.module('@agentuity/server', () => ({
	whoami: mock(async () => ({
		firstName: 'Test',
		lastName: 'User',
		organizations: [{ id: 'org_test', name: 'Test Org' }],
	})),
}));

import { whoamiCommand } from '../../../src/cmd/auth/whoami';

describe('auth whoami command', () => {
	test('returns JSON data without writing duplicate JSON output', async () => {
		const log = mock(() => {});
		const originalLog = console.log;
		console.log = log;

		try {
			const result = await whoamiCommand.handler({
				apiClient: {},
				auth: {
					apiKey: 'ag_test',
					userId: 'usr_test',
					expires: new Date(Date.now() + 60_000),
				},
				options: { json: true },
			} as CommandContext);

			expect(result).toEqual({
				userId: 'usr_test',
				firstName: 'Test',
				lastName: 'User',
				organizations: [{ id: 'org_test', name: 'Test Org' }],
			});
			expect(log).not.toHaveBeenCalled();
		} finally {
			console.log = originalLog;
		}
	});
});
