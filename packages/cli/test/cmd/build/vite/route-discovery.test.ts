import { describe, test, expect } from 'bun:test';
import {
	detectRouteConflicts,
	extractPathParams,
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
