import { z } from 'zod';
import { APIResponseSchema } from '../api.ts';

export const OAuthClientSchema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string(),
	homepage_url: z.string(),
	icon: z.string().nullable().optional(),
	client_type: z.enum(['public', 'confidential']),
	redirect_uris: z.array(z.string()),
	post_logout_redirect_uris: z.array(z.string()),
	grant_types: z.array(z.string()),
	response_types: z.array(z.string()),
	scopes: z.array(z.string()),
	org_id: z.string().optional(),
	project_id: z.string().optional(),
	access_token_lifetime_seconds: z.number().optional(),
	refresh_token_lifetime_seconds: z.number().optional(),
	id_token_lifetime_seconds: z.number().optional(),
	allowed_user_ids: z.array(z.string()),
	internal: z.boolean().optional().default(false),
	created_at: z.string(),
	updated_at: z.string(),
});

export type OAuthClient = z.infer<typeof OAuthClientSchema>;

export const OAuthClientListItemSchema = OAuthClientSchema.extend({
	user_count: z.number(),
	last_activity: z.string().nullable().optional(),
	link: z.string(),
});

export type OAuthClientListItem = z.infer<typeof OAuthClientListItemSchema>;

export const OAuthClientCreateRequestSchema = z.object({
	name: z.string(),
	description: z.string(),
	homepage_url: z.string(),
	icon: z.string().nullable().optional(),
	client_type: z.enum(['public', 'confidential']).optional(),
	redirect_uris: z.array(z.string()).optional(),
	post_logout_redirect_uris: z.array(z.string()).optional(),
	grant_types: z.array(z.string()).optional(),
	response_types: z.array(z.string()).optional(),
	scopes: z.array(z.string()).optional(),
	project_id: z.string().optional(),
	access_token_lifetime_seconds: z.number().optional(),
	refresh_token_lifetime_seconds: z.number().optional(),
	id_token_lifetime_seconds: z.number().optional(),
	allowed_user_ids: z.array(z.string()).optional(),
});

export type OAuthClientCreateRequest = z.infer<typeof OAuthClientCreateRequestSchema>;

export const OAuthClientCreateDataSchema = z.object({
	client: OAuthClientSchema,
	client_secret: z.string(),
});

export type OAuthClientCreateData = z.infer<typeof OAuthClientCreateDataSchema>;

export const OAuthClientUpdateRequestSchema = z.object({
	name: z.string().optional(),
	description: z.string().optional(),
	homepage_url: z.string().optional(),
	icon: z.string().nullable().optional(),
	client_type: z.enum(['public', 'confidential']).optional(),
	redirect_uris: z.array(z.string()).optional(),
	post_logout_redirect_uris: z.array(z.string()).optional(),
	grant_types: z.array(z.string()).optional(),
	response_types: z.array(z.string()).optional(),
	scopes: z.array(z.string()).optional(),
	project_id: z.string().optional(),
	access_token_lifetime_seconds: z.number().optional(),
	refresh_token_lifetime_seconds: z.number().optional(),
	id_token_lifetime_seconds: z.number().optional(),
	allowed_user_ids: z.array(z.string()).optional(),
});

export type OAuthClientUpdateRequest = z.infer<typeof OAuthClientUpdateRequestSchema>;

export const OAuthClientUpdateDataSchema = z.object({
	client: OAuthClientSchema,
	client_secret: z.string().optional(),
});

export type OAuthClientUpdateData = z.infer<typeof OAuthClientUpdateDataSchema>;

export const OAuthRotateSecretDataSchema = z.object({
	client_id: z.string(),
	client_secret: z.string(),
});

export type OAuthRotateSecretData = z.infer<typeof OAuthRotateSecretDataSchema>;

export const OAuthDeletedDataSchema = z.object({
	deleted: z.literal(true),
});

export type OAuthDeletedData = z.infer<typeof OAuthDeletedDataSchema>;

export const OAuthClientActivityItemSchema = z.object({
	activity_date: z.string(),
	total_access: z.number(),
	unique_users: z.number(),
});

export type OAuthClientActivityItem = z.infer<typeof OAuthClientActivityItemSchema>;

export const OAuthBulkActivityItemSchema = z.object({
	client_id: z.string(),
	activity_date: z.string(),
	unique_users: z.number(),
});

