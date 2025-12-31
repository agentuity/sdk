import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { createAuth } from '../../src/agentuity/config';

describe('Agentuity Auth Config', () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		delete process.env.BETTER_AUTH_URL;
		delete process.env.AGENTUITY_DEPLOYMENT_URL;
		delete process.env.AGENTUITY_AUTH_TRUSTED_ORIGINS;
	});

	afterEach(() => {
		process.env = { ...originalEnv };
	});

	describe('resolveBaseURL', () => {
		it('returns explicit baseURL when provided', () => {
			process.env.BETTER_AUTH_URL = 'https://env-url.com';
			process.env.AGENTUITY_DEPLOYMENT_URL = 'https://agentuity-url.com';

			const db = new Database(':memory:');
			const auth = createAuth({
				database: db,
				baseURL: 'https://explicit-url.com',
				basePath: '/api/auth',
				secret: 'test-secret-minimum-32-characters-long',
			});

			expect(auth.options.baseURL).toBe('https://explicit-url.com');
		});

		it('prefers AGENTUITY_DEPLOYMENT_URL over BETTER_AUTH_URL', () => {
			process.env.BETTER_AUTH_URL = 'https://better-auth-url.com';
			process.env.AGENTUITY_DEPLOYMENT_URL = 'https://agentuity-url.com';

			const db = new Database(':memory:');
			const auth = createAuth({
				database: db,
				basePath: '/api/auth',
				secret: 'test-secret-minimum-32-characters-long',
			});

			// AGENTUITY_DEPLOYMENT_URL takes priority over BETTER_AUTH_URL
			expect(auth.options.baseURL).toBe('https://agentuity-url.com');
		});

		it('falls back to BETTER_AUTH_URL when no AGENTUITY_DEPLOYMENT_URL', () => {
			process.env.BETTER_AUTH_URL = 'https://better-auth-url.com';
			// Note: AGENTUITY_DEPLOYMENT_URL not set

			const db = new Database(':memory:');
			const auth = createAuth({
				database: db,
				basePath: '/api/auth',
				secret: 'test-secret-minimum-32-characters-long',
			});

			expect(auth.options.baseURL).toBe('https://better-auth-url.com');
		});

		it('falls back to AGENTUITY_DEPLOYMENT_URL when no BETTER_AUTH_URL', () => {
			process.env.AGENTUITY_DEPLOYMENT_URL = 'https://p1234.agentuity.run';

			const db = new Database(':memory:');
			const auth = createAuth({
				database: db,
				basePath: '/api/auth',
				secret: 'test-secret-minimum-32-characters-long',
			});

			expect(auth.options.baseURL).toBe('https://p1234.agentuity.run');
		});
	});

	describe('trustedOrigins', () => {
		it('uses default trustedOrigins function when not provided', () => {
			process.env.AGENTUITY_DEPLOYMENT_URL = 'https://p1234.agentuity.run';

			const db = new Database(':memory:');
			const auth = createAuth({
				database: db,
				basePath: '/api/auth',
				secret: 'test-secret-minimum-32-characters-long',
			});

			expect(typeof auth.options.trustedOrigins).toBe('function');
		});

		it('respects user-provided trustedOrigins', () => {
			const customOrigins = ['https://custom.example.com'];
			const db = new Database(':memory:');
			const auth = createAuth({
				database: db,
				baseURL: 'https://test.example.com',
				basePath: '/api/auth',
				secret: 'test-secret-minimum-32-characters-long',
				trustedOrigins: customOrigins,
			});

			expect(auth.options.trustedOrigins).toEqual(customOrigins);
		});

		it('default trustedOrigins includes baseURL origin', async () => {
			const db = new Database(':memory:');
			const auth = createAuth({
				database: db,
				baseURL: 'https://myapp.example.com',
				basePath: '/api/auth',
				secret: 'test-secret-minimum-32-characters-long',
			});

			const trustedOrigins = auth.options.trustedOrigins as (
				request?: Request
			) => Promise<string[]>;
			const origins = await trustedOrigins();

			expect(origins).toContain('https://myapp.example.com');
		});

		it('default trustedOrigins includes AGENTUITY_DEPLOYMENT_URL origin', async () => {
			process.env.AGENTUITY_DEPLOYMENT_URL = 'https://p5678.agentuity.run';

			const db = new Database(':memory:');
			const auth = createAuth({
				database: db,
				basePath: '/api/auth',
				secret: 'test-secret-minimum-32-characters-long',
			});

			const trustedOrigins = auth.options.trustedOrigins as (
				request?: Request
			) => Promise<string[]>;
			const origins = await trustedOrigins();

			expect(origins).toContain('https://p5678.agentuity.run');
		});

		it('default trustedOrigins includes request origin (same-origin)', async () => {
			const db = new Database(':memory:');
			const auth = createAuth({
				database: db,
				baseURL: 'https://test.example.com',
				basePath: '/api/auth',
				secret: 'test-secret-minimum-32-characters-long',
			});

			const trustedOrigins = auth.options.trustedOrigins as (
				request?: Request
			) => Promise<string[]>;
			const mockRequest = new Request('https://deployed-app.agentuity.run/api/auth/sign-up');
			const origins = await trustedOrigins(mockRequest);

			expect(origins).toContain('https://deployed-app.agentuity.run');
		});

		it('default trustedOrigins includes extra origins from AGENTUITY_AUTH_TRUSTED_ORIGINS', async () => {
			process.env.AGENTUITY_AUTH_TRUSTED_ORIGINS =
				'https://extra1.example.com,https://extra2.example.com';

			const db = new Database(':memory:');
			const auth = createAuth({
				database: db,
				baseURL: 'https://test.example.com',
				basePath: '/api/auth',
				secret: 'test-secret-minimum-32-characters-long',
			});

			const trustedOrigins = auth.options.trustedOrigins as (
				request?: Request
			) => Promise<string[]>;
			const origins = await trustedOrigins();

			expect(origins).toContain('https://extra1.example.com');
			expect(origins).toContain('https://extra2.example.com');
		});

		it('handles malformed URLs gracefully in trustedOrigins', async () => {
			// Test the trustedOrigins function directly without creating a full auth instance
			// to avoid BetterAuth's async URL validation errors
			process.env.AGENTUITY_DEPLOYMENT_URL = 'not-a-valid-url';
			process.env.AGENTUITY_AUTH_TRUSTED_ORIGINS = 'https://valid.example.com';

			// Create auth with a VALID baseURL to avoid BetterAuth URL validation errors
			// The malformed AGENTUITY_DEPLOYMENT_URL will be handled gracefully by safeOrigin()
			const db = new Database(':memory:');
			const auth = createAuth({
				database: db,
				baseURL: 'https://valid-base.example.com',
				basePath: '/api/auth',
				secret: 'test-secret-minimum-32-characters-long',
			});

			const trustedOrigins = auth.options.trustedOrigins as (
				request?: Request
			) => Promise<string[]>;
			const origins = await trustedOrigins();

			// Should contain the valid origins but gracefully skip the malformed one
			expect(Array.isArray(origins)).toBe(true);
			expect(origins).toContain('https://valid-base.example.com');
			expect(origins).toContain('https://valid.example.com');
			// The malformed URL should be silently skipped (not included)
			expect(origins).not.toContain('not-a-valid-url');
		});
	});

	describe('resolveSecret', () => {
		it('returns explicit secret when provided', () => {
			process.env.AGENTUITY_AUTH_SECRET = 'env-secret-minimum-32-characters-long';
			process.env.BETTER_AUTH_SECRET = 'better-auth-secret-minimum-32-chars';

			const db = new Database(':memory:');
			const auth = createAuth({
				database: db,
				baseURL: 'https://test.example.com',
				basePath: '/api/auth',
				secret: 'explicit-secret-minimum-32-characters',
			});

			expect(auth.options.secret).toBe('explicit-secret-minimum-32-characters');
		});

		it('prefers AGENTUITY_AUTH_SECRET over BETTER_AUTH_SECRET', () => {
			process.env.AGENTUITY_AUTH_SECRET = 'agentuity-secret-minimum-32-chars-';
			process.env.BETTER_AUTH_SECRET = 'better-auth-secret-minimum-32-chars';

			const db = new Database(':memory:');
			const auth = createAuth({
				database: db,
				baseURL: 'https://test.example.com',
				basePath: '/api/auth',
			});

			expect(auth.options.secret).toBe('agentuity-secret-minimum-32-chars-');
		});

		it('falls back to BETTER_AUTH_SECRET when no AGENTUITY_AUTH_SECRET', () => {
			delete process.env.AGENTUITY_AUTH_SECRET;
			process.env.BETTER_AUTH_SECRET = 'better-auth-secret-minimum-32-chars';

			const db = new Database(':memory:');
			const auth = createAuth({
				database: db,
				baseURL: 'https://test.example.com',
				basePath: '/api/auth',
			});

			expect(auth.options.secret).toBe('better-auth-secret-minimum-32-chars');
		});
	});

	describe('default options', () => {
		it('defaults basePath to /api/auth', () => {
			const db = new Database(':memory:');
			const auth = createAuth({
				database: db,
				baseURL: 'https://test.example.com',
				secret: 'test-secret-minimum-32-characters-long',
			});

			expect(auth.options.basePath).toBe('/api/auth');
		});

		it('defaults emailAndPassword to enabled', () => {
			const db = new Database(':memory:');
			const auth = createAuth({
				database: db,
				baseURL: 'https://test.example.com',
				secret: 'test-secret-minimum-32-characters-long',
			});

			expect(auth.options.emailAndPassword?.enabled).toBe(true);
		});

		it('defaults experimental.joins to true', () => {
			const db = new Database(':memory:');
			const auth = createAuth({
				database: db,
				baseURL: 'https://test.example.com',
				secret: 'test-secret-minimum-32-characters-long',
			});

			// BetterAuth stores this in the options
			expect((auth.options as { experimental?: { joins?: boolean } }).experimental?.joins).toBe(
				true
			);
		});
	});

	describe('default plugins', () => {
		it('includes organization, jwt, bearer, and apiKey plugins by default', () => {
			const db = new Database(':memory:');
			const auth = createAuth({
				database: db,
				baseURL: 'https://test.example.com',
				secret: 'test-secret-minimum-32-characters-long',
			});

			// Check that plugins array has items (exact count depends on BetterAuth internals)
			expect(auth.options.plugins).toBeDefined();
			expect(auth.options.plugins!.length).toBeGreaterThanOrEqual(4);
		});

		it('skips default plugins when skipDefaultPlugins is true', () => {
			const db = new Database(':memory:');
			const auth = createAuth({
				database: db,
				baseURL: 'https://test.example.com',
				secret: 'test-secret-minimum-32-characters-long',
				skipDefaultPlugins: true,
			});

			// With skipDefaultPlugins, should have empty or no plugins
			expect(auth.options.plugins?.length ?? 0).toBe(0);
		});

		it('allows disabling apiKey plugin', () => {
			const db = new Database(':memory:');
			const auth = createAuth({
				database: db,
				baseURL: 'https://test.example.com',
				secret: 'test-secret-minimum-32-characters-long',
				apiKey: false,
			});

			// Should have 3 plugins (org, jwt, bearer) instead of 4
			expect(auth.options.plugins).toBeDefined();
			expect(auth.options.plugins!.length).toBe(3);
		});
	});
});
