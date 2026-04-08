import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mockFetch } from '@agentuity/test-utils';
import { CoderClient } from '../src/services/coder/client.ts';

const ORIGINAL_FETCH = globalThis.fetch;

function makeSession(overrides: Record<string, unknown> = {}) {
	return {
		sessionId: 'codesess_test123',
		label: 'Remote Attach Test',
		status: 'paused',
		mode: 'sandbox',
		visibility: 'private',
		workflowMode: 'standard',
		createdAt: '2026-04-03T00:00:00.000Z',
		lastActivityAt: '2026-04-03T00:00:00.000Z',
		taskCount: 0,
		subAgentCount: 0,
		observerCount: 0,
		participantCount: 0,
		tags: [],
		skills: [],
		agentSlugs: [],
		bucket: 'paused',
		runtimeAvailable: false,
		controlAvailable: false,
		wakeAvailable: true,
		historyOnly: false,
		liveExpected: false,
		...overrides,
	};
}

function makeCustomAgent(overrides: Record<string, unknown> = {}) {
	return {
		id: 'hagent_test123',
		ownerUserId: 'user_test',
		lifecycle: 'draft',
		visibility: 'private_draft',
		createdAt: '2026-04-07T00:00:00.000Z',
		updatedAt: '2026-04-07T00:00:00.000Z',
		hasPublishedVersion: false,
		hasUnpublishedChanges: false,
		slug: 'code-review',
		displayName: 'Code Review',
		description: 'Review changes for regressions',
		preset: 'reviewer',
		toolProfile: 'reviewer',
		instructions: 'Focus on correctness, regressions, and missing tests.',
		headlessCompatible: true,
		savedSkills: [],
		...overrides,
	};
}

