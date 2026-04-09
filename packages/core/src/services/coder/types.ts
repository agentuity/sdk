import { z } from 'zod/v4';

export const CoderSessionVisibilitySchema = z
	.enum(['private', 'organization', 'collaborate'])
	.describe('Visibility level for a coder session');
export type CoderSessionVisibility = z.infer<typeof CoderSessionVisibilitySchema>;

const VISIBILITY_ALIASES: Record<string, CoderSessionVisibility> = {
	private: 'private',
	org: 'organization',
	organization: 'organization',
	collab: 'collaborate',
	collaborate: 'collaborate',
};

/**
 * Normalize a visibility input string to the canonical server value.
 * Accepts shortcuts like 'org' → 'organization', 'collab' → 'collaborate'.
 */
export function normalizeVisibility(input: string): CoderSessionVisibility {
	const result = VISIBILITY_ALIASES[input.toLowerCase().trim()];
	if (!result) {
		throw new Error(
			`Invalid visibility "${input}". Valid values: private, org, organization, collaborate, collab`
		);
	}
	return result;
}

export const CoderWorkflowModeSchema = z
	.enum(['standard', 'loop'])
	.describe('Workflow execution mode for a coder session');
export type CoderWorkflowMode = z.infer<typeof CoderWorkflowModeSchema>;

export const CoderSessionModeSchema = z
	.enum(['sandbox', 'tui'])
	.describe('Runtime mode used by the coder session');
export type CoderSessionMode = z.infer<typeof CoderSessionModeSchema>;

export const CoderSessionBucketSchema = z
	.enum(['running', 'paused', 'provisioning', 'history'])
	.describe('Derived bucket used for session listing and UI grouping');
export type CoderSessionBucket = z.infer<typeof CoderSessionBucketSchema>;

export const CoderSkillRefSchema = z
	.object({
		skillId: z.string().describe('Unique skill identifier'),
		repo: z.string().describe('Repository slug for the skill source'),
		name: z.string().optional().describe('Human-readable skill name'),
		url: z.string().optional().describe('Canonical URL for the skill repository or page'),
	})
	.describe('Skill reference attached to a coder session');
export type CoderSkillRef = z.infer<typeof CoderSkillRefSchema>;

export const CoderSessionRepositoryRefSchema = z
	.object({
		repoId: z.string().optional().describe('Repository identifier when available'),
		type: z.string().optional().describe('Repository type (e.g., GitHub, GitLab)'),
		provider: z.string().optional().describe('Git provider identifier'),
		owner: z.string().optional().describe('Repository owner or organization'),
		name: z.string().optional().describe('Repository name'),
		fullName: z.string().optional().describe('Fully qualified repository name'),
		url: z.string().optional().describe('Repository web URL'),
		cloneUrl: z.string().optional().describe('Repository clone URL'),
		defaultBranch: z.string().optional().describe('Default branch for the repository'),
		branch: z.string().optional().describe('Selected branch for the session workspace'),
		ref: z.string().optional().describe('Selected ref for the session workspace'),
		commit: z.string().optional().describe('Pinned commit SHA for the session workspace'),
		path: z.string().optional().describe('Subpath of the repository mounted in session'),
		rootPath: z.string().optional().describe('Absolute workspace root path for the repository'),
	})
	.catchall(z.unknown())
	.describe('Repository reference used by coder sessions');
export type CoderSessionRepositoryRef = z.infer<typeof CoderSessionRepositoryRefSchema>;

export const CoderSavedSkillSchema = z
	.object({
		id: z.string().describe('Saved skill record ID'),
		source: z.string().describe('Skill source identifier (e.g. registry)'),
		repo: z.string().describe('Repository identifier for the skill'),
		skillId: z.string().describe('Skill identifier within the repository'),
		name: z.string().describe('Human-readable skill name'),
		description: z.string().optional().describe('Skill description'),
		url: z.string().optional().describe('Skill URL'),
		installs: z.number().optional().describe('Number of installs'),
		createdAt: z.string().describe('Creation timestamp (ISO-8601)'),
		updatedAt: z.string().describe('Last update timestamp (ISO-8601)'),
	})
	.passthrough()
	.describe('Saved skill record returned by coder hub');
export type CoderSavedSkill = z.infer<typeof CoderSavedSkillSchema>;

export const CoderSkillBucketSchema = z
	.object({
		id: z.string().describe('Skill bucket record ID'),
		name: z.string().describe('Skill bucket name'),
		description: z.string().optional().describe('Skill bucket description'),
		createdAt: z.string().describe('Creation timestamp (ISO-8601)'),
		updatedAt: z.string().describe('Last update timestamp (ISO-8601)'),
		skillCount: z.number().describe('Number of skills in the bucket'),
		skills: z.array(CoderSavedSkillSchema).describe('Skills in this bucket'),
	})
	.passthrough()
	.describe('Skill bucket returned by coder hub');
export type CoderSkillBucket = z.infer<typeof CoderSkillBucketSchema>;

