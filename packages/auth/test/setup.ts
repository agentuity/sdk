/**
 * Test setup for @agentuity/auth package.
 *
 * Sets default environment variables to prevent BetterAuth from failing
 * when no base URL is configured.
 */

// Set a default base URL for tests to prevent BetterAuth "Invalid base URL: null" errors
if (!process.env.AGENTUITY_BASE_URL && !process.env.BETTER_AUTH_URL) {
	process.env.AGENTUITY_BASE_URL = 'https://test.example.com';
}

// Set a default secret for tests
if (!process.env.AGENTUITY_AUTH_SECRET && !process.env.BETTER_AUTH_SECRET) {
	process.env.AGENTUITY_AUTH_SECRET = 'test-secret-minimum-32-characters-long';
}