export type OAuthBulkActivityItem = z.infer<typeof OAuthBulkActivityItemSchema>;

export const OAuthConsentGrantSchema = z.object({
	user_id: z.string(),
	scopes: z.array(z.string()),
	created_at: z.string(),
	updated_at: z.string(),
});

export type OAuthConsentGrant = z.infer<typeof OAuthConsentGrantSchema>;

export const OAuthUserConsentSchema = z.object({
	client_id: z.string(),
	scopes: z.array(z.string()),
	created_at: z.string(),
	updated_at: z.string(),
	client_name: z.string(),
	client_description: z.string(),
	client_icon: z.string().nullable(),
	client_homepage_url: z.string(),
});

export type OAuthUserConsent = z.infer<typeof OAuthUserConsentSchema>;

export const OAuthScopeSchema = z.object({
	name: z.string(),
	description: z.string(),
	consent_title: z.string(),
	consent_description: z.string(),
	sensitive: z.boolean(),
	required: z.boolean(),
	default: z.boolean(),
});

export type OAuthScope = z.infer<typeof OAuthScopeSchema>;

export const OAuthPermissionLevelSchema = z.object({
	label: z.string(),
	value: z.string(),
	scopes: z.array(z.string()),
});

export type OAuthPermissionLevel = z.infer<typeof OAuthPermissionLevelSchema>;

export const OAuthPermissionGroupSchema = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string(),
	levels: z.array(OAuthPermissionLevelSchema),
});

export type OAuthPermissionGroup = z.infer<typeof OAuthPermissionGroupSchema>;

export const OAuthPermissionCategorySchema = z.object({
	id: z.string(),
	label: z.string(),
	groups: z.array(OAuthPermissionGroupSchema),
});

export type OAuthPermissionCategory = z.infer<typeof OAuthPermissionCategorySchema>;

export const OAuthScopesDataSchema = z.object({
	scopes: z.array(OAuthScopeSchema),
	permissions: z.array(OAuthPermissionCategorySchema),
});

export type OAuthScopesData = z.infer<typeof OAuthScopesDataSchema>;

export const OAuthOrgMemberSchema = z.object({
	id: z.string(),
	first_name: z.string().nullable(),
	last_name: z.string().nullable(),
	email: z.string().nullable(),
	photo_url: z.string().nullable(),
	role: z.string(),
});

export type OAuthOrgMember = z.infer<typeof OAuthOrgMemberSchema>;

export const OAuthKeyRotatedDataSchema = z.object({
	rotated: z.literal(true),
});

export type OAuthKeyRotatedData = z.infer<typeof OAuthKeyRotatedDataSchema>;

export const OAuthClientListResponseSchema = APIResponseSchema(z.array(OAuthClientListItemSchema));
export const OAuthClientGetResponseSchema = APIResponseSchema(OAuthClientListItemSchema);
export const OAuthClientCreateResponseSchema = APIResponseSchema(OAuthClientCreateDataSchema);
export const OAuthClientUpdateResponseSchema = APIResponseSchema(OAuthClientUpdateDataSchema);
export const OAuthClientDeleteResponseSchema = APIResponseSchema(OAuthDeletedDataSchema);
export const OAuthClientRotateSecretResponseSchema = APIResponseSchema(OAuthRotateSecretDataSchema);
export const OAuthClientUsersResponseSchema = APIResponseSchema(z.array(OAuthConsentGrantSchema));
export const OAuthClientRevokeAllUsersResponseSchema = APIResponseSchema(OAuthDeletedDataSchema);
export const OAuthClientRevokeUserResponseSchema = APIResponseSchema(OAuthDeletedDataSchema);
export const OAuthClientActivityResponseSchema = APIResponseSchema(
	z.array(OAuthClientActivityItemSchema)
);
export const OAuthBulkActivityResponseSchema = APIResponseSchema(
	z.array(OAuthBulkActivityItemSchema)
);
export const OAuthUserConsentResponseSchema = APIResponseSchema(z.array(OAuthUserConsentSchema));
export const OAuthUserConsentRevokeResponseSchema = APIResponseSchema(OAuthDeletedDataSchema);
export const OAuthScopesResponseSchema = APIResponseSchema(OAuthScopesDataSchema);
export const OAuthOrgMembersResponseSchema = APIResponseSchema(z.array(OAuthOrgMemberSchema));
export const OAuthKeysRotateResponseSchema = APIResponseSchema(OAuthKeyRotatedDataSchema);