export const CoderWorkspaceDetailSchema = z
	.object({
		id: z.string().describe('Workspace record ID'),
		name: z.string().describe('Workspace name'),
		description: z.string().optional().describe('Workspace description'),
		scope: z.string().describe('Workspace scope: user or org'),
		ownerUserId: z.string().describe('Owner user ID'),
		repos: z.array(CoderSessionRepositoryRefSchema).describe('Repositories in workspace'),
		repoCount: z.number().describe('Number of repositories'),
		savedSkillIds: z.array(z.string()).describe('Saved skill IDs in workspace'),
		skillBucketIds: z.array(z.string()).describe('Skill bucket IDs in workspace'),
		enabledAgents: z
			.array(z.string())
			.optional()
			.default([])
			.describe('Effective agent roster stored on the workspace'),
		selectionCount: z.number().describe('Total number of selections'),
		createdAt: z.string().describe('Creation timestamp (ISO-8601)'),
		updatedAt: z.string().describe('Last update timestamp (ISO-8601)'),
	})
	.passthrough()
	.describe('Workspace detail returned by coder hub');
export type CoderWorkspaceDetail = z.infer<typeof CoderWorkspaceDetailSchema>;

export const CoderCustomAgentThinkingLevelSchema = z
	.enum(['off', 'minimal', 'low', 'medium', 'high', 'xhigh'])
	.describe('Thinking level override for a custom agent');
export type CoderCustomAgentThinkingLevel = z.infer<typeof CoderCustomAgentThinkingLevelSchema>;

export const CODER_CUSTOM_AGENT_PI_TOOLS = [
	'read',
	'ls',
	'find',
	'grep',
	'bash',
	'write',
	'edit',
] as const;

export const CoderCustomAgentPiToolSchema = z
	.enum(CODER_CUSTOM_AGENT_PI_TOOLS)
	.describe('Workspace tool available to a standalone custom agent');
export type CoderCustomAgentPiTool = z.infer<typeof CoderCustomAgentPiToolSchema>;

export const CoderCustomAgentPiToolResponseSchema = z
	.union([CoderCustomAgentPiToolSchema, z.string()])
	.describe('Pi workspace tool granted to a standalone custom agent');
export type CoderCustomAgentPiToolResponse = z.infer<typeof CoderCustomAgentPiToolResponseSchema>;

export const CODER_CUSTOM_AGENT_HUB_TOOLS = [
	'session_dashboard',
	'memory_service_search',
	'memory_service_store',
	'memory_service_get',
	'memory_service_update',
	'memory_service_delete',
	'memory_service_list',
	'memory_service_schema',
	'memory_service_facets',
	'context7_search',
	'grep_app_search',
	'web_search',
	'fetch_content',
	'product_prd_create',
	'product_prd_get',
	'product_prd_update',
	'product_prd_list',
	'product_task_comment',
	'session_todo_create',
	'session_todo_update',
	'session_todo_list',
	'session_todo_comment',
	'session_todo_attach',
	'product_generate_deck',
	'sandbox_exec',
	'loop_get_state',
	'loop_update_state',
	'coord_create_job',
	'coord_add_task',
	'coord_claim_task',
	'coord_complete_task',
	'coord_fail_task',
	'coord_list_tasks',
	'coord_job_status',
	'coord_reserve_file',
	'coord_release_file',
	'coord_provide_contract',
	'coord_check_contract',
	'coord_send_message',
	'coord_read_messages',
	'coord_heartbeat',
	'coord_spawn_workers',
] as const;

export const CoderCustomAgentHubToolSchema = z
	.enum(CODER_CUSTOM_AGENT_HUB_TOOLS)
	.describe('Hub-managed tool available to a standalone custom agent');
export type CoderCustomAgentHubTool = z.infer<typeof CoderCustomAgentHubToolSchema>;

export const CoderCustomAgentHubToolResponseSchema = z
	.union([CoderCustomAgentHubToolSchema, z.string()])
	.describe('Hub-managed tool granted to a standalone custom agent');
export type CoderCustomAgentHubToolResponse = z.infer<typeof CoderCustomAgentHubToolResponseSchema>;

export const CoderCustomAgentSnapshotSchema = z
	.object({
		slug: z.string().describe('Stable custom agent slug'),
		displayName: z.string().describe('Human-readable custom agent name'),
		description: z.string().optional().describe('Optional custom agent description'),
		instructions: z.string().describe('Standalone custom-agent system prompt'),
		model: z.string().optional().describe('Optional model override'),
		thinkingLevel: CoderCustomAgentThinkingLevelSchema.optional().describe(
			'Optional thinking level override'
		),
		headlessCompatible: z
			.boolean()
			.describe('Whether the custom agent is safe for non-interactive callers'),
		piTools: z
			.array(CoderCustomAgentPiToolResponseSchema)
			.describe('Pi workspace tools granted to the custom agent'),
		hubToolNames: z
			.array(CoderCustomAgentHubToolResponseSchema)
			.describe('Hub-managed tools granted to the custom agent'),
		savedSkills: z
			.array(CoderSkillRefSchema)
			.describe('Frozen saved-skill refs attached to the custom agent snapshot'),
		companionAgents: z
			.array(z.string())
			.describe('Companion agents auto-included alongside this custom agent'),
	})
	.passthrough()
	.describe('Custom agent snapshot returned by coder hub');
