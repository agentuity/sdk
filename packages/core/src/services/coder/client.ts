import type { Logger } from '../../logger.ts';
import { z } from 'zod/v4';
import { APIClient } from '../api.ts';
import { getServiceUrls } from '../config.ts';
import { getEnv } from '../env.ts';
import { createMinimalLogger } from '../logger.ts';
import { discoverUrl } from './discover.ts';
import {
	coderArchiveSession,
	coderCreateAgentBuilderSession,
	type CoderCreateSessionResponse,
	type CoderLifecycleResponse,
	coderCreateSession,
	coderDeleteSession,
	coderGetSession,
	coderListConnectableSessions,
	coderListSessions,
	coderResumeSession,
	coderUpdateSession,
	type CoderCreateSessionParams,
	type CoderUpdateSessionResponse,
	type CoderListConnectableSessionsParams,
	type CoderListSessionsParamsWithOrg,
} from './sessions.ts';
import {
	coderArchiveCustomAgent,
	coderCreateCustomAgent,
	coderGetCustomAgent,
	coderListCustomAgents,
	coderListCustomAgentVersions,
	coderPublishCustomAgent,
	coderUpdateCustomAgent,
} from './agents.ts';
import {
	coderCreateSkillBucket,
	coderDeleteSavedSkill,
	coderDeleteSkillBucket,
	coderListSavedSkills,
	coderListSkillBuckets,
	coderSaveSkill,
} from './skills.ts';
import {
	coderCreateWorkspace,
	coderDeleteWorkspace,
	coderGetWorkspace,
	coderListWorkspaces,
} from './workspaces.ts';
import { coderListGitHubAccounts, coderListGitHubRepos } from './github.ts';
import { coderGetLoopState, type CoderGetLoopStateParams } from './loop-state.ts';
import {
	coderGetReplay,
	coderListEventHistory,
	coderListParticipants,
	type CoderGetSessionReplayParams,
	type CoderListEventHistoryParams,
	type CoderListParticipantsParams,
} from './session-data.ts';
import { coderListUsers, type CoderListUsersParamsWithOrg } from './users.ts';
import type {
	CoderGitHubAccountListResponse,
	CoderGitHubRepositoryListResponse,
	CoderCustomAgent,
	CoderCustomAgentListResponse,
	CoderCustomAgentVersionListResponse,
	CoderCreateAgentBuilderSessionRequest,
	CoderCreateCustomAgentRequest,
	CoderListUsersResponse,
	CoderSavedSkill,
	CoderSavedSkillListResponse,
	CoderLoopStateResponse,
	CoderSession,
	CoderSessionEventHistory,
	CoderSessionListResponse,
	CoderSessionParticipants,
	CoderSessionReplay,
	CoderSkillBucket,
	CoderSkillBucketListResponse,
	CoderCreateSkillBucketRequest,
	CoderUpdateCustomAgentRequest,
	CoderCreateWorkspaceRequest,
	CoderWorkspaceDetail,
	CoderWorkspaceListResponse,
	CoderSaveSkillRequest,
	CoderUpdateSessionRequest,
} from './types.ts';
import { normalizeCoderUrl } from './util.ts';

export const CoderClientOptionsSchema = z
	.object({
		apiKey: z.string().optional().describe('API key for authentication'),
		url: z.string().optional().describe('Base URL for the Coder HTTP API'),
		region: z.string().optional().describe('Region used for Catalyst URL resolution'),
		orgId: z.string().optional().describe('Organization ID for multi-tenant operations'),
		logger: z.custom<Logger>().optional().describe('Custom logger implementation'),
	})
	.describe('Configuration options for constructing a CoderClient');
export type CoderClientOptions = z.infer<typeof CoderClientOptionsSchema>;

export interface CoderRemoteAttachPreparationOptions {
	timeoutMs?: number;
	pollIntervalMs?: number;
}

/**
 * Ergonomic client for Coder session management APIs.
 *
 * URL resolution strategy:
 * 1) options.url
 * 2) AGENTUITY_CODER_URL
 * 3) discover via Catalyst GET /coder
 */
export class CoderClient {
	readonly #apiKey?: string;
	readonly #orgId?: string;
	readonly #region: string;
	readonly #logger: Logger;
	readonly #explicitUrl?: string;
	#resolvedUrl?: string;
	#client?: APIClient;
	#clientPromise?: Promise<APIClient>;

