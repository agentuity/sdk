import { describe, test, expect } from 'bun:test';
import { createScopeChecker, createRoleScopeChecker } from '../../src/agentuity/agent';

describe('createScopeChecker', () => {
	test('returns true for matching scope', () => {
		const hasScope = createScopeChecker(['read', 'write']);
		expect(hasScope('read')).toBe(true);
		expect(hasScope('write')).toBe(true);
	});

	test('returns false for non-matching scope', () => {
		const hasScope = createScopeChecker(['read', 'write']);
		expect(hasScope('delete')).toBe(false);
		expect(hasScope('admin')).toBe(false);
	});

	test('wildcard (*) matches any scope', () => {
		const hasScope = createScopeChecker(['*']);
		expect(hasScope('read')).toBe(true);
		expect(hasScope('write')).toBe(true);
		expect(hasScope('anything')).toBe(true);
	});

	test('empty scopes returns false for any check', () => {
		const hasScope = createScopeChecker([]);
		expect(hasScope('read')).toBe(false);
	});
});

describe('createRoleScopeChecker', () => {
	const roleScopes = {
		owner: ['*'],
		admin: ['user:read', 'user:write', 'project:read', 'project:write'],
		member: ['project:read'],
		viewer: [],
	};

	test('maps owner role to wildcard scope', () => {
		const hasScope = createRoleScopeChecker('owner', roleScopes);
		expect(hasScope('anything')).toBe(true);
		expect(hasScope('user:delete')).toBe(true);
	});

	test('maps admin role to specific scopes', () => {
		const hasScope = createRoleScopeChecker('admin', roleScopes);
		expect(hasScope('user:read')).toBe(true);
		expect(hasScope('user:write')).toBe(true);
		expect(hasScope('project:read')).toBe(true);
		expect(hasScope('user:delete')).toBe(false);
	});

	test('maps member role to limited scopes', () => {
		const hasScope = createRoleScopeChecker('member', roleScopes);
		expect(hasScope('project:read')).toBe(true);
		expect(hasScope('project:write')).toBe(false);
		expect(hasScope('user:read')).toBe(false);
	});

	test('maps viewer role to no scopes', () => {
		const hasScope = createRoleScopeChecker('viewer', roleScopes);
		expect(hasScope('project:read')).toBe(false);
		expect(hasScope('anything')).toBe(false);
	});

	test('handles null role', () => {
		const hasScope = createRoleScopeChecker(null, roleScopes);
		expect(hasScope('anything')).toBe(false);
	});

	test('handles undefined role', () => {
		const hasScope = createRoleScopeChecker(undefined, roleScopes);
		expect(hasScope('anything')).toBe(false);
	});

	test('handles unknown role', () => {
		const hasScope = createRoleScopeChecker('guest', roleScopes);
		expect(hasScope('anything')).toBe(false);
	});
});