export type CoderCustomAgentSnapshot = z.infer<typeof CoderCustomAgentSnapshotSchema>;

export const CoderCustomAgentVersionSchema = CoderCustomAgentSnapshotSchema.extend({
	id: z.string().describe('Published custom agent version identifier'),
	agentId: z.string().describe('Parent custom agent identifier'),
	version: z.number().int().describe('Published version number'),
	createdByUserId: z.string().describe('User who published the version'),
	createdAt: z.string().describe('Version creation timestamp (ISO-8601)'),
})
	.passthrough()
	.describe('Published custom agent version returned by coder hub');
export type CoderCustomAgentVersion = z.infer<typeof CoderCustomAgentVersionSchema>;

export const CoderCustomAgentSchema = CoderCustomAgentSnapshotSchema.extend({
	id: z.string().describe('Custom agent record identifier'),
	ownerUserId: z.string().describe('Owner user identifier'),
	lifecycle: z
		.enum(['draft', 'published', 'archived'])
		.describe('Current lifecycle state for the custom agent'),
	visibility: z.enum(['org', 'private_draft']).describe('Visibility tier for the custom agent'),
	createdAt: z.string().describe('Creation timestamp (ISO-8601)'),
	updatedAt: z.string().describe('Last update timestamp (ISO-8601)'),
	hasPublishedVersion: z
		.boolean()
		.describe('Whether the agent has at least one published version'),
	hasUnpublishedChanges: z
		.boolean()
		.describe('Whether the current draft differs from the latest published version'),
	latestPublishedVersion: z.number().int().optional().describe('Latest published version number'),
	latestPublishedAt: z.string().optional().describe('Latest published timestamp (ISO-8601)'),
	published: CoderCustomAgentVersionSchema.optional().describe(
		'Latest published version snapshot'
	),
	draft: CoderCustomAgentSnapshotSchema.optional().describe('Owner-visible draft snapshot'),
})
	.passthrough()
	.describe('Custom agent record returned by coder hub');
export type CoderCustomAgent = z.infer<typeof CoderCustomAgentSchema>;

export const CoderCustomAgentListResponseSchema = z
	.object({
		agents: z.array(CoderCustomAgentSchema).describe('Custom agents returned by coder hub'),
	})
	.passthrough()
	.describe('Response payload for listing custom agents');
export type CoderCustomAgentListResponse = z.infer<typeof CoderCustomAgentListResponseSchema>;

export const CoderCustomAgentVersionListResponseSchema = z
	.object({
		versions: z
			.array(CoderCustomAgentVersionSchema)
			.describe('Published custom agent versions returned by coder hub'),
	})
	.passthrough()
	.describe('Response payload for listing custom agent versions');
export type CoderCustomAgentVersionListResponse = z.infer<
	typeof CoderCustomAgentVersionListResponseSchema
>;

export const CoderSavedSkillListResponseSchema = z
	.object({
		skills: z.array(CoderSavedSkillSchema).describe('Saved skills returned by coder hub'),
	})
	.passthrough()
	.describe('Response payload for listing saved skills');
export type CoderSavedSkillListResponse = z.infer<typeof CoderSavedSkillListResponseSchema>;

export const CoderSkillBucketListResponseSchema = z
	.object({
		buckets: z.array(CoderSkillBucketSchema).describe('Skill buckets returned by coder hub'),
	})
	.passthrough()
	.describe('Response payload for listing skill buckets');
export type CoderSkillBucketListResponse = z.infer<typeof CoderSkillBucketListResponseSchema>;

export const CoderWorkspaceListResponseSchema = z
	.object({
		workspaces: z.array(CoderWorkspaceDetailSchema).describe('Workspaces returned by coder hub'),
	})
	.passthrough()
	.describe('Response payload for listing workspaces');
export type CoderWorkspaceListResponse = z.infer<typeof CoderWorkspaceListResponseSchema>;

export const CoderCreateWorkspaceRequestSchema = z
	.object({
		name: z.string().describe('Workspace name'),
		description: z.string().optional().describe('Workspace description'),
		scope: z.enum(['user', 'org']).optional().describe('Workspace scope'),
		repos: z.array(CoderSessionRepositoryRefSchema).optional().describe('Repositories'),
		savedSkillIds: z.array(z.string()).optional().describe('Saved skill IDs'),
		skillBucketIds: z.array(z.string()).optional().describe('Skill bucket IDs'),
		enabledAgents: z.array(z.string()).optional().describe('Effective agent roster to store on the workspace'),
	})
	.describe('Request body for creating a workspace');
export type CoderCreateWorkspaceRequest = z.infer<typeof CoderCreateWorkspaceRequestSchema>;

