import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { createAgentuityAuth } from '../../src/agentuity/config';

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
			const auth = createAgentuityAuth({
				database: db,
				baseURL: 'https://explicit-url.com',
				basePath: '/api/auth',
				secret: 'test-secret-minimum-32-characters-long',
			});

			expect(auth.options.baseURL).toBe('https://explicit-url.com');
		});

		it('falls back to BETTER_AUTH_URL when no explicit baseURL', () => {
			process.env.BETTER_AUTH_URL = 'https://better-auth-url.com';
			process.env.AGENTUITY_DEPLOYMENT_URL = 'https://agentuity-url.com';

			const db = new Database(':memory:');
			const auth = createAgentuityAuth({
				database: db,
				basePath: '/api/auth',
				secret: 'test-secret-minimum-32-characters-long',
			});

			expect(auth.options.baseURL).toBe('https://better-auth-url.com');
		});

		it('falls back to AGENTUITY_DEPLOYMENT_URL when no BETTER_AUTH_URL', () => {
			process.env.AGENTUITY_DEPLOYMENT_URL = 'https://p1234.agentuity.run';

			const db = new Database(':memory:');
			const auth = createAgentuityAuth({
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
			const auth = createAgentuityAuth({
				database: db,
				basePath: '/api/auth',
				secret: 'test-secret-minimum-32-characters-long',
			});

			expect(typeof auth.options.trustedOrigins).toBe('function');
		});

		it('respects user-provided trustedOrigins', () => {
			const customOrigins = ['https://custom.example.com'];
			const db = new Database(':memory:');
			const auth = createAgentuityAuth({
				database: db,
				basePath: '/api/auth',
				secret: 'test-secret-minimum-32-characters-long',
				trustedOrigins: customOrigins,
			});

			expect(auth.options.trustedOrigins).toEqual(customOrigins);
		});

		it('default trustedOrigins includes baseURL origin', async () => {
			const db = new Database(':memory:');
			const auth = createAgentuityAuth({
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
			const auth = createAgentuityAuth({
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
			const auth = createAgentuityAuth({
				database: db,
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
			const auth = createAgentuityAuth({
				database: db,
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
			const auth = createAgentuityAuth({
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
});