	constructor(options: CoderClientOptions = {}) {
		this.#apiKey = options.apiKey ?? getEnv('AGENTUITY_SDK_KEY') ?? getEnv('AGENTUITY_CLI_KEY');
		this.#orgId = options.orgId;
		this.#region = options.region ?? getEnv('AGENTUITY_REGION') ?? 'usc';
		this.#logger = options.logger ?? createMinimalLogger();
		this.#explicitUrl = options.url;
	}

	/**
	 * Gets the active coder base URL, discovering it from Catalyst if needed.
	 */
	async getUrl(): Promise<string> {
		if (this.#resolvedUrl) {
			return this.#resolvedUrl;
		}

		if (this.#explicitUrl) {
			this.#resolvedUrl = normalizeCoderUrl(this.#explicitUrl);
			return this.#resolvedUrl;
		}

		const envUrl = getEnv('AGENTUITY_CODER_URL');
		if (envUrl) {
			this.#resolvedUrl = normalizeCoderUrl(envUrl);
			return this.#resolvedUrl;
		}

		const catalystUrl = getServiceUrls(this.#region).catalyst;
		const headers: Record<string, string> = {};
		if (this.#orgId) {
			headers['x-agentuity-orgid'] = this.#orgId;
		}
		const catalystClient = new APIClient(catalystUrl, this.#logger, this.#apiKey ?? '', {
			headers,
		});
		this.#resolvedUrl = await discoverUrl(catalystClient);
		return this.#resolvedUrl;
	}

	async #getClient(): Promise<APIClient> {
		if (this.#client) {
			return this.#client;
		}