export const CoderCreateCustomAgentRequestSchema = z
	.object({
		slug: z.string().describe('Stable custom agent slug'),
		displayName: z.string().describe('Human-readable custom agent name'),
		description: z.string().optional().describe('Optional custom agent description'),
		instructions: z.string().describe('Standalone custom-agent system prompt'),
		model: z.string().optional().describe('Optional model override'),
		thinkingLevel: CoderCustomAgentThinkingLevelSchema.optional().describe(
			'Optional thinking level override'
		),
		headlessCompatible: z
			.boolean()
			.optional()
			.describe('Whether the custom agent is safe for non-interactive callers'),
		piTools: z
			.array(CoderCustomAgentPiToolSchema)
			.optional()
			.describe('Pi workspace tools to grant to the custom agent'),
		hubToolNames: z
			.array(CoderCustomAgentHubToolSchema)
			.optional()
			.describe('Hub-managed tools to grant to the custom agent'),
		savedSkillIds: z
			.array(z.string())
			.optional()
			.describe('Saved skill row ids to snapshot onto the custom agent'),
		companionAgents: z
			.array(z.string())
			.optional()
			.describe('Agent names to auto-include alongside this custom agent'),
	})
	.describe('Request body for creating a custom agent draft');
export type CoderCreateCustomAgentRequest = z.infer<typeof CoderCreateCustomAgentRequestSchema>;

export const CoderUpdateCustomAgentRequestSchema = z
	.object({
		slug: z.string().optional().describe('Stable custom agent slug'),
		displayName: z.string().optional().describe('Human-readable custom agent name'),
		description: z.string().nullable().optional().describe('Optional custom agent description'),
		instructions: z.string().optional().describe('Standalone custom-agent system prompt'),
		model: z.string().nullable().optional().describe('Optional model override'),
		thinkingLevel: CoderCustomAgentThinkingLevelSchema.nullable()
			.optional()
			.describe('Optional thinking level override'),
		headlessCompatible: z
			.boolean()
			.optional()
			.describe('Whether the custom agent is safe for non-interactive callers'),
		piTools: z
			.array(CoderCustomAgentPiToolSchema)
			.optional()
			.describe('Pi workspace tools to grant to the custom agent'),
		hubToolNames: z
			.array(CoderCustomAgentHubToolSchema)
			.optional()
			.describe('Hub-managed tools to grant to the custom agent'),
		savedSkillIds: z
			.array(z.string())
			.optional()
			.describe('Saved skill row ids to snapshot onto the custom agent'),
		companionAgents: z
			.array(z.string())
			.optional()
			.describe('Agent names to auto-include alongside this custom agent'),
	})
	.describe('Request body for updating a custom agent draft');
export type CoderUpdateCustomAgentRequest = z.infer<typeof CoderUpdateCustomAgentRequestSchema>;

export const CoderSaveSkillRequestSchema = z
	.object({
		repo: z.string().describe('Repository identifier'),
		skillId: z.string().describe('Skill identifier'),
		name: z.string().describe('Skill name'),
		description: z.string().optional().describe('Skill description'),
		url: z.string().optional().describe('Skill URL'),
		source: z.string().optional().describe('Skill source (default: registry)'),
		content: z.string().optional().describe('Skill content'),
	})
	.describe('Request body for saving a skill to the library');
export type CoderSaveSkillRequest = z.infer<typeof CoderSaveSkillRequestSchema>;

export const CoderCreateSkillBucketRequestSchema = z
	.object({
		name: z.string().describe('Skill bucket name'),
		description: z.string().optional().describe('Skill bucket description'),
		savedSkillIds: z
			.array(z.string())
			.optional()
			.describe('Saved skill IDs to include in the bucket'),
	})
	.describe('Request body for creating a skill bucket');
export type CoderCreateSkillBucketRequest = z.infer<typeof CoderCreateSkillBucketRequestSchema>;

export const CoderSessionLoopConfigSchema = z
	.object({
		goal: z.string().optional().describe('High-level goal for loop mode execution'),
		maxIterations: z
			.number()
			.int()
			.optional()
			.describe('Maximum loop iterations before completion'),
		autoContinue: z
			.boolean()
			.optional()
			.describe('Whether the loop auto-continues without manual approval'),
		allowDetached: z
			.boolean()
			.optional()
			.describe('Whether loop execution can continue when no client is actively attached'),
	})
	.describe('Loop mode configuration used when creating or updating a session');
export type CoderSessionLoopConfig = z.infer<typeof CoderSessionLoopConfigSchema>;

