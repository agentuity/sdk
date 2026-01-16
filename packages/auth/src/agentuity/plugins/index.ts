/**
 * Plugin type exports for @agentuity/auth.
 *
 * This module re-exports all plugin-specific types and interfaces for
 * convenient access. Each plugin has its own file for easier maintenance.
 *
 * @module agentuity/plugins
 */

// Organization plugin
export type {
	Organization,
	OrganizationMember,
	OrganizationInvitation,
	OrganizationApiMethods,
} from './organization';

// API Key plugin
export type { ApiKey, ApiKeyPluginOptions, ApiKeyApiMethods } from './api-key';
export { DEFAULT_API_KEY_OPTIONS } from './api-key';

// JWT plugin
export type { JwtApiMethods } from './jwt';

/**
 * Combined API extensions from all default plugins.
 *
 * This type represents all the server-side API methods added by the
 * default Agentuity auth plugins (organization, jwt, bearer, apiKey).
 */
import type { OrganizationApiMethods } from './organization';
import type { ApiKeyApiMethods } from './api-key';
import type { JwtApiMethods } from './jwt';

export type DefaultPluginApiMethods = OrganizationApiMethods & ApiKeyApiMethods & JwtApiMethods;
