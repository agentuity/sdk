/**
 * Organization plugin API types for @agentuity/auth.
 *
 * Server-side API methods for organization management provided by BetterAuth's
 * organization plugin. Includes multi-tenancy support, member management,
 * invitations, and access control.
 *
 * @see https://better-auth.com/docs/plugins/organization
 * @module agentuity/plugins/organization
 */

/**
 * Organization data returned from API calls.
 */
export interface Organization {
	id: string;
	name: string;
	slug: string;
	logo?: string | null;
	metadata?: Record<string, unknown> | null;
	createdAt?: Date;
}

/**
 * Member data within an organization.
 */
export interface OrganizationMember {
	id: string;
	userId: string;
	organizationId: string;
	role: string;
	createdAt?: Date;
	user?: {
		id: string;
		name?: string | null;
		email: string;
		image?: string | null;
	};
}

/**
 * Invitation data for organization invites.
 */
export interface OrganizationInvitation {
	id: string;
	email: string;
	role: string;
	organizationId: string;
	inviterId: string;
	status: 'pending' | 'accepted' | 'rejected' | 'canceled';
	expiresAt: Date;
	createdAt?: Date;
	organization?: Organization;
	inviter?: {
		id: string;
		name?: string | null;
		email: string;
	};
}

/**
 * Server-side API methods for organization management.
 *
 * These methods are added by the BetterAuth organization plugin and provide
 * multi-tenancy support including creating organizations, managing members,
 * and handling invitations.
 *
 * @see https://better-auth.com/docs/plugins/organization
 */
export interface OrganizationApiMethods {
	// =========================================================================
	// Organization CRUD
	// =========================================================================

	/**
	 * Create a new organization.
	 *
	 * The creator becomes the owner by default. If session headers are provided,
	 * the organization is created for the authenticated user. If `userId` is
	 * provided without headers (server-side only), it creates for that user.
	 */
	createOrganization: (params: {
		body: {
			name: string;
			slug: string;
			logo?: string;
			metadata?: Record<string, unknown>;
			userId?: string;
			keepCurrentActiveOrganization?: boolean;
		};
		headers?: Headers;
	}) => Promise<Organization>;

	/**
	 * List all organizations the user is a member of.
	 */
	listOrganizations: (params: { headers?: Headers }) => Promise<Organization[]>;

	/**
	 * Get full organization details including members.
	 *
	 * By default uses the active organization. Pass `organizationId` or
	 * `organizationSlug` to get a specific organization.
	 */
	getFullOrganization: (params: {
		query?: {
			organizationId?: string;
			organizationSlug?: string;
			membersLimit?: number;
		};
		headers?: Headers;
	}) => Promise<
		| (Organization & {
				members?: OrganizationMember[];
		  })
		| null
	>;

	/**
	 * Set the active organization for the current session.
	 *
	 * Pass `organizationId: null` to unset the active organization.
	 */
	setActiveOrganization: (params: {
		body: { organizationId: string | null; organizationSlug?: string };
		headers?: Headers;
	}) => Promise<Organization | null>;

	/**
	 * Update organization details.
	 *
	 * Requires appropriate permissions (typically owner or admin role).
	 */
	updateOrganization: (params: {
		body: {
			organizationId?: string;
			data: {
				name?: string;
				slug?: string;
				logo?: string | null;
				metadata?: Record<string, unknown> | null;
			};
		};
		headers?: Headers;
	}) => Promise<Organization>;

	/**
	 * Delete an organization.
	 *
	 * Requires owner role. All members, invitations, and organization data
	 * will be removed.
	 */
	deleteOrganization: (params: {
		body: { organizationId: string };
		headers?: Headers;
	}) => Promise<{ success: boolean }>;

	/**
	 * Check if an organization slug is available.
	 */
	checkOrganizationSlug: (params: {
		body: { slug: string };
		headers?: Headers;
	}) => Promise<{ status: boolean }>;

	// =========================================================================
	// Invitation Management
	// =========================================================================

	/**
	 * Create an invitation to join an organization.
	 *
	 * Sends an invitation email to the specified address. The user can then
	 * accept or reject the invitation.
	 */
	createInvitation: (params: {
		body: {
			email: string;
			role: string | string[];
			organizationId?: string;
			resend?: boolean;
			teamId?: string;
		};
		headers?: Headers;
	}) => Promise<OrganizationInvitation>;