export const CoderCreateSessionRequestSchema = z
	.object({
		task: z.string().describe('Primary task prompt for the session'),
		label: z.string().optional().describe('Human-readable session label'),
		agent: z.string().optional().describe('Default agent identifier to use for execution'),
		defaultAgent: z
			.string()
			.optional()
			.describe('Preferred default agent identifier for routing session prompts'),
		visibility: CoderSessionVisibilitySchema.optional().describe('Session visibility setting'),
		workflowMode: CoderWorkflowModeSchema.optional().describe('Workflow execution mode'),
		loop: CoderSessionLoopConfigSchema.optional().describe('Loop mode settings for the session'),
		tags: z.array(z.string()).optional().describe('Tags applied to the session for filtering'),
		enabledAgents: z
			.array(z.string())
			.optional()
			.describe('Enabled agent roster to include in the session'),
		savedSkillIds: z
			.array(z.string())
			.optional()
			.describe('Saved skill IDs to attach to the session on creation'),
		skillBucketIds: z
			.array(z.string())
			.optional()
			.describe('Skill bucket IDs to attach to the session on creation'),
		skills: z
			.array(CoderSkillRefSchema)
			.optional()
			.describe('Skill definitions attached to the session'),
		repo: CoderSessionRepositoryRefSchema.optional().describe(
			'Primary repository mounted for the session'
		),
		repos: z
			.array(CoderSessionRepositoryRefSchema)
			.optional()
			.describe('Multiple repositories mounted for the session'),
		workspaceId: z
			.string()
			.optional()
			.describe('Workspace identifier associated with the session'),
		env: z
			.record(z.string(), z.string())
			.optional()
			.describe('Environment variables injected into session runtime'),
		metadata: z
			.record(z.string(), z.string())
			.optional()
			.describe('Arbitrary metadata associated with the session'),
	})
	.describe('Request body for creating a coder session');
export type CoderCreateSessionRequest = z.infer<typeof CoderCreateSessionRequestSchema>;

export const CoderUpdateSessionRequestSchema = z
	.object({
		label: z.string().optional().describe('Updated session label'),
		agent: z.string().optional().describe('Updated default agent identifier'),
		defaultAgent: z.string().optional().describe('Updated preferred default agent identifier'),
		visibility: CoderSessionVisibilitySchema.optional().describe('Updated visibility setting'),
		workflowMode: CoderWorkflowModeSchema.optional().describe('Updated workflow mode'),
		loop: CoderSessionLoopConfigSchema.optional().describe('Updated loop mode configuration'),
		tags: z.array(z.string()).optional().describe('Updated set of tags for the session'),
		enabledAgents: z
			.array(z.string())
			.optional()
			.describe('Updated enabled agent roster for the session'),
		skills: z
			.array(CoderSkillRefSchema)
			.optional()
			.describe('Updated attached skills for the session'),
		metadata: z
			.record(z.string(), z.string())
			.optional()
			.describe('Updated arbitrary metadata associated with the session'),
	})
	.describe('Request body for updating a coder session');
export type CoderUpdateSessionRequest = z.infer<typeof CoderUpdateSessionRequestSchema>;

export const CoderSessionOwnerSchema = z
	.object({
		userId: z.string().describe('Owner user identifier'),
		name: z.string().optional().describe('Owner display name'),
	})
	.describe('Owner identity for a session');
export type CoderSessionOwner = z.infer<typeof CoderSessionOwnerSchema>;

export const CoderSessionOriginSchema = z
	.union([
		z.string().describe('Origin type as a simple string identifier'),
		z
			.object({
				type: z.string().describe('Origin type identifier for session creation source'),
			})
			.catchall(z.unknown()),
	])
	.describe('Source metadata describing where a session originated');
export type CoderSessionOrigin = z.infer<typeof CoderSessionOriginSchema>;

export const CoderSessionWorkspaceSchema = z
	.object({
		id: z.string().describe('Workspace identifier'),
		name: z.string().describe('Workspace display name'),
		scope: z.enum(['user', 'org']).describe('Workspace ownership scope'),
	})
	.describe('Workspace associated with a coder session');
export type CoderSessionWorkspace = z.infer<typeof CoderSessionWorkspaceSchema>;

