/**
 * API route schemas for type-safe routes.
 *
 * These schemas are used by validators to ensure proper typing in the RouteRegistry.
 */

import { s } from '@agentuity/schema';

// =============================================================================
// API Key Schemas
// =============================================================================

export const createApiKeyInput = s.object({
	name: s.optional(s.string()),
	permissions: s.optional(s.record(s.string(), s.array(s.string()))),
});

export const apiKeyOutput = s.object({
	id: s.string(),
	name: s.string(),
	key: s.optional(s.string()),
	keyPreview: s.optional(s.string()),
	start: s.optional(s.string()),
	expiresAt: s.optional(s.string()),
	createdAt: s.optional(s.string()),
	permissions: s.optional(s.record(s.string(), s.array(s.string()))),
});

export const apiKeyListOutput = s.array(apiKeyOutput);

export const deleteApiKeyOutput = s.object({
	success: s.boolean(),
	message: s.optional(s.string()),
});

// =============================================================================
// User/Auth Schemas
// =============================================================================

export const meOutput = s.object({
	id: s.string(),
	name: s.optional(s.string()),
	email: s.optional(s.string()),
	authMethod: s.optional(s.string()),
});

export const jwtOutput = s.object({
	token: s.optional(s.string()),
	jwksUrl: s.optional(s.string()),
	usage: s.optional(s.string()),
});

export const greetingOutput = s.object({
	message: s.string(),
});

// =============================================================================
// Organization Schemas
// =============================================================================

export const createOrgInput = s.object({
	name: s.string(),
	slug: s.string(),
});

export const updateOrgInput = s.object({
	name: s.optional(s.string()),
	slug: s.optional(s.string()),
	metadata: s.optional(s.record(s.string(), s.unknown())),
});

export const orgOutput = s.object({
	id: s.string(),
	name: s.optional(s.string()),
	slug: s.optional(s.string()),
	logo: s.optional(s.string()),
	createdAt: s.optional(s.string()),
});

export const orgListOutput = s.array(orgOutput);

export const whoamiOutput = s.object({
	user: s.object({
		id: s.string(),
		name: s.optional(s.string()),
		email: s.optional(s.string()),
	}),
	organization: s.optional(
		s.object({
			id: s.string(),
			name: s.optional(s.string()),
			slug: s.optional(s.string()),
			role: s.optional(s.string()),
		})
	),
});

// =============================================================================
// Member/Invitation Schemas
// =============================================================================

export const updateMemberRoleInput = s.object({
	role: s.string(),
});

export const createInvitationInput = s.object({
	email: s.string(),
	role: s.optional(s.string()),
});

// =============================================================================
// Health/Status Schemas
// =============================================================================

export const healthOutput = s.object({
	status: s.string(),
	timestamp: s.string(),
});
