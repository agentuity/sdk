import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mockFetch } from '@agentuity/test-utils';
import { CoderClient } from '../src/services/coder/client.ts';
import { APIError, ValidationInputError } from '../src/services/api.ts';
import {
	CoderCreateAgentBuilderSessionRequestSchema,
	CoderCreateWorkspaceRequestSchema,
} from '../src/services/coder/types.ts';

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
		enabledAgents: [],
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
		instructions: 'Focus on correctness, regressions, and missing tests.',
		headlessCompatible: true,
		tools: ['read', 'grep', 'ls'],
		serviceTools: ['session_todo_list', 'session_todo_update'],
		companionAgents: [],
		savedSkills: [],
		...overrides,
	};
}

function makeWorkspace(overrides: Record<string, unknown> = {}) {
	return {
		id: 'hworkspace_test123',
		name: 'Workspace Test',
		description: 'Workspace description',
		scope: 'org',
		ownerUserId: 'user_test',
		repos: [],
		repoCount: 0,
		savedSkillIds: [],
		skillBucketIds: [],
		enabledAgents: [],
		selectionCount: 0,
		createdAt: '2026-04-08T00:00:00.000Z',
		updatedAt: '2026-04-08T00:00:00.000Z',
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

describe('CoderClient enabled agent roster contract', () => {
	beforeEach(() => {
		globalThis.fetch = ORIGINAL_FETCH;
	});

	afterEach(() => {
		globalThis.fetch = ORIGINAL_FETCH;
	});

	test('session and workspace request types accept enabledAgents', () => {
		const createSessionBody: Parameters<CoderClient['createSession']>[0] = {
			task: 'Review this change',
			enabledAgents: ['code-review'],
		};
		const updateSessionBody: Parameters<CoderClient['updateSession']>[1] = {
			enabledAgents: ['code-review'],
		};
		const createWorkspaceBody: Parameters<CoderClient['createWorkspace']>[0] = {
			name: 'My Workspace',
			enabledAgents: ['code-review'],
		};

		expect(createSessionBody.enabledAgents).toEqual(['code-review']);
		expect(updateSessionBody.enabledAgents).toEqual(['code-review']);
		expect(createWorkspaceBody.enabledAgents).toEqual(['code-review']);
	});

	test('workspace create schema rejects a name-only request', () => {
		const result = CoderCreateWorkspaceRequestSchema.safeParse({
			name: 'My Workspace',
		});

		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						message:
							'A workspace needs at least one repo, saved skill, skill bucket, or agent',
					}),
				])
			);
		}
	});

	test('createWorkspace rejects an empty workspace body before sending a request', async () => {
		const fetchMock = mockFetch(async () => {
			throw new Error('unexpected fetch');
		});

		const client = new CoderClient({
			apiKey: 'ag_test',
			url: 'https://coder.example',
			orgId: 'org_test',
		});

		let error: unknown;
		try {
			await client.createWorkspace({
				name: 'My Workspace',
			});
		} catch (ex) {
			error = ex;
		}

		expect(error).toBeInstanceOf(ValidationInputError);
		expect(error).toMatchObject({
			issues: expect.arrayContaining([
				expect.objectContaining({
					message: 'A workspace needs at least one repo, saved skill, skill bucket, or agent',
				}),
			]),
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test('createSession sends enabledAgents in the request body', async () => {
		mockFetch(async (url, init) => {
			expect(url).toBe('https://coder.example/api/hub/session');
			expect(init?.method).toBe('POST');
			expect(init?.body).toContain('"enabledAgents":["code-review","qa-team"]');
			return new Response(
				JSON.stringify({
					sessionId: 'codesess_enabled_create',
					status: 'active',
				}),
				{
					status: 201,
					headers: { 'content-type': 'application/json' },
				}
			);
		});

		const client = new CoderClient({
			apiKey: 'ag_test',
			url: 'https://coder.example',
			orgId: 'org_test',
		});

		await expect(
			client.createSession({
				task: 'Review this change',
				enabledAgents: ['code-review', 'qa-team'],
			})
		).resolves.toMatchObject({
			sessionId: 'codesess_enabled_create',
			status: 'active',
		});
	});

	test('updateSession sends enabledAgents in the request body', async () => {
		mockFetch(async (url, init) => {
			expect(url).toBe('https://coder.example/api/hub/session/codesess_enabled_update');
			expect(init?.method).toBe('PATCH');
			expect(init?.body).toContain('"enabledAgents":["code-review"]');
			return new Response(
				JSON.stringify({
					sessionId: 'codesess_enabled_update',
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

		await expect(
			client.updateSession('codesess_enabled_update', {
				enabledAgents: ['code-review'],
			})
		).resolves.toMatchObject({
			sessionId: 'codesess_enabled_update',
		});
	});

	test('createWorkspace sends enabledAgents in the request body', async () => {
		mockFetch(async (url, init) => {
			expect(url).toBe('https://coder.example/api/hub/workspaces');
			expect(init?.method).toBe('POST');
			expect(init?.body).toContain('"enabledAgents":["code-review","qa-team"]');
			return new Response(
				JSON.stringify({
					workspace: makeWorkspace({
						id: 'hworkspace_enabled_create',
						enabledAgents: ['code-review', 'qa-team'],
						selectionCount: 2,
					}),
				}),
				{
					status: 201,
					headers: { 'content-type': 'application/json' },
				}
			);
		});

		const client = new CoderClient({
			apiKey: 'ag_test',
			url: 'https://coder.example',
			orgId: 'org_test',
		});

		await expect(
			client.createWorkspace({
				name: 'My Workspace',
				enabledAgents: ['code-review', 'qa-team'],
			})
		).resolves.toMatchObject({
			id: 'hworkspace_enabled_create',
			enabledAgents: ['code-review', 'qa-team'],
		});
	});

	test('createWorkspace preserves server validation text returned in the error field', async () => {
		mockFetch(async (url, init) => {
			expect(url).toBe('https://coder.example/api/hub/workspaces');
			expect(init?.method).toBe('POST');
			return new Response(
				JSON.stringify({
					error: 'One or more selected saved skills do not exist.',
				}),
				{
					status: 400,
					headers: { 'content-type': 'application/json' },
				}
			);
		});

		const client = new CoderClient({
			apiKey: 'ag_test',
			url: 'https://coder.example',
			orgId: 'org_test',
		});

		let error: unknown;
		try {
			await client.createWorkspace({
				name: 'My Workspace',
				enabledAgents: ['code-review'],
			});
		} catch (ex) {
			error = ex;
		}

		expect(error).toBeInstanceOf(APIError);
		expect(error).toMatchObject({
			status: 400,
			message: 'One or more selected saved skills do not exist.',
		});
	});

	test('getSession preserves enabledAgents from the hub response', async () => {
		mockFetch(async (url, init) => {
			expect(url).toBe('https://coder.example/api/hub/session/codesess_enabled_read');
			expect(init?.method).toBe('GET');
			return new Response(
				JSON.stringify(
					makeSession({
						sessionId: 'codesess_enabled_read',
						enabledAgents: ['code-review', 'qa-team'],
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

		const session = await client.getSession('codesess_enabled_read');
		expect(session.enabledAgents).toEqual(['code-review', 'qa-team']);
		expect('agentSlugs' in session).toBe(false);
	});

	test('getWorkspace preserves enabledAgents from the hub response', async () => {
		mockFetch(async (url, init) => {
			expect(url).toBe('https://coder.example/api/hub/workspaces/hworkspace_enabled_read');
			expect(init?.method).toBe('GET');
			return new Response(
				JSON.stringify({
					workspace: makeWorkspace({
						id: 'hworkspace_enabled_read',
						selectedEnabledAgents: ['code-review'],
						enabledAgents: ['code-review', 'qa-team'],
						selectionCount: 2,
					}),
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

		const workspace = await client.getWorkspace('hworkspace_enabled_read');
		expect(workspace.enabledAgents).toEqual(['code-review', 'qa-team']);
		expect(workspace.selectedEnabledAgents).toEqual(['code-review']);
		expect('agentSlugs' in workspace).toBe(false);
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

		await expect(
			client.createCustomAgent({
				slug: 'code-review',
				displayName: 'Code Review',
				instructions: 'Focus on correctness, regressions, and missing tests.',
				tools: ['read', 'grep', 'ls'],
				serviceTools: ['session_todo_list', 'session_todo_update'],
				savedSkillIds: ['saved_1'],
			})
		).resolves.toMatchObject({
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

	test('listCustomAgents tolerates unknown tool names returned by the backend', async () => {
		mockFetch(async (url, init) => {
			expect(url).toBe('https://coder.example/api/hub/agents');
			expect(init?.method).toBe('GET');
			return new Response(
				JSON.stringify({
					agents: [
						makeCustomAgent({
							tools: ['read', 'future_pi_tool'],
							serviceTools: ['session_todo_list', 'future_hub_tool'],
						}),
					],
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

		const response = await client.listCustomAgents();
		expect(response.agents[0]?.tools).toEqual(['read', 'future_pi_tool']);
		expect(response.agents[0]?.serviceTools).toEqual(['session_todo_list', 'future_hub_tool']);
	});

	test('listCustomAgents defaults missing companionAgents to an empty array', async () => {
		mockFetch(async (url, init) => {
			expect(url).toBe('https://coder.example/api/hub/agents');
			expect(init?.method).toBe('GET');
			return new Response(
				JSON.stringify({
					agents: [
						makeCustomAgent({
							companionAgents: undefined,
						}),
					],
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

		const response = await client.listCustomAgents();
		expect(response.agents[0]?.companionAgents).toEqual([]);
	});

	test('publishCustomAgent posts to the publish endpoint and returns the updated agent', async () => {
		mockFetch(async (url, init) => {
			expect(url).toBe('https://coder.example/api/hub/agents/code-review/publish');
			expect(init?.method).toBe('POST');
			return new Response(
				JSON.stringify({
					agent: makeCustomAgent({
						lifecycle: 'published',
						visibility: 'org',
						hasPublishedVersion: true,
						latestPublishedVersion: 1,
					}),
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

		await expect(client.publishCustomAgent('code-review')).resolves.toMatchObject({
			lifecycle: 'published',
			latestPublishedVersion: 1,
		});
	});
});

describe('CoderClient agent-builder helpers', () => {
	beforeEach(() => {
		globalThis.fetch = ORIGINAL_FETCH;
	});

	afterEach(() => {
		globalThis.fetch = ORIGINAL_FETCH;
	});

	test('createAgentBuilderSession posts to the builder-session endpoint', async () => {
		mockFetch(async (url, init) => {
			expect(url).toBe('https://coder.example/api/hub/session/builder');
			expect(init?.method).toBe('POST');
			expect(init?.body).toContain('"mode":"from_session"');
			expect(init?.body).toContain('"sourceSessionId":"codesess_source_1"');
			return new Response(
				JSON.stringify({
					sessionId: 'codesess_builder_1',
					status: 'creating',
					visibility: 'private',
				}),
				{
					status: 201,
					headers: { 'content-type': 'application/json' },
				}
			);
		});

		const client = new CoderClient({
			apiKey: 'ag_test',
			url: 'https://coder.example',
			orgId: 'org_test',
		});

		await expect(
			client.createAgentBuilderSession({
				mode: 'from_session',
				sourceSessionId: 'codesess_source_1',
				label: 'Build from release triage',
			})
		).resolves.toMatchObject({
			sessionId: 'codesess_builder_1',
			status: 'creating',
		});
	});

	test('createAgentBuilderSession rejects invalid mode-specific payloads before sending', async () => {
		let fetchCalled = false;
		mockFetch(async () => {
			fetchCalled = true;
			throw new Error('fetch should not be called for invalid builder payloads');
		});

		const client = new CoderClient({
			apiKey: 'ag_test',
			url: 'https://coder.example',
			orgId: 'org_test',
		});

		const missingSource = CoderCreateAgentBuilderSessionRequestSchema.safeParse({
			mode: 'from_session',
		});
		expect(missingSource.success).toBe(false);
		if (missingSource.success) throw new Error('Expected missingSource to fail validation');
		expect(missingSource.error.issues).toContainEqual(
			expect.objectContaining({
				path: ['sourceSessionId'],
				message: 'sourceSessionId is required for from-session builder launches.',
			})
		);

		const missingTarget = CoderCreateAgentBuilderSessionRequestSchema.safeParse({
			mode: 'edit',
		});
		expect(missingTarget.success).toBe(false);
		if (missingTarget.success) throw new Error('Expected missingTarget to fail validation');
		expect(missingTarget.error.issues).toContainEqual(
			expect.objectContaining({
				path: ['targetAgentId'],
				message: 'targetAgentId or targetAgentSlug is required for edit launches.',
			})
		);

		expect(
			CoderCreateAgentBuilderSessionRequestSchema.safeParse({
				mode: 'new',
				targetAgentId: 'agt_123',
			}).success
		).toBe(true);

		await expect(
			client.createAgentBuilderSession({
				mode: 'from_session',
			})
		).rejects.toThrow('There was an error validating the API input data.');

		await expect(
			client.createAgentBuilderSession({
				mode: 'edit',
			})
		).rejects.toThrow('There was an error validating the API input data.');

		expect(fetchCalled).toBe(false);
	});

	test('session payloads preserve builder detail projections from the backend', async () => {
		let getCount = 0;

		mockFetch(async (url, init) => {
			if (url === 'https://coder.example/api/hub/session/codesess_builder_1') {
				getCount += 1;
				return new Response(
					JSON.stringify(
						makeSession({
							sessionId: 'codesess_builder_1',
							sessionKind: 'agent_builder',
							builder: {
								mode: 'edit',
								targetAgent: {
									agentId: 'agt_123',
									slug: 'qa-team',
									displayName: 'QA Team',
								},
								proposal: {
									displayName: 'QA Team',
									tools: ['read', 'grep'],
									serviceTools: ['session_dashboard'],
									savedSkills: [],
									companionAgents: ['reviewer'],
								},
							},
						})
					),
					{
						status: 200,
						headers: { 'content-type': 'application/json' },
					}
				);
			}

			if (url === 'https://coder.example/api/hub/sessions') {
				return new Response(
					JSON.stringify({
						sessions: {
							websocket: [
								makeSession({
									sessionId: 'codesess_builder_1',
									sessionKind: 'agent_builder',
									builder: {
										mode: 'from_session',
										sourceSession: {
											sessionId: 'codesess_source_1',
											label: 'Recurring triage',
										},
									},
								}),
							],
							sandbox: [],
						},
						total: 1,
					}),
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

		const detail = await client.getSession('codesess_builder_1');
		expect(detail.builder).toEqual(
			expect.objectContaining({
				mode: 'edit',
				targetAgent: {
					agentId: 'agt_123',
					slug: 'qa-team',
					displayName: 'QA Team',
				},
				proposal: expect.objectContaining({
					displayName: 'QA Team',
					tools: ['read', 'grep'],
					serviceTools: ['session_dashboard'],
					companionAgents: ['reviewer'],
				}),
			})
		);

		const sessions = await client.listSessions();
		expect(sessions.sessions[0]?.sessionKind).toBe('agent_builder');
		expect(sessions.sessions[0]?.builder).toEqual({
			mode: 'from_session',
			sourceSession: {
				sessionId: 'codesess_source_1',
				label: 'Recurring triage',
			},
		});
		expect(getCount).toBe(1);
	});
});