export const CoderSessionListItemSchema = z
	.object({
		sessionId: z.string().describe('Unique session identifier'),
		label: z.string().describe('Human-readable session label'),
		status: z.string().describe('Current session status'),
		mode: CoderSessionModeSchema.describe('Runtime mode used by this session'),
		visibility: z.string().describe('Visibility value assigned to the session'),
		owner: CoderSessionOwnerSchema.optional().describe('Session owner identity'),
		origin: CoderSessionOriginSchema.optional().describe('Session origin metadata'),
		repo: CoderSessionRepositoryRefSchema.optional().describe('Primary repository reference'),
		repos: z
			.array(CoderSessionRepositoryRefSchema)
			.optional()
			.describe('Repository references mounted in session'),
		workspace: CoderSessionWorkspaceSchema.optional().describe(
			'Associated workspace information'
		),
		sessionKind: z.string().optional().describe('Session kind category emitted by backend'),
		parentSessionId: z
			.string()
			.optional()
			.describe('Parent session identifier when session is derived'),
		coordinationJobId: z
			.string()
			.optional()
			.describe('Coordination job identifier for orchestration'),
		workflowMode: CoderWorkflowModeSchema.describe('Workflow mode currently active for session'),
		loopStatus: z.string().optional().describe('Current loop status if workflow mode is loop'),
		loopIteration: z
			.number()
			.optional()
			.describe('Current loop iteration counter when applicable'),
		createdAt: z.string().describe('Session creation timestamp (ISO-8601)'),
		lastActivityAt: z.string().describe('Timestamp of most recent activity (ISO-8601)'),
		taskCount: z.number().describe('Number of tasks associated with the session'),
		subAgentCount: z.number().describe('Number of sub-agents associated with the session'),
		observerCount: z.number().describe('Number of observer participants in the session'),
		participantCount: z.number().describe('Total number of participants in the session'),
		tags: z.array(z.string()).describe('Tag values attached to the session'),
		skills: z.array(CoderSkillRefSchema).describe('Skills attached to the session'),
		enabledAgents: z
			.array(z.string())
			.optional()
			.default([])
			.describe('Enabled agent roster attached to the session'),
		defaultAgent: z.string().optional().describe('Default agent assigned to session operations'),
		bucket: CoderSessionBucketSchema.describe('Derived bucket for session listing'),
		runtimeAvailable: z.boolean().describe('Whether runtime is currently reachable'),
		controlAvailable: z.boolean().describe('Whether control operations are currently available'),
		manageAvailable: z
			.boolean()
			.optional()
			.describe('Whether management operations are currently available'),
		wakeAvailable: z.boolean().describe('Whether wake operation is currently available'),
		historyOnly: z
			.boolean()
			.describe('Whether session is history-only and no longer interactive'),
		liveExpected: z.boolean().describe('Whether live connectivity is expected for the session'),
	})
	.describe('Session list item returned by coder hub list endpoints');
export type CoderSessionListItem = z.infer<typeof CoderSessionListItemSchema>;

export const CoderSessionSchema = CoderSessionListItemSchema.extend({
	task: z.string().optional().describe('Primary task prompt associated with the session'),
	env: z
		.record(z.string(), z.string())
		.optional()
		.describe('Environment variables associated with the session'),
	metadata: z
		.record(z.string(), z.unknown())
		.optional()
		.describe('Additional metadata associated with the session'),
	updatedAt: z
		.string()
		.optional()
		.describe('Last update timestamp for session metadata (ISO-8601)'),
	// These fields are present in list items but may be absent in detail responses
	lastActivityAt: z.string().optional().describe('Timestamp of most recent activity (ISO-8601)'),
	taskCount: z.number().optional().describe('Number of tasks associated with the session'),
	subAgentCount: z
		.number()
		.optional()
		.describe('Number of sub-agents associated with the session'),
	observerCount: z.number().optional().describe('Number of observer participants in the session'),
	participantCount: z.number().optional().describe('Total number of participants in the session'),
})
	.passthrough()
	.describe('Detailed coder session payload returned by session endpoints');
export type CoderSession = z.infer<typeof CoderSessionSchema>;

export const CoderListSessionsParamsSchema = z
	.object({
		search: z.string().optional().describe('Search query for session title, task, or metadata'),
		includeArchived: z
			.boolean()
			.optional()
			.describe('Whether archived sessions should be included'),
		limit: z.number().int().optional().describe('Maximum number of sessions to return'),
		offset: z.number().int().optional().describe('Number of sessions to skip for pagination'),
		orgId: z.string().optional().describe('Optional org id for CLI auth context'),
	})
	.describe('Query parameters for listing sessions');
export type CoderListSessionsParams = z.infer<typeof CoderListSessionsParamsSchema>;

export const CoderSessionListResponseSchema = z
	.object({
		sessions: z.array(CoderSessionListItemSchema).describe('List of coder sessions'),
		total: z.number().optional().describe('Total sessions matching the query'),
		limit: z.number().optional().describe('Pagination limit used by the response'),
		offset: z.number().optional().describe('Pagination offset used by the response'),
	})
	.describe('Normalized paginated session list response');
export type CoderSessionListResponse = z.infer<typeof CoderSessionListResponseSchema>;

export const CoderSessionListPayloadSchema = z
	.union([
		z.array(CoderSessionListItemSchema).describe('Array-only list payload from service'),
		CoderSessionListResponseSchema.describe('Object list payload from service'),
	])
	.describe('Raw session list payload shape returned by service');

export const CoderParticipantSchema = z
	.object({
		id: z.string().describe('Participant identifier'),
		role: z.string().describe('Participant role in the session'),
		transport: z.string().optional().describe('Transport protocol used by the participant'),
		agentRole: z.string().optional().describe('Agent role when participant is an agent'),
		connectedAt: z
			.string()
			.optional()
			.describe('Timestamp when participant connected (ISO-8601)'),
		disconnectedAt: z
			.string()
			.optional()
			.describe('Timestamp when participant disconnected (ISO-8601)'),
		lastActivityAt: z
			.string()
			.optional()
			.describe('Timestamp of last participant activity (ISO-8601)'),
		metadata: z
			.record(z.string(), z.unknown())
			.optional()
			.describe('Additional participant metadata'),
	})
	.passthrough()
	.describe('Participant entry associated with a session');
