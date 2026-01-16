import { describe, it, expect } from 'bun:test';
import { getTableName } from 'drizzle-orm';
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
		it('user table has required columns', () => {
			const columns = Object.keys(schema.user);
			expect(columns).toContain('id');
			expect(columns).toContain('name');
			expect(columns).toContain('email');
			expect(columns).toContain('emailVerified');
			expect(columns).toContain('createdAt');
			expect(columns).toContain('updatedAt');
		});

		it('session table has required columns', () => {
			const columns = Object.keys(schema.session);
			expect(columns).toContain('id');
			expect(columns).toContain('token');
			expect(columns).toContain('userId');
			expect(columns).toContain('expiresAt');
			expect(columns).toContain('activeOrganizationId');
		});

		it('apikey table has required columns', () => {
			const columns = Object.keys(schema.apikey);
			expect(columns).toContain('id');
			expect(columns).toContain('key');
			expect(columns).toContain('userId');
			expect(columns).toContain('permissions');
			expect(columns).toContain('metadata');
		});

		it('organization table has required columns', () => {
			const columns = Object.keys(schema.organization);
			expect(columns).toContain('id');
			expect(columns).toContain('name');
			expect(columns).toContain('slug');
			expect(columns).toContain('metadata');
		});
	});
});