	/**
	 * Get details of a specific invitation.
	 */
	getInvitation: (params: {
		query: { id: string };
		headers?: Headers;
	}) => Promise<OrganizationInvitation | null>;

	/**
	 * List all invitations for an organization.
	 *
	 * Defaults to the active organization if `organizationId` is not provided.
	 */
	listInvitations: (params: {
		query?: { organizationId?: string };
		headers?: Headers;
	}) => Promise<OrganizationInvitation[]>;

	/**
	 * List all pending invitations for the current user.
	 *
	 * On the server, you can pass `email` to query for a specific user's invitations.
	 */
	listUserInvitations: (params: {
		query?: { email?: string };
		headers?: Headers;
	}) => Promise<OrganizationInvitation[]>;

	/**
	 * Accept an invitation to join an organization.
	 *
	 * The user must be authenticated. After accepting, they become a member
	 * of the organization with the role specified in the invitation.
	 */
	acceptInvitation: (params: {
		body: { invitationId: string };
		headers?: Headers;
	}) => Promise<{ success: boolean; member?: OrganizationMember }>;

	/**
	 * Reject an invitation to join an organization.
	 */
	rejectInvitation: (params: {
		body: { invitationId: string };
		headers?: Headers;
	}) => Promise<{ success: boolean }>;

	/**
	 * Cancel a pending invitation.
	 *
	 * Typically used by organization admins to revoke an invitation.
	 */
	cancelInvitation: (params: {
		body: { invitationId: string };
		headers?: Headers;
	}) => Promise<{ success: boolean }>;

	// =========================================================================
	// Member Management
	// =========================================================================

	/**
	 * List all members of an organization.
	 *
	 * Supports pagination, sorting, and filtering.
	 */
	listMembers: (params: {
		query?: {
			organizationId?: string;
			limit?: number;
			offset?: number;
			sortBy?: string;
			sortDirection?: 'asc' | 'desc';
			filterField?: string;
			filterOperator?: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'contains';
			filterValue?: string;
		};
		headers?: Headers;
	}) => Promise<OrganizationMember[]>;

	/**
	 * Add a member directly to an organization (server-only).
	 *
	 * Unlike invitations, this immediately adds the user as a member.
	 * Typically used for admin scripts, migrations, or automated onboarding.
	 */
	addMember: (params: {
		body: {
			userId?: string | null;
			role: string | string[];
			organizationId?: string;
			teamId?: string;
		};
		headers?: Headers;
	}) => Promise<OrganizationMember>;

	/**
	 * Remove a member from an organization.
	 */
	removeMember: (params: {
		body: { memberIdOrEmail: string; organizationId?: string };
		headers?: Headers;
	}) => Promise<{ success: boolean }>;

	/**
	 * Update a member's role in an organization.
	 */
	updateMemberRole: (params: {
		body: {
			memberId: string;
			role: string | string[];
			organizationId?: string;
		};
		headers?: Headers;
	}) => Promise<{ success: boolean }>;

	/**
	 * Get the current user's member record in the active organization.
	 */
	getActiveMember: (params: { headers?: Headers }) => Promise<OrganizationMember | null>;

	/**
	 * Get the current user's role in the active organization.
	 */
	getActiveMemberRole: (params: { headers?: Headers }) => Promise<{ role: string | null }>;

	/**
	 * Leave an organization.
	 *
	 * The current user will be removed from the organization.
	 */
	leaveOrganization: (params: {
		body: { organizationId: string };
		headers?: Headers;
	}) => Promise<{ success: boolean }>;

	// =========================================================================
	// Access Control / Permissions
	// =========================================================================

	/**
	 * Check if the current user has specific permissions.
	 *
	 * Works with BetterAuth's access control system. The permissions object
	 * maps resources to arrays of required actions.
	 *
	 * @example
	 * ```typescript
	 * const result = await auth.api.hasPermission({
	 *   body: { permissions: { project: ['create', 'update'] } },
	 *   headers,
	 * });
	 * ```
	 */
	hasPermission: (params: {
		body: { permissions: Record<string, string[]> };
		headers?: Headers;
	}) => Promise<{ success: boolean }>;
}
