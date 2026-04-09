/**
 * Auth types for @agentuity/auth.
 *
 * These types are now defined in @agentuity/core for better dependency management.
 * This module re-exports them for backwards compatibility.
 *
 * @module agentuity/types
 */

// Re-export all auth types from core
export type {
	AuthUser,
	AuthSession,
	AuthContext,
	AuthOrgContext,
	AuthApiKeyPermissions,
	AuthApiKeyContext,
	AuthMethod,
	AgentuityAuth,
	AuthOrgHelpers,
	AuthApiKeyHelpers,
	AuthInterface,
} from '@agentuity/core';
