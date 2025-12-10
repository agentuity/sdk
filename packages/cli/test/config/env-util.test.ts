import { describe, test, expect } from 'bun:test';
import { looksLikeSecret } from '../../src/env-util';

describe('looksLikeSecret', () => {
	describe('key name patterns', () => {
		test('detects _SECRET suffix', () => {
			expect(looksLikeSecret('API_SECRET', 'value')).toBe(true);
			expect(looksLikeSecret('DB_SECRET', 'value')).toBe(true);
		});

		test('detects _KEY suffix', () => {
			expect(looksLikeSecret('API_KEY', 'value')).toBe(true);
			expect(looksLikeSecret('STRIPE_KEY', 'value')).toBe(true);
		});

		test('detects _TOKEN suffix', () => {
			expect(looksLikeSecret('AUTH_TOKEN', 'value')).toBe(true);
			expect(looksLikeSecret('GITHUB_TOKEN', 'value')).toBe(true);
		});

		test('detects _PASSWORD suffix', () => {
			expect(looksLikeSecret('DB_PASSWORD', 'value')).toBe(true);
			expect(looksLikeSecret('ADMIN_PASSWORD', 'value')).toBe(true);
		});

		test('detects _PRIVATE suffix', () => {
			expect(looksLikeSecret('SSH_PRIVATE', 'value')).toBe(true);
		});

		test('detects _CERT and _CERTIFICATE suffixes', () => {
			expect(looksLikeSecret('SSL_CERT', 'value')).toBe(true);
			expect(looksLikeSecret('SSL_CERTIFICATE', 'value')).toBe(true);
		});

		test('detects SECRET_ prefix', () => {
			expect(looksLikeSecret('SECRET_VALUE', 'value')).toBe(true);
		});

		test('detects APIKEY and API_KEY patterns', () => {
			expect(looksLikeSecret('APIKEY', 'value')).toBe(true);
			expect(looksLikeSecret('API_KEY', 'value')).toBe(true);
		});

		test('detects JWT prefix', () => {
			expect(looksLikeSecret('JWT_SECRET', 'value')).toBe(true);
			expect(looksLikeSecret('JWT', 'value')).toBe(true);
		});

		test('detects PASSWORD in key name', () => {
			expect(looksLikeSecret('DATABASE_PASSWORD', 'value')).toBe(true);
			expect(looksLikeSecret('PASSWORD', 'value')).toBe(true);
		});

		test('detects CREDENTIAL in key name', () => {
			expect(looksLikeSecret('AWS_CREDENTIALS', 'value')).toBe(true);
		});

		test('detects AUTH.*KEY pattern', () => {
			expect(looksLikeSecret('AUTH_API_KEY', 'value')).toBe(true);
			expect(looksLikeSecret('AUTHKEY', 'value')).toBe(true);
		});

		test('is case insensitive for key patterns', () => {
			expect(looksLikeSecret('api_secret', 'value')).toBe(true);
			expect(looksLikeSecret('Api_Key', 'value')).toBe(true);
			expect(looksLikeSecret('AUTH_token', 'value')).toBe(true);
		});
	});

	describe('value patterns', () => {
		test('detects JWT tokens', () => {
			const jwt =
				'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
			expect(looksLikeSecret('TOKEN', jwt)).toBe(true);
			expect(looksLikeSecret('SOME_VAR', jwt)).toBe(true);
		});

		test('detects Bearer tokens', () => {
			expect(looksLikeSecret('AUTH', 'Bearer abc123def456ghi789jkl012mno345pqr')).toBe(true);
		});

		test('detects AWS access keys', () => {
			expect(looksLikeSecret('AWS', 'AKIAIOSFODNN7EXAMPLE')).toBe(true);
			expect(looksLikeSecret('AWS', 'ASIAIOSFODNN7EXAMPLE')).toBe(true);
		});

		test('detects GitHub tokens', () => {
			expect(looksLikeSecret('GH', 'ghp_1234567890abcdefghijklmnopqrstuvwxyz')).toBe(true);
			expect(looksLikeSecret('GH', 'ghs_1234567890abcdefghijklmnopqrstuvwxyz')).toBe(true);
		});

		test('detects long alphanumeric strings (API keys)', () => {
			// 32+ characters, mixed alphanumeric
			expect(
				looksLikeSecret('KEY', 'sk_test_51A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8S9T0U1V2W3X4Y5Z6')
			).toBe(true);
			expect(looksLikeSecret('KEY', 'abc123def456ghi789jkl012mno345pqr678stu901vwx234yz')).toBe(
				true
			);
		});

		test('does not flag numeric-only long strings', () => {
			expect(looksLikeSecret('ID', '12345678901234567890123456789012')).toBe(false);
		});

		test('detects PEM certificates', () => {
			expect(looksLikeSecret('CERT', '-----BEGIN CERTIFICATE-----\nMIIC...')).toBe(true);
			expect(looksLikeSecret('CERT', '-----BEGIN PRIVATE KEY-----\nMIIC...')).toBe(true);
			expect(looksLikeSecret('CERT', '-----BEGIN RSA PRIVATE KEY-----\nMIIC...')).toBe(true);
		});

		test('does not flag short values', () => {
			expect(looksLikeSecret('VAR', 'short')).toBe(false);
			expect(looksLikeSecret('VAR', '1234567')).toBe(false);
		});

		test('does not flag empty values', () => {
			expect(looksLikeSecret('VAR', '')).toBe(false);
		});
	});

	describe('non-secret patterns', () => {
		test('regular environment variables are not flagged', () => {
			expect(looksLikeSecret('NODE_ENV', 'production')).toBe(false);
			expect(looksLikeSecret('PORT', '3500')).toBe(false);
			expect(looksLikeSecret('HOST', 'localhost')).toBe(false);
			expect(looksLikeSecret('DATABASE_URL', 'postgres://localhost:5432/mydb')).toBe(false);
		});

		test('configuration values are not flagged', () => {
			expect(looksLikeSecret('LOG_LEVEL', 'debug')).toBe(false);
			expect(looksLikeSecret('CACHE_TTL', '3600')).toBe(false);
			expect(looksLikeSecret('MAX_CONNECTIONS', '100')).toBe(false);
		});

		test('URLs without secrets are not flagged', () => {
			expect(looksLikeSecret('API_URL', 'https://api.example.com')).toBe(false);
			expect(looksLikeSecret('WEBHOOK_URL', 'https://example.com/webhook')).toBe(false);
		});

		test('paths are not flagged', () => {
			expect(looksLikeSecret('DATA_PATH', '/var/data/app')).toBe(false);
			expect(looksLikeSecret('CONFIG_FILE', '/etc/app/config.json')).toBe(false);
		});
	});

	describe('edge cases', () => {
		test('handles mixed key and value patterns', () => {
			// Key pattern triggers detection
			expect(looksLikeSecret('API_KEY', 'simple')).toBe(true);

			// Value pattern triggers detection even without key pattern
			const jwt =
				'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
			expect(looksLikeSecret('CONFIG', jwt)).toBe(true);
		});

		test('real-world API key formats', () => {
			// Stripe (contains underscore, 32+ chars)
			expect(looksLikeSecret('STRIPE', 'sk_test_51HqL7xAbCdEfGhIjK12345678901234567890')).toBe(
				true
			);

			// Long API key format (32+ alphanumeric)
			expect(looksLikeSecret('OPENAI', 'sk-proj-1234567890abcdefghijklmnopqrstuvwxyz')).toBe(
				true
			);

			// Contains dots (periods not in our pattern, but key name helps)
			expect(
				looksLikeSecret(
					'SENDGRID_API_KEY',
					'SG.1234567890abcdefghijklmnopqrstuvwxyz.1234567890abcdefghijklmnopqrstuvwxyz'
				)
			).toBe(true);
		});

		test('UUIDs are correctly identified as non-secrets', () => {
			// Standard UUID format should not be flagged
			expect(looksLikeSecret('REQUEST_ID', '550e8400-e29b-41d4-a716-446655440000')).toBe(false);
			expect(looksLikeSecret('USER_ID', '123e4567-e89b-12d3-a456-426614174000')).toBe(false);
		});

		test('hex hashes are flagged (better safe than sorry)', () => {
			// 32+ character hex strings could be secrets or hashes - we flag them
			// Users can confirm they're just hashes if needed
			expect(looksLikeSecret('BUILD_HASH', 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6')).toBe(true);

			// But with context that clearly indicates it's not a secret, the key name won't trigger
			// So short hex strings without secret-like key names won't be flagged
			expect(looksLikeSecret('COMMIT', 'abc123def')).toBe(false);
		});
	});
});
