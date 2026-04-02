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
			'get',
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
			'get',
			'src/api/index.ts',
			'/api/hello',
			'v1'
		);
		const b = generateRouteId(
			'proj_1',
			'deploy_1',
			'api',
			'get',
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
			'get',
			'src/api/index.ts',
			'/api/hello',
			'v1'
		);
		const b = generateRouteId(
			'proj_1',
			'deploy_1',
			'api',
			'get',
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
			'get',
			'src/api/index.ts',
			'/api/hello',
			'v1'
		);
		const b = generateRouteId(
			'proj_1',
			'deploy_1',
			'api',
			'post',
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
			'get',
			'src/api/index.ts',
			'/api/hello',
			'v1'
		);
		const b = generateRouteId(
			'proj_1',
			'deploy_2',
			'api',
			'get',
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
			'get',
			'src/api/index.ts',
			'/api/hello',
			'v1'
		);
		const b = generateRouteId(
			'proj_1',
			'deploy_1',
			'websocket',
			'get',
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
			'get',
			'src/api/index.ts',
			'/api/hello',
			'v1'
		);
		const b = generateRouteId(
			'proj_1',
			'deploy_1',
			'api',
			'get',
			'src/api/index.ts',
			'/api/hello',
			'v2'
		);
		expect(a).not.toBe(b);
	});

	test('should match platform SHA1 hash format with lowercase method', () => {
		// Platform (main branch ast.ts) uses lowercase HTTP methods: 'get', 'post', etc.
		// The hash is SHA1 of each component updated separately:
		//   projectId, deploymentId, type, method, filename, path, version
		// This test uses real values from a production error to verify exact compatibility.
		const id = generateRouteId(
			'proj_5ed7da797bef771d65e1bd6946a052b1',
			'deploy_c447ff41f3681baa53d7e306bfa3b595',
			'api',
			'get',
			'src/api/index.ts',
			'/api/agent-calls',
			'93e74f74c76216e5'
		);
		expect(id).toBe('route_243d777fa53d9769d5f146862131650cb0b774f3');
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