describe('CoderClient remote attach helpers', () => {
	beforeEach(() => {
		globalThis.fetch = ORIGINAL_FETCH;
	});

	afterEach(() => {
		globalThis.fetch = ORIGINAL_FETCH;
	});

	test('resumeSession posts to the resume endpoint', async () => {
		mockFetch(async (url, init) => {
			expect(url).toBe('https://coder.example/api/hub/session/codesess_resume/resume');
			expect(init?.method).toBe('POST');
			return new Response(JSON.stringify({ sessionId: 'codesess_resume', status: 'resuming' }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		});

		const client = new CoderClient({
			apiKey: 'ag_test',
			url: 'https://coder.example',
			orgId: 'org_test',
		});

		await expect(client.resumeSession('codesess_resume')).resolves.toMatchObject({
			sessionId: 'codesess_resume',
			status: 'resuming',
		});
	});

	test('prepareSessionForRemoteAttach returns immediately for an attachable paused session', async () => {
		mockFetch(async (url) => {
			expect(url).toBe('https://coder.example/api/hub/session/codesess_live');
			return new Response(
				JSON.stringify(
					makeSession({
						runtimeAvailable: true,
						controlAvailable: false,
						liveExpected: true,
					})
				),
				{
					status: 200,
					headers: { 'content-type': 'application/json' },
				}
			);
		});

		const client = new CoderClient({
			apiKey: 'ag_test',
			url: 'https://coder.example',
			orgId: 'org_test',
		});

		const session = await client.prepareSessionForRemoteAttach('codesess_live', {
			timeoutMs: 25,
			pollIntervalMs: 1,
		});

		expect(session.runtimeAvailable).toBe(true);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		expect(globalThis.fetch as any).toHaveBeenCalledTimes(1);
	});

	test('prepareSessionForRemoteAttach resumes an evicted paused session and waits for runtime', async () => {
		let getCount = 0;

		mockFetch(async (url, init) => {
			if (
				url === 'https://coder.example/api/hub/session/codesess_cold' &&
				init?.method === 'GET'
			) {
				getCount += 1;
				const runtimeAvailable = getCount >= 3;
				return new Response(
					JSON.stringify(
						makeSession({
							status: runtimeAvailable ? 'active' : 'paused',
							bucket: runtimeAvailable ? 'running' : 'paused',
							runtimeAvailable,
							controlAvailable: runtimeAvailable,
							liveExpected: runtimeAvailable,
						})
					),
					{
						status: 200,
						headers: { 'content-type': 'application/json' },
					}
				);
			}

			if (
				url === 'https://coder.example/api/hub/session/codesess_cold/resume' &&
				init?.method === 'POST'
			) {
				return new Response(
					JSON.stringify({ sessionId: 'codesess_cold', status: 'resuming' }),
					{
						status: 200,
						headers: { 'content-type': 'application/json' },
					}
				);
			}

			throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`);
		});

		const client = new CoderClient({
			apiKey: 'ag_test',
			url: 'https://coder.example',
			orgId: 'org_test',
		});

		const session = await client.prepareSessionForRemoteAttach('codesess_cold', {
			timeoutMs: 100,
			pollIntervalMs: 1,
		});

		expect(session.runtimeAvailable).toBe(true);
		expect(session.status).toBe('active');
		expect(getCount).toBe(3);
	});

	test('prepareSessionForRemoteAttach retries transient getSession failures while polling', async () => {
		let getCount = 0;

		mockFetch(async (url, init) => {
			if (
				url === 'https://coder.example/api/hub/session/codesess_retry' &&
				init?.method === 'GET'
			) {
				getCount += 1;
				if (getCount === 2) {
					return new Response(JSON.stringify({ code: 'CODER_SESSION_NOT_FOUND' }), {
						status: 404,
						headers: { 'content-type': 'application/json' },
					});
				}
				const runtimeAvailable = getCount >= 3;
				return new Response(
					JSON.stringify(
						makeSession({
							sessionId: 'codesess_retry',
							status: runtimeAvailable ? 'active' : 'paused',
							bucket: runtimeAvailable ? 'running' : 'paused',
							runtimeAvailable,
							controlAvailable: runtimeAvailable,
							liveExpected: runtimeAvailable,
						})
					),
					{
						status: 200,
						headers: { 'content-type': 'application/json' },
					}
				);
			}

			if (
				url === 'https://coder.example/api/hub/session/codesess_retry/resume' &&
				init?.method === 'POST'
			) {
				return new Response(
					JSON.stringify({ sessionId: 'codesess_retry', status: 'resuming' }),
					{
						status: 200,
						headers: { 'content-type': 'application/json' },
					}
				);
			}

			throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`);
		});

		const client = new CoderClient({
			apiKey: 'ag_test',
			url: 'https://coder.example',
			orgId: 'org_test',
		});

		const session = await client.prepareSessionForRemoteAttach('codesess_retry', {
			timeoutMs: 100,
			pollIntervalMs: 1,
		});

		expect(session.runtimeAvailable).toBe(true);
		expect(session.status).toBe('active');
		expect(getCount).toBe(3);
	});

	test('listConnectableSessions filters the general session list to attachable sandbox sessions', async () => {
		mockFetch(async (url) => {
			expect(url).toBe('https://coder.example/api/hub/sessions?includeArchived=true');
			return new Response(
				JSON.stringify({
					sessions: {
						websocket: [
							makeSession({
								sessionId: 'codesess_running',
								status: 'active',
								bucket: 'running',
								runtimeAvailable: true,
								controlAvailable: true,
								liveExpected: true,
							}),
							makeSession({
								sessionId: 'codesess_paused',
							}),
							makeSession({
								sessionId: 'codesess_paused_dead',
								wakeAvailable: false,
								runtimeAvailable: false,
							}),
							makeSession({
								sessionId: 'codesess_history',
								status: 'shutdown',
								bucket: 'history',
								historyOnly: true,
								wakeAvailable: false,
							}),
							makeSession({
								sessionId: 'codesess_tui',
								mode: 'tui',
								status: 'active',
								bucket: 'running',
								runtimeAvailable: true,
								controlAvailable: true,
								liveExpected: true,
							}),
						],
						sandbox: [],
					},
					total: 4,
				}),
				{
					status: 200,
					headers: { 'content-type': 'application/json' },
				}
			);
		});

		const client = new CoderClient({
			apiKey: 'ag_test',
			url: 'https://coder.example',
			orgId: 'org_test',
		});

		const response = await client.listConnectableSessions();

		expect(response.total).toBe(2);
		expect(response.sessions.map((session) => session.sessionId)).toEqual([
			'codesess_running',
			'codesess_paused',
		]);
	});

	test('listConnectableSessions normalizes negative offset and limit values', async () => {
		mockFetch(async (url) => {
			expect(url).toBe('https://coder.example/api/hub/sessions?includeArchived=true');
			return new Response(
				JSON.stringify({
					sessions: {
						websocket: [
							makeSession({
								sessionId: 'codesess_running',
								status: 'active',
								bucket: 'running',
								runtimeAvailable: true,
								controlAvailable: true,
								liveExpected: true,
							}),
							makeSession({
								sessionId: 'codesess_paused',
							}),
						],
						sandbox: [],
					},
					total: 2,
				}),
				{
					status: 200,
					headers: { 'content-type': 'application/json' },
				}
			);
		});

		const client = new CoderClient({
			apiKey: 'ag_test',
			url: 'https://coder.example',
			orgId: 'org_test',
		});

		const response = await client.listConnectableSessions({
			limit: -2,
			offset: -5,
		});

		expect(response.sessions).toHaveLength(0);
		expect(response.limit).toBe(0);
		expect(response.offset).toBe(0);
		expect(response.total).toBe(2);
	});
});

describe('CoderClient custom agent helpers', () => {
	beforeEach(() => {
		globalThis.fetch = ORIGINAL_FETCH;
	});

	afterEach(() => {
		globalThis.fetch = ORIGINAL_FETCH;
	});

	test('createCustomAgent posts to the custom agent library endpoint', async () => {
		mockFetch(async (url, init) => {
			expect(url).toBe('https://coder.example/api/hub/agents');
			expect(init?.method).toBe('POST');
			expect(init?.body).toContain('"slug":"code-review"');
			return new Response(JSON.stringify({ agent: makeCustomAgent() }), {
				status: 201,
				headers: { 'content-type': 'application/json' },
			});
		});

		const client = new CoderClient({
			apiKey: 'ag_test',
			url: 'https://coder.example',
			orgId: 'org_test',
		});

		await expect(client.createCustomAgent({
			slug: 'code-review',
			displayName: 'Code Review',
			preset: 'reviewer',
			instructions: 'Focus on correctness, regressions, and missing tests.',
			savedSkillIds: ['saved_1'],
		})).resolves.toMatchObject({
			slug: 'code-review',
			displayName: 'Code Review',
		});
	});

	test('listCustomAgents includes the archived query flag', async () => {
		mockFetch(async (url, init) => {
			expect(url).toBe('https://coder.example/api/hub/agents?includeArchived=true');
			expect(init?.method).toBe('GET');
			return new Response(JSON.stringify({ agents: [makeCustomAgent()] }), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		});

		const client = new CoderClient({
			apiKey: 'ag_test',
			url: 'https://coder.example',
			orgId: 'org_test',
		});

		const response = await client.listCustomAgents({ includeArchived: true });
		expect(response.agents).toHaveLength(1);
		expect(response.agents[0]?.slug).toBe('code-review');
	});

	test('publishCustomAgent posts to the publish endpoint and returns the updated agent', async () => {
		mockFetch(async (url, init) => {
			expect(url).toBe('https://coder.example/api/hub/agents/code-review/publish');
			expect(init?.method).toBe('POST');
			return new Response(JSON.stringify({
				agent: makeCustomAgent({
					lifecycle: 'published',
					visibility: 'org',
					hasPublishedVersion: true,
					latestPublishedVersion: 1,
				}),
			}), {
				status: 200,
				headers: { 'content-type': 'application/json' },
			});
		});

		const client = new CoderClient({
			apiKey: 'ag_test',
			url: 'https://coder.example',
			orgId: 'org_test',
		});

		await expect(client.publishCustomAgent('code-review')).resolves.toMatchObject({
			lifecycle: 'published',
			latestPublishedVersion: 1,
		});
	});
});
