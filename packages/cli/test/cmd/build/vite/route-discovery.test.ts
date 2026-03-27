import { describe, test, expect } from 'bun:test';
import {
	detectRouteConflicts,
	extractPathParams,
	generateRouteId,
} from '../../../../src/cmd/build/vite/route-discovery';

describe('extractPathParams', () => {
	test('should extract basic path params', () => {
		expect(extractPathParams('/api/users/:id')).toEqual(['id']);
	});

	test('should extract multiple path params', () => {
		expect(extractPathParams('/api/users/:userId/posts/:postId')).toEqual(['userId', 'postId']);
	});

	test('should extract optional path params', () => {
		expect(extractPathParams('/api/users/:id?')).toEqual(['id']);
	});

	test('should extract wildcard path params', () => {
		expect(extractPathParams('/api/*path')).toEqual(['path']);
	});

	test('should return empty array for no params', () => {
		expect(extractPathParams('/api/users')).toEqual([]);
	});

	test('should handle root path', () => {
		expect(extractPathParams('/')).toEqual([]);
	});

	test('should handle mixed params and static segments', () => {
		expect(extractPathParams('/api/:version/users/:id/profile')).toEqual(['version', 'id']);
	});
});

describe('generateRouteId', () => {
	test('should use route_ prefix (matching platform format)', () => {
		const id = generateRouteId(
			'proj_1',
			'deploy_1',
			'api',
			'GET',
			'src/api/index.ts',
			'/api/hello',
			'v1'
		);
		expect(id).toMatch(/^route_[0-9a-f]{40}$/);
	});

	test('should produce deterministic IDs', () => {
		const a = generateRouteId(
			'proj_1',
			'deploy_1',
			'api',
			'GET',
			'src/api/index.ts',
			'/api/hello',
			'v1'
		);
		const b = generateRouteId(
			'proj_1',
			'deploy_1',
			'api',
			'GET',
			'src/api/index.ts',
			'/api/hello',
			'v1'
		);
		expect(a).toBe(b);
	});

	test('should produce different IDs for different paths', () => {
		const a = generateRouteId(
			'proj_1',
			'deploy_1',
			'api',
			'GET',
			'src/api/index.ts',
			'/api/hello',
			'v1'
		);
		const b = generateRouteId(
			'proj_1',
			'deploy_1',
			'api',
			'GET',
			'src/api/index.ts',
			'/api/world',
			'v1'
		);
		expect(a).not.toBe(b);
	});

	test('should produce different IDs for different methods', () => {
		const a = generateRouteId(
			'proj_1',
			'deploy_1',
			'api',
			'GET',
			'src/api/index.ts',
			'/api/hello',
			'v1'
		);
		const b = generateRouteId(
			'proj_1',
			'deploy_1',
			'api',
			'POST',
			'src/api/index.ts',
			'/api/hello',
			'v1'
		);
		expect(a).not.toBe(b);
	});

	test('should produce different IDs for different deployments', () => {
		const a = generateRouteId(
			'proj_1',
			'deploy_1',
			'api',
			'GET',
			'src/api/index.ts',
			'/api/hello',
			'v1'
		);
		const b = generateRouteId(
			'proj_1',
			'deploy_2',
			'api',
			'GET',
			'src/api/index.ts',
			'/api/hello',
			'v1'
		);
		expect(a).not.toBe(b);
	});

	test('should produce different IDs for different route types', () => {
		const a = generateRouteId(
			'proj_1',
			'deploy_1',
			'api',
			'GET',
			'src/api/index.ts',
			'/api/hello',
			'v1'
		);
		const b = generateRouteId(
			'proj_1',
			'deploy_1',
			'websocket',
			'GET',
			'src/api/index.ts',
			'/api/hello',
			'v1'
		);
		expect(a).not.toBe(b);
	});

	test('should produce different IDs for different versions', () => {
		const a = generateRouteId(
			'proj_1',
			'deploy_1',
			'api',
			'GET',
			'src/api/index.ts',
			'/api/hello',
			'v1'
		);
		const b = generateRouteId(
			'proj_1',
			'deploy_1',
			'api',
			'GET',
			'src/api/index.ts',
			'/api/hello',
			'v2'
		);
		expect(a).not.toBe(b);
	});

	test('should match platform SHA1 hash format', () => {
		// This verifies compatibility with the platform's route ID generation (ast.ts hashSHA1)
		// The hash is SHA1 of each component updated separately: projectId, deploymentId, type, method, filename, path, version
		const id = generateRouteId(
			'proj_123',
			'deploy_456',
			'api',
			'GET',
			'src/api/index.ts',
			'/api/agent-calls',
			'abc123'
		);
		expect(id).toBe('route_44d47b2af876df4bf7d9344f5726511f5bd400da');
	});
});

describe('detectRouteConflicts', () => {
	test('should detect duplicate routes', () => {
		const routes = [
			{ method: 'GET', path: '/api/hello', filename: 'a.ts' },
			{ method: 'GET', path: '/api/hello', filename: 'b.ts' },
		];
		const conflicts = detectRouteConflicts(routes);
		expect(conflicts).toHaveLength(1);
		expect(conflicts[0].type).toBe('duplicate');
	});

	test('should allow same path with different methods', () => {
		const routes = [
			{ method: 'GET', path: '/api/hello', filename: 'a.ts' },
			{ method: 'POST', path: '/api/hello', filename: 'a.ts' },
		];
		const conflicts = detectRouteConflicts(routes);
		expect(conflicts).toHaveLength(0);
	});

	test('should detect duplicate methods with different cases', () => {
		const routes = [
			{ method: 'get', path: '/api/hello', filename: 'a.ts' },
			{ method: 'GET', path: '/api/hello', filename: 'b.ts' },
		];
		const conflicts = detectRouteConflicts(routes);
		expect(conflicts).toHaveLength(1);
	});

	test('should return empty for no conflicts', () => {
		const routes = [
			{ method: 'GET', path: '/api/hello', filename: 'a.ts' },
			{ method: 'GET', path: '/api/world', filename: 'b.ts' },
		];
		const conflicts = detectRouteConflicts(routes);
		expect(conflicts).toHaveLength(0);
	});

	test('should return empty for empty routes', () => {
		expect(detectRouteConflicts([])).toHaveLength(0);
	});
});
