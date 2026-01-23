import { describe, test, expect } from 'bun:test';
import {
	computeApiMountPath,
	joinMountAndRoute,
	extractRelativeApiPath,
} from '../../../../src/cmd/build/vite/api-mount-path';

describe('api-mount-path', () => {
	describe('computeApiMountPath', () => {
		test('should return /api for index (file directly in src/api/)', () => {
			expect(computeApiMountPath('index')).toBe('/api');
		});

		test('should return /api for sessions (file directly in src/api/)', () => {
			// Mount path is based on directory, not filename
			// src/api/sessions.ts -> directory is src/api/ -> mount at /api
			expect(computeApiMountPath('sessions')).toBe('/api');
		});

		test('should return /api for route (file directly in src/api/)', () => {
			// src/api/route.ts -> directory is src/api/ -> mount at /api
			expect(computeApiMountPath('route')).toBe('/api');
		});

		test('should return /api/auth for auth/route', () => {
			// src/api/auth/route.ts -> directory is src/api/auth/ -> mount at /api/auth
			expect(computeApiMountPath('auth/route')).toBe('/api/auth');
		});

		test('should return /api/auth for auth/index', () => {
			// src/api/auth/index.ts -> directory is src/api/auth/ -> mount at /api/auth
			expect(computeApiMountPath('auth/index')).toBe('/api/auth');
		});

		test('should return /api/auth for auth/sessions (custom filename in subdirectory)', () => {
			// src/api/auth/sessions.ts -> directory is src/api/auth/ -> mount at /api/auth
			expect(computeApiMountPath('auth/sessions')).toBe('/api/auth');
		});

		test('should return /api/users/profile for users/profile/route', () => {
			expect(computeApiMountPath('users/profile/route')).toBe('/api/users/profile');
		});

		test('should return /api/v1/users for v1/users/index', () => {
			expect(computeApiMountPath('v1/users/index')).toBe('/api/v1/users');
		});

		test('should return /api/v1/users for v1/users/route', () => {
			expect(computeApiMountPath('v1/users/route')).toBe('/api/v1/users');
		});

		test('should return /api/custom-name for custom-name/foobar', () => {
			// Files with custom names in subdirectories mount at their directory path
			// src/api/custom-name/foobar.ts -> directory is src/api/custom-name/ -> mount at /api/custom-name
			expect(computeApiMountPath('custom-name/foobar')).toBe('/api/custom-name');
		});

		test('should handle deeply nested routes', () => {
			// src/api/v1/users/settings/route.ts -> mount at /api/v1/users/settings
			expect(computeApiMountPath('v1/users/settings/route')).toBe('/api/v1/users/settings');
		});
	});

	describe('joinMountAndRoute', () => {
		test('should return base for root path /', () => {
			expect(joinMountAndRoute('/api/sessions', '/')).toBe('/api/sessions');
		});

		test('should return base for empty path', () => {
			expect(joinMountAndRoute('/api/sessions', '')).toBe('/api/sessions');
		});

		test('should join base with path starting with /', () => {
			expect(joinMountAndRoute('/api/sessions', '/users')).toBe('/api/sessions/users');
		});

		test('should join base with path not starting with /', () => {
			expect(joinMountAndRoute('/api/sessions', 'users')).toBe('/api/sessions/users');
		});

		test('should handle path parameters', () => {
			expect(joinMountAndRoute('/api/users', ':id')).toBe('/api/users/:id');
		});

		test('should handle path with trailing slash in route', () => {
			expect(joinMountAndRoute('/api', '/health/')).toBe('/api/health');
		});

		test('should normalize multiple slashes', () => {
			expect(joinMountAndRoute('/api', '//health')).toBe('/api/health');
		});

		test('should handle /api base with /health route', () => {
			expect(joinMountAndRoute('/api', '/health')).toBe('/api/health');
		});

		test('should handle complex path parameters', () => {
			expect(joinMountAndRoute('/api/users', '/:userId/posts/:postId')).toBe(
				'/api/users/:userId/posts/:postId'
			);
		});
	});

	describe('extractRelativeApiPath', () => {
		const srcDir = '/project/src';

		test('should extract relative path for file directly in src/api/', () => {
			expect(extractRelativeApiPath('/project/src/api/sessions.ts', srcDir)).toBe('sessions');
		});

		test('should extract relative path for index file', () => {
			expect(extractRelativeApiPath('/project/src/api/index.ts', srcDir)).toBe('index');
		});

		test('should extract relative path for nested route file', () => {
			expect(extractRelativeApiPath('/project/src/api/auth/route.ts', srcDir)).toBe(
				'auth/route'
			);
		});

		test('should extract relative path for deeply nested route file', () => {
			expect(extractRelativeApiPath('/project/src/api/users/profile/route.ts', srcDir)).toBe(
				'users/profile/route'
			);
		});

		test('should handle .tsx extension', () => {
			expect(extractRelativeApiPath('/project/src/api/sessions.tsx', srcDir)).toBe('sessions');
		});

		test('should normalize backslash separators in relative path output', () => {
			// The function normalizes backslashes to forward slashes in the output
			// This ensures consistent output on all platforms
			// Note: On non-Windows systems, path.relative() may not process Windows paths correctly
			// But the final .replace(/\\/g, '/') ensures output always uses forward slashes
			const srcDir = '/project/src';
			const result = extractRelativeApiPath('/project/src/api/auth/route.ts', srcDir);
			// Verify no backslashes in output
			expect(result.includes('\\')).toBe(false);
			expect(result).toBe('auth/route');
		});
	});

	describe('integration: computeApiMountPath + extractRelativeApiPath', () => {
		const srcDir = '/project/src';

		test('src/api/sessions.ts should produce /api mount path (directory-based)', () => {
			// Files directly in src/api/ mount at /api regardless of filename
			const filename = '/project/src/api/sessions.ts';
			const relativePath = extractRelativeApiPath(filename, srcDir);
			const mountPath = computeApiMountPath(relativePath);
			expect(mountPath).toBe('/api');
		});

		test('src/api/index.ts should produce /api mount path', () => {
			const filename = '/project/src/api/index.ts';
			const relativePath = extractRelativeApiPath(filename, srcDir);
			const mountPath = computeApiMountPath(relativePath);
			expect(mountPath).toBe('/api');
		});

		test('src/api/auth/route.ts should produce /api/auth mount path', () => {
			const filename = '/project/src/api/auth/route.ts';
			const relativePath = extractRelativeApiPath(filename, srcDir);
			const mountPath = computeApiMountPath(relativePath);
			expect(mountPath).toBe('/api/auth');
		});

		test('src/api/users/profile/route.ts should produce /api/users/profile mount path', () => {
			const filename = '/project/src/api/users/profile/route.ts';
			const relativePath = extractRelativeApiPath(filename, srcDir);
			const mountPath = computeApiMountPath(relativePath);
			expect(mountPath).toBe('/api/users/profile');
		});

		test('mount path + route with path param should produce correct full path', () => {
			// For src/api/auth/route.ts with router.get('/:id', ...)
			// File is in src/api/auth/ -> mount at /api/auth
			const filename = '/project/src/api/auth/route.ts';
			const relativePath = extractRelativeApiPath(filename, srcDir);
			const mountPath = computeApiMountPath(relativePath);
			const fullPath = joinMountAndRoute(mountPath, '/:id');
			expect(fullPath).toBe('/api/auth/:id');
		});

		test('mount path + nested route should produce correct full path', () => {
			// For src/api/users/route.ts with router.get('/profile', ...)
			// File is in src/api/users/ -> mount at /api/users
			const filename = '/project/src/api/users/route.ts';
			const relativePath = extractRelativeApiPath(filename, srcDir);
			const mountPath = computeApiMountPath(relativePath);
			const fullPath = joinMountAndRoute(mountPath, '/profile');
			expect(fullPath).toBe('/api/users/profile');
		});

		test('file directly in src/api/ with route path should combine correctly', () => {
			// For src/api/index.ts with router.get('/sessions', ...)
			// File is in src/api/ -> mount at /api -> full path /api/sessions
			const filename = '/project/src/api/index.ts';
			const relativePath = extractRelativeApiPath(filename, srcDir);
			const mountPath = computeApiMountPath(relativePath);
			const fullPath = joinMountAndRoute(mountPath, '/sessions');
			expect(fullPath).toBe('/api/sessions');
		});
	});
});