		if (!this.#clientPromise) {
			this.#clientPromise = (async () => {
				const baseUrl = await this.getUrl();
				// Hub API routes live under /api (e.g., /api/hub/sessions)
				const url = `${baseUrl}/api`;
				const headers: Record<string, string> = {};
				if (this.#orgId) {
					headers['x-agentuity-orgid'] = this.#orgId;
				}
				const apiClient = new APIClient(url, this.#logger, this.#apiKey ?? '', { headers });
				this.#client = apiClient;
				return apiClient;
			})();
		}

		return this.#clientPromise;
	}

	/**
	 * Creates a new coder session.
	 */
	async createSession(
		body: CoderCreateSessionParams['body']
	): Promise<CoderCreateSessionResponse> {
		const client = await this.#getClient();
		return coderCreateSession(client, { body, orgId: this.#orgId });
	}

	/**
	 * Creates a dedicated agent-builder session.
	 */
	async createAgentBuilderSession(
		body: CoderCreateAgentBuilderSessionRequest
	): Promise<CoderCreateSessionResponse> {
		const client = await this.#getClient();
		return coderCreateAgentBuilderSession(client, { body, orgId: this.#orgId });
	}

	/**
	 * Retrieves a coder session by id.
	 */
	async getSession(sessionId: string): Promise<CoderSession> {
		const client = await this.#getClient();
		return coderGetSession(client, { sessionId, orgId: this.#orgId });
	}

	/**
	 * Updates an existing coder session.
	 */
	async updateSession(
		sessionId: string,
		body: CoderUpdateSessionRequest
	): Promise<CoderUpdateSessionResponse> {
		const client = await this.#getClient();
		return coderUpdateSession(client, { sessionId, body, orgId: this.#orgId });
	}

	/**
	 * Lists coder sessions with optional filtering.
	 */
	async listSessions(
		params?: Omit<CoderListSessionsParamsWithOrg, 'orgId'>
	): Promise<CoderSessionListResponse> {
		const client = await this.#getClient();
		return coderListSessions(client, { ...params, orgId: this.#orgId });
	}

	/**
	 * Permanently deletes a coder session.
	 */
	async deleteSession(sessionId: string): Promise<void> {
		const client = await this.#getClient();
		return coderDeleteSession(client, { sessionId, orgId: this.#orgId });
	}

	/**
	 * Archives an active coder session.
	 */
	async archiveSession(sessionId: string): Promise<CoderLifecycleResponse> {
		const client = await this.#getClient();
		return coderArchiveSession(client, { sessionId, orgId: this.#orgId });
	}

	/**
	 * Requests that a wakeable sandbox session be resumed.
	 */
	async resumeSession(sessionId: string): Promise<CoderLifecycleResponse> {
		const client = await this.#getClient();
		return coderResumeSession(client, { sessionId, orgId: this.#orgId });
	}

	/**
	 * Makes sure a paused remote session is attachable before opening the controller socket.
	 */
	async prepareSessionForRemoteAttach(
		sessionId: string,
		options: CoderRemoteAttachPreparationOptions = {}
	): Promise<CoderSession> {
		const timeoutMs = options.timeoutMs ?? 30_000;
		const pollIntervalMs = options.pollIntervalMs ?? 1_000;
		let session = await this.getSession(sessionId);

		if (session.historyOnly === true) {
			return session;
		}

		if (session.wakeAvailable === true && session.runtimeAvailable === false) {
			await this.resumeSession(sessionId);
			const deadline = Date.now() + timeoutMs;

			while (Date.now() < deadline) {
				await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
				try {
					session = await this.getSession(sessionId);
				} catch (err) {
					this.#logger.debug(
						'coder remote attach poll failed for %s: %s',
						sessionId,
						err instanceof Error ? err.message : String(err)
					);
					continue;
				}
				if (session.historyOnly === true || session.runtimeAvailable !== false) {
					return session;
				}
			}
		}

		return session;
	}

	/**
	 * Lists sessions the caller can connect to.
	 */
	async listConnectableSessions(
		params?: Omit<CoderListConnectableSessionsParams, 'orgId'>
	): Promise<CoderSessionListResponse> {
		const client = await this.#getClient();
		return coderListConnectableSessions(client, { ...params, orgId: this.#orgId });
	}

	/**
	 * Lists available workspaces.
	 */
	async listWorkspaces(): Promise<CoderWorkspaceListResponse> {
		const client = await this.#getClient();
		return coderListWorkspaces(client);
	}

	/**
	 * Retrieves a workspace by id.
	 */
	async getWorkspace(workspaceId: string): Promise<CoderWorkspaceDetail> {
		const client = await this.#getClient();
		return coderGetWorkspace(client, { workspaceId });
	}

	/**
	 * Creates a new workspace.
	 */
	async createWorkspace(body: CoderCreateWorkspaceRequest): Promise<CoderWorkspaceDetail> {
		const client = await this.#getClient();
		return coderCreateWorkspace(client, { body });
	}

	/**
	 * Deletes a workspace.
	 */
	async deleteWorkspace(workspaceId: string): Promise<void> {
		const client = await this.#getClient();
		return coderDeleteWorkspace(client, { workspaceId });
	}

	/**
	 * Lists custom agents in the org library.
	 */
	async listCustomAgents(options?: {
		includeArchived?: boolean;
	}): Promise<CoderCustomAgentListResponse> {
		const client = await this.#getClient();
		return coderListCustomAgents(client, { ...options, orgId: this.#orgId });
	}

	/**
	 * Retrieves a custom agent by id or slug.
	 */
	async getCustomAgent(agentIdOrSlug: string): Promise<CoderCustomAgent> {
		const client = await this.#getClient();
		return coderGetCustomAgent(client, { agentIdOrSlug, orgId: this.#orgId });
	}

	/**
	 * Creates a new custom-agent draft.
	 */
	async createCustomAgent(body: CoderCreateCustomAgentRequest): Promise<CoderCustomAgent> {
		const client = await this.#getClient();
		return coderCreateCustomAgent(client, { body, orgId: this.#orgId });
	}

	/**
	 * Updates an existing custom-agent draft.
	 */
	async updateCustomAgent(
		agentIdOrSlug: string,
		body: CoderUpdateCustomAgentRequest
	): Promise<CoderCustomAgent> {
		const client = await this.#getClient();
		return coderUpdateCustomAgent(client, { agentIdOrSlug, body, orgId: this.#orgId });
	}

	/**
	 * Publishes the latest custom-agent draft as a new immutable version.
	 */
	async publishCustomAgent(agentIdOrSlug: string): Promise<CoderCustomAgent> {
		const client = await this.#getClient();
		return coderPublishCustomAgent(client, { agentIdOrSlug, orgId: this.#orgId });
	}

	/**
	 * Archives a custom agent from the org library.
	 */
	async archiveCustomAgent(agentIdOrSlug: string): Promise<CoderCustomAgent> {
		const client = await this.#getClient();
		return coderArchiveCustomAgent(client, { agentIdOrSlug, orgId: this.#orgId });
	}

	/**
	 * Lists published versions for a custom agent.
	 */
	async listCustomAgentVersions(
		agentIdOrSlug: string
	): Promise<CoderCustomAgentVersionListResponse> {
		const client = await this.#getClient();
		return coderListCustomAgentVersions(client, { agentIdOrSlug, orgId: this.#orgId });
	}

	/**
	 * Lists saved skills in the caller's library.
	 */
	async listSavedSkills(): Promise<CoderSavedSkillListResponse> {
		const client = await this.#getClient();
		return coderListSavedSkills(client);
	}

	/**
	 * Saves a skill to the caller's library.
	 */
	async saveSkill(body: CoderSaveSkillRequest): Promise<CoderSavedSkill> {
		const client = await this.#getClient();
		return coderSaveSkill(client, { body });
	}

	/**
	 * Deletes a saved skill from the caller's library.
	 */
	async deleteSavedSkill(skillId: string): Promise<void> {
		const client = await this.#getClient();
		return coderDeleteSavedSkill(client, { skillId });
	}

	/**
	 * Lists skill buckets.
	 */
	async listSkillBuckets(): Promise<CoderSkillBucketListResponse> {
		const client = await this.#getClient();
		return coderListSkillBuckets(client);
	}

	/**
	 * Creates a skill bucket.
	 */
	async createSkillBucket(body: CoderCreateSkillBucketRequest): Promise<CoderSkillBucket> {
		const client = await this.#getClient();
		return coderCreateSkillBucket(client, { body });
	}

	/**
	 * Deletes a skill bucket.
	 */
	async deleteSkillBucket(bucketId: string): Promise<void> {
		const client = await this.#getClient();
		return coderDeleteSkillBucket(client, { bucketId });
	}

	/**
	 * Retrieves replay data for a session.
	 */
	async getReplay(
		sessionId: string,
		params?: Omit<CoderGetSessionReplayParams, 'sessionId' | 'orgId'>
	): Promise<CoderSessionReplay> {
		const client = await this.#getClient();
		return coderGetReplay(client, { sessionId, ...params, orgId: this.#orgId });
	}

	/**
	 * Lists participants for a session.
	 */
	async listParticipants(
		sessionId: string,
		params?: Omit<CoderListParticipantsParams, 'sessionId' | 'orgId'>
	): Promise<CoderSessionParticipants> {
		const client = await this.#getClient();
		return coderListParticipants(client, { sessionId, ...params, orgId: this.#orgId });
	}

	/**
	 * Lists historical events for a session.
	 */
	async listEventHistory(
		sessionId: string,
		params?: Omit<CoderListEventHistoryParams, 'sessionId' | 'orgId'>
	): Promise<CoderSessionEventHistory> {
		const client = await this.#getClient();
		return coderListEventHistory(client, { sessionId, ...params, orgId: this.#orgId });
	}

	/**
	 * Gets loop-mode state for a session.
	 */
	async getLoopState(
		sessionId: string,
		params?: Omit<CoderGetLoopStateParams, 'sessionId' | 'orgId'>
	): Promise<CoderLoopStateResponse> {
		const client = await this.#getClient();
		return coderGetLoopState(client, { sessionId, ...params, orgId: this.#orgId });
	}

	/**
	 * Lists known users in the coder hub.
	 */
	async listUsers(
		params?: Omit<CoderListUsersParamsWithOrg, 'orgId'>
	): Promise<CoderListUsersResponse> {
		const client = await this.#getClient();
		return coderListUsers(client, { ...params, orgId: this.#orgId });
	}

	// ── GitHub ────────────────────────────────────────────────────────────

	/**
	 * Lists GitHub accounts available via the caller's GitHub App installations.
	 */
	async listGitHubAccounts(): Promise<CoderGitHubAccountListResponse> {
		const client = await this.#getClient();
		return coderListGitHubAccounts(client);
	}

	/**
	 * Lists repositories accessible under a specific GitHub account.
	 */
	async listGitHubRepos(accountId: string): Promise<CoderGitHubRepositoryListResponse> {
		const client = await this.#getClient();
		return coderListGitHubRepos(client, { accountId });
	}
}