export type CoderParticipant = z.infer<typeof CoderParticipantSchema>;

export const CoderSessionParticipantsSchema = z
	.object({
		sessionId: z.string().describe('Session identifier for the participant list'),
		participants: z
			.array(CoderParticipantSchema)
			.describe('Participant entries associated with session'),
	})
	.describe('Participants payload for a coder session');
export type CoderSessionParticipants = z.infer<typeof CoderSessionParticipantsSchema>;

export const CoderSessionReplaySchema = z
	.object({
		sessionId: z.string().describe('Session identifier for replay payload'),
		replay: z.unknown().optional().describe('Replay payload emitted by coder hub'),
		events: z
			.array(z.unknown())
			.optional()
			.describe('Replay events if included in response payload'),
	})
	.passthrough()
	.describe('Replay payload for a coder session');
export type CoderSessionReplay = z.infer<typeof CoderSessionReplaySchema>;

export const CoderSessionEventSchema = z
	.object({
		id: z.number().describe('Event sequence identifier'),
		event: z.string().describe('Event name'),
		category: z.string().optional().describe('Event category'),
		agent: z.string().optional().describe('Agent identifier responsible for the event'),
		taskId: z.string().optional().describe('Task identifier associated with the event'),
		payload: z.unknown().optional().describe('Event payload data'),
		occurredAt: z.string().describe('Timestamp when event occurred (ISO-8601)'),
		ingestedAt: z.string().optional().describe('Timestamp when event was ingested (ISO-8601)'),
	})
	.passthrough()
	.describe('Session history event entry');
export type CoderSessionEvent = z.infer<typeof CoderSessionEventSchema>;

export const CoderSessionEventHistorySchema = z
	.object({
		sessionId: z.string().describe('Session identifier for event history payload'),
		events: z.array(CoderSessionEventSchema).describe('Event history items for the session'),
		total: z.number().optional().describe('Total number of events when pagination is applied'),
		limit: z.number().optional().describe('Pagination limit used by backend response'),
		offset: z.number().optional().describe('Pagination offset used by backend response'),
	})
	.passthrough()
	.describe('Event history payload for a coder session');
export type CoderSessionEventHistory = z.infer<typeof CoderSessionEventHistorySchema>;

export const CoderSessionDataQuerySchema = z
	.object({
		sessionId: z.string().describe('Session identifier'),
		limit: z.number().int().optional().describe('Maximum number of records to return'),
		offset: z.number().int().optional().describe('Number of records to skip for pagination'),
		orgId: z.string().optional().describe('Optional org id for CLI auth context'),
	})
	.describe('Common query parameters for session data endpoints');
export type CoderSessionDataQuery = z.infer<typeof CoderSessionDataQuerySchema>;

export const CoderLoopStatusSchema = z
	.enum([
		'idle',
		'starting',
		'running',
		'paused',
		'completed',
		'cancelled',
		'blocked',
		'awaiting_input',
	])
	.describe('Current status of a loop-mode session');
export type CoderLoopStatus = z.infer<typeof CoderLoopStatusSchema>;

export const CoderSessionLoopStateSchema = z
	.object({
		status: CoderLoopStatusSchema.describe('Current loop status'),
		iteration: z.number().describe('Current loop iteration number'),
		maxIterations: z.number().optional().describe('Maximum configured loop iterations'),
		goal: z.string().optional().describe('Loop execution goal statement'),
		summary: z.string().optional().describe('Summary generated for current loop state'),
		nextAction: z.string().optional().describe('Suggested next action for loop progression'),
		loopId: z.string().optional().describe('Loop run identifier'),
		startedAt: z.number().optional().describe('Unix timestamp in milliseconds when loop started'),
		updatedAt: z
			.number()
			.optional()
			.describe('Unix timestamp in milliseconds when loop was last updated'),
		completedAt: z
			.number()
			.optional()
			.describe('Unix timestamp in milliseconds when loop completed'),
		lastCheckpointAt: z
			.number()
			.optional()
			.describe('Unix timestamp in milliseconds for most recent loop checkpoint'),
		autoContinue: z.boolean().optional().describe('Whether loop is configured to auto-continue'),
		allowDetached: z
			.boolean()
			.optional()
			.describe('Whether loop is allowed to continue while detached from active clients'),
		activePrdKey: z.string().optional().describe('Active PRD key associated with loop execution'),
		activePrdTaskId: z
			.string()
			.optional()
			.describe('Active PRD task identifier associated with loop execution'),
	})
	.describe('Detailed state for loop-mode execution');
export type CoderSessionLoopState = z.infer<typeof CoderSessionLoopStateSchema>;

export const CoderLoopStateResponseSchema = z
	.object({
		sessionId: z.string().describe('Session identifier for the loop state payload'),
		workflowMode: CoderWorkflowModeSchema.describe('Workflow mode for the target session'),
		loop: CoderSessionLoopStateSchema.nullable().describe(
			'Loop state details, or null when not in loop mode'
		),
	})
	.describe('Loop state response for a coder session');
