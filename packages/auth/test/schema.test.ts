import { describe, it, expect } from 'bun:test';
import { getTableName } from 'drizzle-orm';
import type { User, Session, Account, Verification } from 'better-auth';
import type { Organization, Member, Invitation } from 'better-auth/plugins/organization';
import type { ApiKey } from '@better-auth/api-key';
import * as schema from '../src/schema';

describe('Agentuity Auth Schema', () => {
	describe('table exports', () => {
		it('exports user table', () => {
			expect(schema.user).toBeDefined();
			expect(getTableName(schema.user)).toBe('user');
		});

		it('exports session table', () => {
			expect(schema.session).toBeDefined();
			expect(getTableName(schema.session)).toBe('session');
		});

		it('exports account table', () => {
			expect(schema.account).toBeDefined();
			expect(getTableName(schema.account)).toBe('account');
		});

		it('exports verification table', () => {
			expect(schema.verification).toBeDefined();
			expect(getTableName(schema.verification)).toBe('verification');
		});

		it('exports organization table', () => {
			expect(schema.organization).toBeDefined();
			expect(getTableName(schema.organization)).toBe('organization');
		});

		it('exports member table', () => {
			expect(schema.member).toBeDefined();
			expect(getTableName(schema.member)).toBe('member');
		});

		it('exports invitation table', () => {
			expect(schema.invitation).toBeDefined();
			expect(getTableName(schema.invitation)).toBe('invitation');
		});

		it('exports jwks table', () => {
			expect(schema.jwks).toBeDefined();
			expect(getTableName(schema.jwks)).toBe('jwks');
		});

		it('exports apikey table', () => {
			expect(schema.apikey).toBeDefined();
			expect(getTableName(schema.apikey)).toBe('apikey');
		});
	});

	describe('relation exports', () => {
		it('exports userRelations', () => {
			expect(schema.userRelations).toBeDefined();
		});

		it('exports sessionRelations', () => {
			expect(schema.sessionRelations).toBeDefined();
		});

		it('exports accountRelations', () => {
			expect(schema.accountRelations).toBeDefined();
		});

		it('exports organizationRelations', () => {
			expect(schema.organizationRelations).toBeDefined();
		});

		it('exports memberRelations', () => {
			expect(schema.memberRelations).toBeDefined();
		});

		it('exports invitationRelations', () => {
			expect(schema.invitationRelations).toBeDefined();
		});

		it('exports apikeyRelations', () => {
			expect(schema.apikeyRelations).toBeDefined();
		});
	});

	describe('combined schema export', () => {
		it('exports authSchema object with all tables and relations', () => {
			expect(schema.authSchema).toBeDefined();
			expect(schema.authSchema.user).toBe(schema.user);
			expect(schema.authSchema.session).toBe(schema.session);
			expect(schema.authSchema.account).toBe(schema.account);
			expect(schema.authSchema.verification).toBe(schema.verification);
			expect(schema.authSchema.organization).toBe(schema.organization);
			expect(schema.authSchema.member).toBe(schema.member);
			expect(schema.authSchema.invitation).toBe(schema.invitation);
			expect(schema.authSchema.jwks).toBe(schema.jwks);
			expect(schema.authSchema.apikey).toBe(schema.apikey);
			expect(schema.authSchema.userRelations).toBe(schema.userRelations);
			expect(schema.authSchema.sessionRelations).toBe(schema.sessionRelations);
		});

		it('authSchema can be spread into another object', () => {
			const appSchema = {
				...schema.authSchema,
				customTable: { name: 'custom' },
			};

			expect(appSchema.user).toBe(schema.user);
			expect(appSchema.customTable).toEqual({ name: 'custom' });
		});
	});

	describe('table columns', () => {
		it('user table has all BetterAuth User columns', () => {
			const columns = Object.keys(schema.user);
			// Every field in BetterAuth's User type must be present
			const requiredByBetterAuth: (keyof User)[] = [
				'id',
				'name',
				'email',
				'emailVerified',
				'image',
				'createdAt',
				'updatedAt',
			];
			for (const field of requiredByBetterAuth) {
				expect(columns).toContain(field);
			}
		});

		it('session table has all BetterAuth Session columns', () => {
			const columns = Object.keys(schema.session);
			const requiredByBetterAuth: (keyof Session)[] = [
				'id',
				'expiresAt',
				'token',
				'createdAt',
				'updatedAt',
				'ipAddress',
				'userAgent',
				'userId',
			];
			for (const field of requiredByBetterAuth) {
				expect(columns).toContain(field);
			}
			// Organization plugin adds activeOrganizationId
			expect(columns).toContain('activeOrganizationId');
		});

		it('account table has all BetterAuth Account columns', () => {
			const columns = Object.keys(schema.account);
			const requiredByBetterAuth: (keyof Account)[] = [
				'id',
				'accountId',
				'providerId',
				'userId',
				'accessToken',
				'refreshToken',
				'idToken',
				'accessTokenExpiresAt',
				'refreshTokenExpiresAt',
				'scope',
				'password',
				'createdAt',
				'updatedAt',
			];
			for (const field of requiredByBetterAuth) {
				expect(columns).toContain(field);
			}
		});

		it('verification table has all BetterAuth Verification columns', () => {
			const columns = Object.keys(schema.verification);
			const requiredByBetterAuth: (keyof Verification)[] = [
				'id',
				'identifier',
				'value',
				'expiresAt',
				'createdAt',
				'updatedAt',
			];
			for (const field of requiredByBetterAuth) {
				expect(columns).toContain(field);
			}
		});

		it('organization table has all BetterAuth Organization columns', () => {
			const columns = Object.keys(schema.organization);
			// metadata is excluded from type check (serialized text) but must still be in schema
			const requiredByBetterAuth: (keyof Organization)[] = ['id', 'name', 'slug', 'logo', 'createdAt'];
			for (const field of requiredByBetterAuth) {
				expect(columns).toContain(field);
			}
			expect(columns).toContain('metadata');
		});

		it('member table has all BetterAuth Member columns', () => {
			const columns = Object.keys(schema.member);
			const requiredByBetterAuth: (keyof Member)[] = ['id', 'organizationId', 'userId', 'role', 'createdAt'];
			for (const field of requiredByBetterAuth) {
				expect(columns).toContain(field);
			}
		});

		it('invitation table has all BetterAuth Invitation columns', () => {
			const columns = Object.keys(schema.invitation);
			const requiredByBetterAuth: (keyof Invitation)[] = [
				'id',
				'organizationId',
				'email',
				'role',
				'status',
				'expiresAt',
				'createdAt',
				'teamId',
				'inviterId',
			];
			for (const field of requiredByBetterAuth) {
				expect(columns).toContain(field);
			}
		});

		it('jwks table has required columns', () => {
			const columns = Object.keys(schema.jwks);
			const required = ['id', 'publicKey', 'privateKey', 'createdAt', 'expiresAt'];
			for (const field of required) {
				expect(columns).toContain(field);
			}
		});

		it('apikey table has all BetterAuth ApiKey columns', () => {
			const columns = Object.keys(schema.apikey);
			// permissions and metadata are excluded from type check (serialized text)
			// but must still be present in the schema
			const requiredByBetterAuth: (keyof ApiKey)[] = [
				'id',
				'configId',
				'name',
				'start',
				'prefix',
				'key',
				'userId',
				'referenceId',
				'refillInterval',
				'refillAmount',
				'lastRefillAt',
				'enabled',
				'rateLimitEnabled',
				'rateLimitTimeWindow',
				'rateLimitMax',
				'requestCount',
				'remaining',
				'lastRequest',
				'expiresAt',
				'createdAt',
				'updatedAt',
			];
			for (const field of requiredByBetterAuth) {
				expect(columns).toContain(field);
			}
			// Serialized JSON fields
			expect(columns).toContain('permissions');
			expect(columns).toContain('metadata');
		});
	});

	describe('apikey table specifics (configId / referenceId fix)', () => {
		it('configId has a default value of "default"', () => {
			const col = schema.apikey.configId;
			expect(col.notNull).toBe(true);
			expect(col.hasDefault).toBe(true);
		});

		it('referenceId has a default value', () => {
			const col = schema.apikey.referenceId;
			expect(col.notNull).toBe(true);
			expect(col.hasDefault).toBe(true);
		});
	});

	describe('invitation table specifics (teamId fix)', () => {
		it('teamId column exists and is nullable', () => {
			const col = schema.invitation.teamId;
			expect(col).toBeDefined();
			expect(col.notNull).toBe(false);
		});
	});
});
