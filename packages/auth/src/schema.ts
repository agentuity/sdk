/**
 * Agentuity Auth Drizzle schema.
 *
 * Provides type-safe Drizzle table definitions for BetterAuth with Agentuity's
 * default plugins (organization, JWT, bearer, API key).
 *
 * @module agentuity/schema
 *
 * @example Merge with your app schema
 * ```typescript
 * import * as authSchema from '@agentuity/auth/schema';
 * import { drizzle } from 'drizzle-orm/bun-sql';
 *
 * const schema = { ...authSchema, ...myAppSchema };
 * const db = drizzle(connectionString, { schema });
 * ```
 */

import { pgTable, text, boolean, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { relations, type InferSelectModel } from 'drizzle-orm';
import type {
	User as BetterAuthUser,
	Session as BetterAuthSession,
	Account as BetterAuthAccount,
	Verification as BetterAuthVerification,
} from 'better-auth';
import type {
	Organization as BetterAuthOrganization,
	Member as BetterAuthMember,
	Invitation as BetterAuthInvitation,
} from 'better-auth/plugins/organization';
import type { ApiKey } from '@better-auth/api-key';

// =============================================================================
// BetterAuth Core Tables
// =============================================================================

export const user = pgTable('user', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: boolean('emailVerified').notNull().default(false),
	image: text('image'),
	createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow().notNull(),
});

export const session = pgTable(
	'session',
	{
		id: text('id').primaryKey(),
		expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
		token: text('token').notNull().unique(),
		createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull(),
		ipAddress: text('ipAddress'),
		userAgent: text('userAgent'),
		userId: text('userId')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		activeOrganizationId: text('activeOrganizationId'),
	},
	(table) => [index('session_userId_idx').on(table.userId)]
);

export const account = pgTable(
	'account',
	{
		id: text('id').primaryKey(),
		accountId: text('accountId').notNull(),
		providerId: text('providerId').notNull(),
		userId: text('userId')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		accessToken: text('accessToken'),
		refreshToken: text('refreshToken'),
		idToken: text('idToken'),
		accessTokenExpiresAt: timestamp('accessTokenExpiresAt', { withTimezone: true }),
		refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt', { withTimezone: true }),
		scope: text('scope'),
		password: text('password'),
		createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull(),
	},
	(table) => [index('account_userId_idx').on(table.userId)]
);

export const verification = pgTable(
	'verification',
	{
		id: text('id').primaryKey(),
		identifier: text('identifier').notNull(),
		value: text('value').notNull(),
		expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
		createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [index('verification_identifier_idx').on(table.identifier)]
);

// =============================================================================
// Organization Plugin Tables
// =============================================================================

export const organization = pgTable('organization', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	slug: text('slug').notNull().unique(),
	logo: text('logo'),
	createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
	metadata: text('metadata'),
});

export const member = pgTable(
	'member',
	{
		id: text('id').primaryKey(),
		organizationId: text('organizationId')
			.notNull()
			.references(() => organization.id, { onDelete: 'cascade' }),
		userId: text('userId')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		role: text('role').notNull(),
		createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		index('member_organizationId_idx').on(table.organizationId),
		index('member_userId_idx').on(table.userId),
	]
);

export const invitation = pgTable(
	'invitation',
	{
		id: text('id').primaryKey(),
		organizationId: text('organizationId')
			.notNull()
			.references(() => organization.id, { onDelete: 'cascade' }),
		email: text('email').notNull(),
		role: text('role'),
		status: text('status').notNull(),
		expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
		createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
		teamId: text('teamId'),
		inviterId: text('inviterId')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
	},
	(table) => [
		index('invitation_organizationId_idx').on(table.organizationId),
		index('invitation_email_idx').on(table.email),
	]
);

// =============================================================================
// JWT Plugin Table
// =============================================================================

export const jwks = pgTable('jwks', {
	id: text('id').primaryKey(),
	publicKey: text('publicKey').notNull(),
	privateKey: text('privateKey').notNull(),
	createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
	expiresAt: timestamp('expiresAt', { withTimezone: true }),
});

// =============================================================================
// API Key Plugin Table
// =============================================================================

export const apikey = pgTable(
	'apikey',
	{
		id: text('id').primaryKey(),
		configId: text('configId').notNull().default('default'),
		name: text('name'),
		start: text('start'),
		prefix: text('prefix'),
		key: text('key').notNull(),
		userId: text('userId')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		referenceId: text('referenceId').notNull().default(''),
		refillInterval: integer('refillInterval'),
		refillAmount: integer('refillAmount'),
		lastRefillAt: timestamp('lastRefillAt', { withTimezone: true }),
		enabled: boolean('enabled').notNull().default(true),
		rateLimitEnabled: boolean('rateLimitEnabled').notNull().default(true),
		rateLimitTimeWindow: integer('rateLimitTimeWindow').notNull().default(86400000),
		rateLimitMax: integer('rateLimitMax').notNull().default(10),
		requestCount: integer('requestCount').notNull().default(0),
		remaining: integer('remaining'),
		lastRequest: timestamp('lastRequest', { withTimezone: true }),
		expiresAt: timestamp('expiresAt', { withTimezone: true }),
		createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow().notNull(),
		permissions: text('permissions'),
		metadata: text('metadata'),
	},
	(table) => [
		index('apikey_userId_idx').on(table.userId),
		index('apikey_key_idx').on(table.key),
		index('apikey_configId_idx').on(table.configId),
		index('apikey_referenceId_idx').on(table.referenceId),
	]
);