export type CoderLoopStateResponse = z.infer<typeof CoderLoopStateResponseSchema>;

// ────────────────────────────────────────────────────────────────────────────
// GitHub Account
// ────────────────────────────────────────────────────────────────────────────

export const CoderGitHubAccountSchema = z
	.object({
		installationId: z.string().describe('GitHub App installation ID'),
		integrationId: z.string().describe('Integration record ID'),
		accountId: z.string().describe('GitHub account numeric ID'),
		accountName: z.string().describe('GitHub account login name'),
		accountType: z.string().describe('Account type (User or Organization)'),
		avatarUrl: z.string().optional().describe('GitHub account avatar URL'),
	})
	.passthrough()
	.describe('GitHub account available via a GitHub App installation');
export type CoderGitHubAccount = z.infer<typeof CoderGitHubAccountSchema>;

export const CoderGitHubAccountListResponseSchema = z
	.object({
		connected: z.boolean().describe('Whether GitHub OAuth is connected'),
		username: z.string().optional().describe('Connected GitHub username'),
		avatarUrl: z.string().optional().describe('Connected GitHub avatar URL'),
		accounts: z.array(CoderGitHubAccountSchema).describe('Available GitHub accounts'),
	})
	.passthrough()
	.describe('Response payload for listing GitHub accounts');
export type CoderGitHubAccountListResponse = z.infer<typeof CoderGitHubAccountListResponseSchema>;

// ────────────────────────────────────────────────────────────────────────────
// GitHub Repository
// ────────────────────────────────────────────────────────────────────────────

export const CoderGitHubRepositorySchema = z
	.object({
		id: z.number().describe('GitHub repository numeric ID'),
		name: z.string().describe('Repository name'),
		fullName: z.string().describe('Full repository name (owner/repo)'),
		private: z.boolean().describe('Whether repository is private'),
		defaultBranch: z.string().optional().describe('Default branch name'),
		cloneUrl: z.string().describe('Git clone URL'),
		htmlUrl: z.string().describe('GitHub web URL'),
		visibility: z.string().optional().describe('Repository visibility'),
		archived: z.boolean().describe('Whether repository is archived'),
		disabled: z.boolean().describe('Whether repository is disabled'),
		owner: z
			.object({
				login: z.string().describe('Owner login name'),
				avatarUrl: z.string().optional().describe('Owner avatar URL'),
			})
			.passthrough()
			.describe('Repository owner'),
	})
	.passthrough()
	.describe('GitHub repository returned by coder hub');
export type CoderGitHubRepository = z.infer<typeof CoderGitHubRepositorySchema>;

export const CoderGitHubRepositoryListResponseSchema = z
	.object({
		accountId: z.string().describe('GitHub account ID the repos belong to'),
		totalCount: z.number().describe('Total number of repositories'),
		repositories: z.array(CoderGitHubRepositorySchema).describe('Repository list'),
	})
	.passthrough()
	.describe('Response payload for listing GitHub repositories');
export type CoderGitHubRepositoryListResponse = z.infer<
	typeof CoderGitHubRepositoryListResponseSchema
>;

// ────────────────────────────────────────────────────────────────────────────
// Users
// ────────────────────────────────────────────────────────────────────────────

export const CoderUserSchema = z
	.object({
		userId: z.string().describe('User identifier'),
		displayName: z.string().describe('Human-readable user display name'),
		email: z.string().describe('User email address'),
		provider: z.string().describe('Identity provider for this user'),
		avatarUrl: z.string().optional().describe('Avatar URL for the user profile image'),
		lastLoginAt: z.string().describe("Timestamp of the user's last login (ISO-8601)"),
		lastSeenAt: z.string().describe("Timestamp of the user's most recent presence (ISO-8601)"),
		createdAt: z
			.string()
			.describe('Timestamp when the user identity was first observed (ISO-8601)'),
	})
	.describe('Known user record from coder hub');
export type CoderUser = z.infer<typeof CoderUserSchema>;

export const CoderListUsersParamsSchema = z
	.object({
		search: z.string().optional().describe('Search query to filter users by display name'),
		limit: z.number().int().optional().describe('Maximum number of users to return'),
		offset: z.number().int().optional().describe('Number of users to skip for pagination'),
		orgId: z.string().optional().describe('Optional org id for CLI auth context'),
	})
	.describe('Query parameters for listing known users');
export type CoderListUsersParams = z.infer<typeof CoderListUsersParamsSchema>;

export const CoderListUsersResponseSchema = z
	.object({
		users: z.array(CoderUserSchema).describe('List of known users'),
		total: z.number().optional().describe('Total users matching the query'),
		limit: z.number().optional().describe('Pagination limit used by backend response'),
		offset: z.number().optional().describe('Pagination offset used by backend response'),
	})
	.describe('Normalized users list response');
export type CoderListUsersResponse = z.infer<typeof CoderListUsersResponseSchema>;
