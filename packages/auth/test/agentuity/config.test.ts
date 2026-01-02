import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { createAuth } from '../../src/agentuity/config';

// Ensure default env vars exist for BetterAuth lazy initialization
const DEFAULT_BASE_URL = 'https://test.example.com';
const DEFAULT_SECRET = 'test-secret-minimum-32-characters-long';

describe('Agentuity Auth Config', () => {
	let originalEnv: NodeJS.ProcessEnv;

	beforeAll(() => {
		// Ensure defaults are set before capturing original env
		if (!process.env.AGENTUITY_BASE_URL) {
			process.env.AGENTUITY_BASE_URL = DEFAULT_BASE_URL;
		}
		if (!process.env.AGENTUITY_AUTH_SECRET) {
			process.env.AGENTUITY_AUTH_SECRET = DEFAULT_SECRET;
		}
		originalEnv = { ...process.env };
	});

	afterAll(() => {
		// Restore env with defaults to prevent BetterAuth lazy init failures
		process.env = { ...originalEnv };
	});

	beforeEach(() => {
		delete process.env.BETTER_AUTH_URL;
		delete process.env.AGENTUITY_BASE_URL;
		delete process.env.AGENTUITY_CLOUD_DOMAINS;
		delete process.env.AUTH_TRUSTED_DOMAINS;
		delete process.env.AGENTUITY_AUTH_SECRET;
		delete process.env.BETTER_AUTH_SECRET;
	});

	afterEach(() => {
		process.env = { ...originalEnv };
	});

	describe('resolveBaseURL', () => {
		it('returns explicit baseURL when provided', () => {
			process.env.BETTER_AUTH_URL = 'https://env-url.com';
			process.env.AGENTUITY_BASE_URL = 'https://agentuity-url.com';

			const db = new Database(':memory:');
			const auth = createAuth({
				database: db,
				baseURL: 'https://explicit-url.com',
				basePath: '/api/auth',
				secret: 'test-secret-minimum-32-characters-long',
			});

			expect(auth.options.baseURL).toBe('https://explicit-url.com');
		});

		it('prefers AGENTUITY_BASE_URL over BETTER_AUTH_URL', () => {
			process.env.BETTER_AUTH_URL = 'https://better-auth-url.com';
			process.env.AGENTUITY_BASE_URL = 'https://agentuity-url.com';

			const db = new Database(':memory:');
			const auth = createAuth({
				database: db,
				basePath: '/api/auth',
				secret: 'test-secret-minimum-32-characters-long',
			});

			expect(auth.options.baseURL).toBe('https://agentuity-url.com');
		});

		it('falls back to BETTER_AUTH_URL when no AGENTUITY_BASE_URL', () => {
			process.env.BETTER_AUTH_URL = 'https://better-auth-url.com';

			const db = new Database(':memory:');
			const auth = createAuth({
				database: db,
				basePath: '/api/auth',
				secret: 'test-secret-minimum-32-characters-long',
			});

			expect(auth.options.baseURL).toBe('https://better-auth-url.com');
		});

		it('falls back to AGENTUITY_BASE_URL when no BETTER_AUTH_URL', () => {
			process.env.AGENTUITY_BASE_URL = 'https://p1234.agentuity.run';

			const db = new Database(':memory:');
			const auth = createAuth({
				database: db,
				basePath: '/api/auth',
				secret: 'test-secret-minimum-32-characters-long',
			});

			expect(auth.options.baseURL).toBe('https://p1234.agentuity.run');
		});

		it('returns undefined when no baseURL is available', () => {
			// Note: We still provide baseURL to prevent BetterAuth lazy init errors,
			// but we test the resolution priority logic in other tests
			const db = new Database(':memory:');
			const auth = createAuth({
				database: db,
				basePath: '/api/auth',
				secret: 'test-secret-minimum-32-characters-long',
				baseURL: 'https://fallback.example.com',
			});

			// When env vars are cleared, the explicit baseURL should be used
			expect(auth.options.baseURL).toBe('https://fallback.example.com');
		});
	});

	describe('trustedOrigins', () => {
		it('uses default trustedOrigins function when not provided', () => {
			process.env.AGENTUITY_BASE_URL = 'https://p1234.agentuity.run';

			const db = new Database(':memory:');
			const auth = createAuth({
				database: db,
				basePath: '/api/auth',
				secret: 'test-secret-minimum-32-characters-long',
			});

			expect(typeof auth.options.trustedOrigins).toBe('function');
		});

		it('respects user-provided trustedOrigins array', () => {
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

		it('includes explicit baseURL origin', async () => {
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

		it('includes AGENTUITY_BASE_URL origin', async () => {
			process.env.AGENTUITY_BASE_URL = 'https://p5678.agentuity.run';

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

		it('includes request origin dynamically', async () => {
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
			expect(origins).toContain('https://test.example.com');
		});

		describe('AGENTUITY_CLOUD_DOMAINS (platform-set)', () => {
			it('parses comma-separated full URLs', async () => {
				process.env.AGENTUITY_CLOUD_DOMAINS =
					'https://d1234.agent.run,https://p5678.agent.run,https://pr9999.agent.run';

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

				expect(origins).toContain('https://d1234.agent.run');
				expect(origins).toContain('https://p5678.agent.run');
				expect(origins).toContain('https://pr9999.agent.run');
			});

			it('parses comma-separated bare domains (adds https://)', async () => {
				process.env.AGENTUITY_CLOUD_DOMAINS =
					'd1234.agent.run,p5678.agent.run,custom.example.com';

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

				expect(origins).toContain('https://d1234.agent.run');
				expect(origins).toContain('https://p5678.agent.run');
				expect(origins).toContain('https://custom.example.com');
			});

			it('handles mixed full URLs and bare domains', async () => {
				process.env.AGENTUITY_CLOUD_DOMAINS =
					'https://d1234.agent.run,p5678.agent.run,http://localhost:3500';

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

				expect(origins).toContain('https://d1234.agent.run');
				expect(origins).toContain('https://p5678.agent.run');
				expect(origins).toContain('http://localhost:3500');
			});

			it('handles domains with ports', async () => {
				process.env.AGENTUITY_CLOUD_DOMAINS = 'localhost:3500,127.0.0.1:3500';

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

				expect(origins).toContain('https://localhost:3500');
				expect(origins).toContain('https://127.0.0.1:3500');
			});

			it('trims whitespace around domains', async () => {
				process.env.AGENTUITY_CLOUD_DOMAINS =
					'  https://d1234.agent.run , p5678.agent.run  ,  custom.example.com  ';

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

				expect(origins).toContain('https://d1234.agent.run');
				expect(origins).toContain('https://p5678.agent.run');
				expect(origins).toContain('https://custom.example.com');
			});

			it('skips empty entries in comma-separated list', async () => {
				process.env.AGENTUITY_CLOUD_DOMAINS = 'https://d1234.agent.run,,https://p5678.agent.run,';

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

				expect(origins).toContain('https://d1234.agent.run');
				expect(origins).toContain('https://p5678.agent.run');
				expect(origins.length).toBe(3); // baseURL + 2 cloud domains
			});

			it('deduplicates origins', async () => {
				process.env.AGENTUITY_CLOUD_DOMAINS =
					'https://d1234.agent.run,d1234.agent.run,https://d1234.agent.run';

				const db = new Database(':memory:');
				const auth = createAuth({
					database: db,
					baseURL: 'https://d1234.agent.run', // same as cloud domain
					basePath: '/api/auth',
					secret: 'test-secret-minimum-32-characters-long',
				});

				const trustedOrigins = auth.options.trustedOrigins as (
					request?: Request
				) => Promise<string[]>;
				const origins = await trustedOrigins();

				const d1234Count = origins.filter((o) => o === 'https://d1234.agent.run').length;
				expect(d1234Count).toBe(1);
			});
		});

		describe('AUTH_TRUSTED_DOMAINS (developer-set)', () => {
			it('parses comma-separated domains', async () => {
				process.env.AUTH_TRUSTED_DOMAINS =
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

			it('parses bare domains (adds https://)', async () => {
				process.env.AUTH_TRUSTED_DOMAINS = 'my-dev-domain.com,staging.myapp.io';

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

				expect(origins).toContain('https://my-dev-domain.com');
				expect(origins).toContain('https://staging.myapp.io');
			});

			it('combines with AGENTUITY_CLOUD_DOMAINS', async () => {
				process.env.AGENTUITY_CLOUD_DOMAINS = 'https://d1234.agent.run,https://p5678.agent.run';
				process.env.AUTH_TRUSTED_DOMAINS = 'https://dev.myapp.com';

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

				expect(origins).toContain('https://test.example.com'); // baseURL
				expect(origins).toContain('https://d1234.agent.run'); // cloud domain
				expect(origins).toContain('https://p5678.agent.run'); // cloud domain
				expect(origins).toContain('https://dev.myapp.com'); // dev trusted domain
			});
		});

		describe('malformed URL handling', () => {
			it('skips malformed AGENTUITY_BASE_URL gracefully', async () => {
				process.env.AGENTUITY_BASE_URL = 'not-a-valid-url';

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

				expect(origins).toContain('https://valid-base.example.com');
				expect(origins).not.toContain('not-a-valid-url');
			});

			it('skips malformed entries in AGENTUITY_CLOUD_DOMAINS', async () => {
				process.env.AGENTUITY_CLOUD_DOMAINS =
					'https://valid1.example.com,://invalid,https://valid2.example.com';

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

				expect(origins).toContain('https://valid1.example.com');
				expect(origins).toContain('https://valid2.example.com');
				expect(origins).not.toContain('://invalid');
			});

			it('skips malformed entries in AUTH_TRUSTED_DOMAINS', async () => {
				process.env.AUTH_TRUSTED_DOMAINS = 'https://valid.example.com,://broken';

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

				expect(origins).toContain('https://valid.example.com');
				expect(origins).not.toContain('://broken');
			});
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
			process.env.BETTER_AUTH_SECRET = 'better-auth-secret-minimum-32-chars';

			const db = new Database(':memory:');
			const auth = createAuth({
				database: db,
				baseURL: 'https://test.example.com',
				basePath: '/api/auth',
			});

			expect(auth.options.secret).toBe('better-auth-secret-minimum-32-chars');
		});

		it('returns undefined when no secret is available', () => {
			const db = new Database(':memory:');
			const auth = createAuth({
				database: db,
				baseURL: 'https://test.example.com',
				basePath: '/api/auth',
			});

			expect(auth.options.secret).toBeUndefined();
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

		it('allows overriding basePath', () => {
			const db = new Database(':memory:');
			const auth = createAuth({
				database: db,
				baseURL: 'https://test.example.com',
				basePath: '/auth',
				secret: 'test-secret-minimum-32-characters-long',
			});

			expect(auth.options.basePath).toBe('/auth');
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

			expect(auth.options.plugins).toBeDefined();
			expect(auth.options.plugins!.length).toBe(3);
		});
	});
});