// =============================================================================
// Relations (required for BetterAuth join optimization)
// =============================================================================

export const userRelations = relations(user, ({ many }) => ({
	sessions: many(session),
	accounts: many(account),
	members: many(member),
	apikeys: many(apikey),
	invitations: many(invitation),
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id],
	}),
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id],
	}),
}));

export const organizationRelations = relations(organization, ({ many }) => ({
	members: many(member),
	invitations: many(invitation),
}));

export const memberRelations = relations(member, ({ one }) => ({
	organization: one(organization, {
		fields: [member.organizationId],
		references: [organization.id],
	}),
	user: one(user, {
		fields: [member.userId],
		references: [user.id],
	}),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
	organization: one(organization, {
		fields: [invitation.organizationId],
		references: [organization.id],
	}),
	inviter: one(user, {
		fields: [invitation.inviterId],
		references: [user.id],
	}),
}));

export const apikeyRelations = relations(apikey, ({ one }) => ({
	user: one(user, {
		fields: [apikey.userId],
		references: [user.id],
	}),
}));

// =============================================================================
// Combined schema export (for easy spreading into app schema)
// =============================================================================

// =============================================================================
// Compile-time type assertions: Drizzle schema ↔ BetterAuth models
// =============================================================================

/**
 * Compile-time check that every field a BetterAuth model expects is present
 * in the corresponding Drizzle table.
 *
 * How it works:
 *   1. A mapped type checks each key in the BetterAuth model (minus Excluded)
 *      and resolves to `true` if the key exists in the Drizzle row, or to a
 *      descriptive error-string literal if it does not.
 *   2. Indexing the mapped type with `[keyof ...]` collapses it to a union of
 *      all values: either all `true`, or `true | "ERROR: …"`.
 *   3. We then strip `true` from the union via `Exclude`. If no errors remain
 *      (`extends never`), the final type is `true`. Otherwise it is only the
 *      error-string literal(s) — so `const x: EnsureAllKeysPresent<…> = true`
 *      will fail because `true` is not assignable to an error-string type.
 *
 * Fields stored as serialized text in the DB but expected as parsed objects
 * by BetterAuth (permissions, metadata) are excluded via the Omit parameter.
 */
type _FieldCheck<BetterAuthModel, DrizzleRow, Excluded extends string = never> = {
	[K in keyof Omit<BetterAuthModel, Excluded>]-?: K extends keyof DrizzleRow
		? true
		: `ERROR: BetterAuth field "${K & string}" is missing from the Drizzle schema`;
}[keyof Omit<BetterAuthModel, Excluded>];

type EnsureAllKeysPresent<BetterAuthModel, DrizzleRow, Excluded extends string = never> =
	Exclude<_FieldCheck<BetterAuthModel, DrizzleRow, Excluded>, true> extends never
		? true
		: Exclude<_FieldCheck<BetterAuthModel, DrizzleRow, Excluded>, true>;

// --- Core tables ---
const _assertUser: EnsureAllKeysPresent<BetterAuthUser, InferSelectModel<typeof user>> = true;
const _assertSession: EnsureAllKeysPresent<
	BetterAuthSession,
	InferSelectModel<typeof session>
> = true;
const _assertAccount: EnsureAllKeysPresent<
	BetterAuthAccount,
	InferSelectModel<typeof account>
> = true;
const _assertVerification: EnsureAllKeysPresent<
	BetterAuthVerification,
	InferSelectModel<typeof verification>
> = true;

// --- Organization plugin tables ---
// Organization.metadata is serialized text in DB but an object in the BetterAuth type.
const _assertOrganization: EnsureAllKeysPresent<
	BetterAuthOrganization,
	InferSelectModel<typeof organization>,
	'metadata'
> = true;
const _assertMember: EnsureAllKeysPresent<BetterAuthMember, InferSelectModel<typeof member>> = true;
const _assertInvitation: EnsureAllKeysPresent<
	BetterAuthInvitation,
	InferSelectModel<typeof invitation>
> = true;

// --- API Key plugin table ---
// permissions and metadata are serialized text in DB but objects in the BetterAuth type.
const _assertApiKey: EnsureAllKeysPresent<
	ApiKey,
	InferSelectModel<typeof apikey>,
	'permissions' | 'metadata'
> = true;

// Suppress unused-variable warnings.
void _assertUser;
void _assertSession;
void _assertAccount;
void _assertVerification;
void _assertOrganization;
void _assertMember;
void _assertInvitation;
void _assertApiKey;

export const authSchema = {
	user,
	session,
	account,
	verification,
	organization,
	member,
	invitation,
	jwks,
	apikey,
	userRelations,
	sessionRelations,
	accountRelations,
	organizationRelations,
	memberRelations,
	invitationRelations,
	apikeyRelations,
};