export type OAuthClientListResponse = z.infer<typeof OAuthClientListResponseSchema>;
export type OAuthClientGetResponse = z.infer<typeof OAuthClientGetResponseSchema>;
export type OAuthClientCreateResponse = z.infer<typeof OAuthClientCreateResponseSchema>;
export type OAuthClientUpdateResponse = z.infer<typeof OAuthClientUpdateResponseSchema>;
export type OAuthClientDeleteResponse = z.infer<typeof OAuthClientDeleteResponseSchema>;
export type OAuthClientRotateSecretResponse = z.infer<typeof OAuthClientRotateSecretResponseSchema>;
export type OAuthClientUsersResponse = z.infer<typeof OAuthClientUsersResponseSchema>;
export type OAuthClientRevokeAllUsersResponse = z.infer<
	typeof OAuthClientRevokeAllUsersResponseSchema
>;
export type OAuthClientRevokeUserResponse = z.infer<typeof OAuthClientRevokeUserResponseSchema>;
export type OAuthClientActivityResponse = z.infer<typeof OAuthClientActivityResponseSchema>;
export type OAuthBulkActivityResponse = z.infer<typeof OAuthBulkActivityResponseSchema>;
export type OAuthUserConsentResponse = z.infer<typeof OAuthUserConsentResponseSchema>;
export type OAuthUserConsentRevokeResponse = z.infer<typeof OAuthUserConsentRevokeResponseSchema>;
export type OAuthScopesResponse = z.infer<typeof OAuthScopesResponseSchema>;
export type OAuthOrgMembersResponse = z.infer<typeof OAuthOrgMembersResponseSchema>;
export type OAuthKeysRotateResponse = z.infer<typeof OAuthKeysRotateResponseSchema>;

// ============================================================================
// OAuth 2.0 Authorization Code Flow Types
// ============================================================================

export const OAuthFlowConfigSchema = z.object({
	clientId: z.string().optional().describe('OAuth client ID. Defaults to OAUTH_CLIENT_ID env var'),
	clientSecret: z
		.string()
		.optional()
		.describe('OAuth client secret. Defaults to OAUTH_CLIENT_SECRET env var'),
	issuer: z
		.string()
		.optional()
		.describe(
			'OIDC issuer base URL. Defaults to OAUTH_ISSUER env var. Used to derive authorize/token/userinfo URLs'
		),
	authorizeUrl: z
		.string()
		.optional()
		.describe('Authorization endpoint. Defaults to OAUTH_AUTHORIZE_URL or {issuer}/authorize'),
	tokenUrl: z
		.string()
		.optional()
		.describe('Token endpoint. Defaults to OAUTH_TOKEN_URL or {issuer}/oauth/token'),
	userinfoUrl: z
		.string()
		.optional()
		.describe('UserInfo endpoint. Defaults to OAUTH_USERINFO_URL or {issuer}/userinfo'),
	scopes: z
		.string()
		.optional()
		.describe('Space-separated scopes. Defaults to OAUTH_SCOPES or "openid profile email"'),
	prompt: z
		.enum(['none', 'login', 'consent', 'select_account'])
		.optional()
		.describe(
			'OIDC prompt parameter. Controls authentication UX: "login" forces re-auth, "consent" forces consent screen, "none" fails if not authenticated, "select_account" lets user pick an account'
		),
});

export type OAuthFlowConfig = z.infer<typeof OAuthFlowConfigSchema>;

export const OAuthTokenResponseSchema = z.object({
	access_token: z.string(),
	token_type: z.string().optional(),
	expires_in: z.number().optional(),
	refresh_token: z.string().optional(),
	scope: z.string().optional(),
	id_token: z.string().optional(),
});

export type OAuthTokenResponse = z.infer<typeof OAuthTokenResponseSchema>;

export const OAuthUserInfoSchema = z
	.object({
		sub: z.string(),
		name: z.string().optional(),
		given_name: z.string().optional(),
		family_name: z.string().optional(),
		email: z.string().optional(),
		email_verified: z.boolean().optional(),
	})
	.catchall(z.unknown());

export type OAuthUserInfo = z.infer<typeof OAuthUserInfoSchema>;
