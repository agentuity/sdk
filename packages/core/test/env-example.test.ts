import { describe, expect, it } from 'vitest';
import { detectResourceFromKey, parseEnvExample } from '../src/env-example';

describe('detectResourceFromKey', () => {
	it('should detect database from common key names', () => {
		expect(detectResourceFromKey('DATABASE_URL')).toBe('database');
		expect(detectResourceFromKey('POSTGRES_URL')).toBe('database');
		expect(detectResourceFromKey('DB_URL')).toBe('database');
		expect(detectResourceFromKey('PG_URL')).toBe('database');
		expect(detectResourceFromKey('PGURL')).toBe('database');
	});

	it('should detect database from compound patterns', () => {
		expect(detectResourceFromKey('DATABASE_CONNECTION')).toBe('database');
		expect(detectResourceFromKey('POSTGRES_URI')).toBe('database');
		expect(detectResourceFromKey('PG_DSN')).toBe('database');
		expect(detectResourceFromKey('DATABASE_DSN')).toBe('database');
	});

	it('should be case insensitive', () => {
		expect(detectResourceFromKey('database_url')).toBe('database');
		expect(detectResourceFromKey('Database_Url')).toBe('database');
		expect(detectResourceFromKey('queue_name')).toBe('queue');
	});

	it('should detect queue from common key names', () => {
		expect(detectResourceFromKey('QUEUE_URL')).toBe('queue');
		expect(detectResourceFromKey('QUEUE_NAME')).toBe('queue');
	});

	it('should detect queue from keys containing QUEUE', () => {
		expect(detectResourceFromKey('MY_QUEUE')).toBe('queue');
		expect(detectResourceFromKey('TASK_QUEUE_URL')).toBe('queue');
	});

	it('should return undefined for non-resource keys', () => {
		expect(detectResourceFromKey('API_KEY')).toBeUndefined();
		expect(detectResourceFromKey('SECRET_TOKEN')).toBeUndefined();
		expect(detectResourceFromKey('PORT')).toBeUndefined();
		expect(detectResourceFromKey('NODE_ENV')).toBeUndefined();
		expect(detectResourceFromKey('OPENAI_API_KEY')).toBeUndefined();
	});
});

describe('parseEnvExample', () => {
	describe('basic parsing', () => {
		it('should parse simple key=value pairs', () => {
			const result = parseEnvExample('API_KEY=my-key\nSECRET=my-secret');
			expect(result).toEqual([
				{
					key: 'API_KEY',
					defaultValue: 'my-key',
					comment: undefined,
					resource: undefined,
					required: false,
				},
				{
					key: 'SECRET',
					defaultValue: 'my-secret',
					comment: undefined,
					resource: undefined,
					required: false,
				},
			]);
		});

		it('should parse keys with empty values', () => {
			const result = parseEnvExample('API_KEY=\nSECRET=');
			expect(result).toHaveLength(2);
			expect(result[0].defaultValue).toBe('');
			expect(result[1].defaultValue).toBe('');
		});

		it('should handle values containing equals signs', () => {
			const input = 'CONNECTION=postgres://user:pass@host/db?sslmode=require';
			const result = parseEnvExample(input);
			expect(result[0].defaultValue).toBe('postgres://user:pass@host/db?sslmode=require');
		});

		it('should handle whitespace around keys and values', () => {
			const input = '  API_KEY = my-key  ';
			const result = parseEnvExample(input);
			expect(result[0].key).toBe('API_KEY');
			expect(result[0].defaultValue).toBe('my-key');
		});

		it('should ignore blank lines', () => {
			const input = ['API_KEY=one', '', '   ', 'SECRET=two'].join('\n');
			const result = parseEnvExample(input);
			expect(result).toHaveLength(2);
		});

		it('should deduplicate keys, keeping the last occurrence', () => {
			const input = 'API_KEY=first\nAPI_KEY=second';
			const result = parseEnvExample(input);
			expect(result).toHaveLength(1);
			expect(result[0].defaultValue).toBe('second');
		});

		it('should strip inline comments from values', () => {
			const input = 'API_KEY=my-key  # put your key here';
			const result = parseEnvExample(input);
			expect(result[0].defaultValue).toBe('my-key');
		});
	});

	describe('comments', () => {
		it('should ignore comment-only lines', () => {
			const input = ['# This is a comment', '# Another comment', 'API_KEY=my-key'].join('\n');
			const result = parseEnvExample(input);
			expect(result).toHaveLength(1);
		});

		it('should attach preceding comment to the next variable', () => {
			const input = ['# Your API key', 'API_KEY=my-key'].join('\n');
			const result = parseEnvExample(input);
			expect(result[0]).toMatchObject({
				key: 'API_KEY',
				defaultValue: 'my-key',
				comment: 'Your API key',
			});
		});

		it('should reset comment after a blank line', () => {
			const input = ['# This comment is orphaned', '', 'API_KEY=my-key'].join('\n');
			const result = parseEnvExample(input);
			expect(result[0].comment).toBeUndefined();
		});

		it('should only attach the immediately preceding comment', () => {
			const input = ['# First comment', '# Second comment', 'API_KEY=my-key'].join('\n');
			const result = parseEnvExample(input);
			expect(result[0].comment).toBe('Second comment');
		});
	});

	describe('required annotation', () => {
		it('should mark fields with #agentuity:required as required', () => {
			const input = 'AUTH_SECRET=#agentuity:required';
			const result = parseEnvExample(input);
			expect(result[0]).toMatchObject({
				key: 'AUTH_SECRET',
				defaultValue: '',
				required: true,
				resource: undefined,
			});
		});

		it('should strip required annotation from value', () => {
			const input = 'AUTH_SECRET=default-val  #agentuity:required';
			const result = parseEnvExample(input);
			expect(result[0].defaultValue).toBe('default-val');
			expect(result[0].required).toBe(true);
		});

		it('should not mark plain env vars as required', () => {
			const input = 'API_KEY=my-key\nPORT=3000';
			const result = parseEnvExample(input);
			expect(result[0].required).toBe(false);
			expect(result[1].required).toBe(false);
		});
	});

	describe('optional fields', () => {
		it('should mark fields without annotations as optional (required=false)', () => {
			const input = 'GOOGLE_CLIENT_ID=\nGOOGLE_CLIENT_SECRET=';
			const result = parseEnvExample(input);
			expect(result[0]).toMatchObject({ key: 'GOOGLE_CLIENT_ID', required: false });
			expect(result[1]).toMatchObject({ key: 'GOOGLE_CLIENT_SECRET', required: false });
		});

		it('should mark fields with default values as optional', () => {
			const input = 'PORT=3000\nNODE_ENV=production';
			const result = parseEnvExample(input);
			expect(result[0]).toMatchObject({ key: 'PORT', required: false, defaultValue: '3000' });
			expect(result[1]).toMatchObject({
				key: 'NODE_ENV',
				required: false,
				defaultValue: 'production',
			});
		});
	});

	describe('resource detection', () => {
		it('should detect resources via #agentuity:database annotation', () => {
			const input = 'DATABASE_URL=  #agentuity:database';
			const result = parseEnvExample(input);
			expect(result[0]).toMatchObject({
				key: 'DATABASE_URL',
				defaultValue: '',
				resource: 'database',
				required: true,
			});
		});

		it('should detect resources via #agentuity:queue annotation', () => {
			const input = 'QUEUE_NAME=  #agentuity:queue';
			const result = parseEnvExample(input);
			expect(result[0]).toMatchObject({
				key: 'QUEUE_NAME',
				defaultValue: '',
				resource: 'queue',
				required: true,
			});
		});

		it('should strip the annotation from the default value', () => {
			const input = 'DATABASE_URL=postgres://localhost  #agentuity:database';
			const result = parseEnvExample(input);
			expect(result[0].defaultValue).toBe('postgres://localhost');
			expect(result[0].resource).toBe('database');
		});

		it('should fall back to key pattern matching for resources', () => {
			const input = 'DATABASE_URL=\nQUEUE_NAME=\nAPI_KEY=abc';
			const result = parseEnvExample(input);
			expect(result[0]).toMatchObject({ resource: 'database', required: true });
			expect(result[1]).toMatchObject({ resource: 'queue', required: true });
			expect(result[2]).toMatchObject({ resource: undefined, required: false });
		});

		it('should prefer annotation over key pattern matching', () => {
			const input = 'MY_QUEUE=  #agentuity:database';
			const result = parseEnvExample(input);
			expect(result[0].resource).toBe('database');
		});

		it('should mark resource fields as implicitly required', () => {
			const input = 'DATABASE_URL=#agentuity:database';
			const result = parseEnvExample(input);
			expect(result[0].required).toBe(true);
			expect(result[0].resource).toBe('database');
		});

		it('should mark pattern-detected resources as implicitly required', () => {
			const input = 'DATABASE_URL=\nQUEUE_NAME=';
			const result = parseEnvExample(input);
			expect(result[0]).toMatchObject({
				key: 'DATABASE_URL',
				required: true,
				resource: 'database',
			});
			expect(result[1]).toMatchObject({ key: 'QUEUE_NAME', required: true, resource: 'queue' });
		});

		it('should handle multiple annotations on the same line', () => {
			const input = 'DATABASE_URL=  #agentuity:database #agentuity:required';
			const result = parseEnvExample(input);
			expect(result[0]).toMatchObject({ resource: 'database', required: true });
		});
	});

	describe('unknown annotations', () => {
		it('should ignore unknown annotations', () => {
			const input = 'MY_VAR=value  #agentuity:unknown';
			const result = parseEnvExample(input);
			expect(result[0].resource).toBeUndefined();
			expect(result[0].required).toBe(false);
			expect(result[0].defaultValue).toBe('value');
		});
	});

	describe('full realistic .env.example', () => {
		it('should handle a typical template with mixed required, optional, and resources', () => {
			const input = [
				'# Database configuration',
				'DATABASE_URL=  #agentuity:database',
				'',
				'# Queue for background jobs',
				'TASK_QUEUE=  #agentuity:queue',
				'',
				'# Third-party APIs',
				'OPENAI_API_KEY=your-key-here',
				'STRIPE_SECRET_KEY=sk_test_xxx',
				'',
				'# App config',
				'PORT=3000',
				'NODE_ENV=production',
			].join('\n');

			const result = parseEnvExample(input);
			expect(result).toHaveLength(6);

			// Resources — required
			const resources = result.filter((f) => f.resource);
			expect(resources).toHaveLength(2);
			expect(resources[0]).toMatchObject({
				key: 'DATABASE_URL',
				resource: 'database',
				required: true,
			});
			expect(resources[1]).toMatchObject({ key: 'TASK_QUEUE', resource: 'queue', required: true });

			// Non-resource env vars — optional
			const regular = result.filter((f) => !f.resource);
			expect(regular).toHaveLength(4);
			for (const field of regular) {
				expect(field.required).toBe(false);
			}

			// Comments
			expect(result.find((f) => f.key === 'DATABASE_URL')?.comment).toBe('Database configuration');
			expect(result.find((f) => f.key === 'OPENAI_API_KEY')?.comment).toBe('Third-party APIs');
			expect(result.find((f) => f.key === 'PORT')?.comment).toBe('App config');
		});

		it('should handle a real-world .env.example with sections', () => {
			const input = [
				'# ============================================',
				'# Required',
				'# ============================================',
				'',
				'# PostgreSQL connection string',
				'# Set up with: agentuity cloud database create',
				'DATABASE_URL=#agentuity:database',
				'',
				'# Better Auth secret - generate with: openssl rand -base64 32',
				'AGENTUITY_AUTH_SECRET=#agentuity:required',
				'',
				'# ============================================',
				'# Optional — Google OAuth',
				'# ============================================',
				'# Without these, the app uses email/password auth',
				'',
				'GOOGLE_CLIENT_ID=',
				'GOOGLE_CLIENT_SECRET=',
				'',
				'# ============================================',
				'# Optional — GitHub Integration',
				'# ============================================',
				'# Fine-grained PAT',
				'',
				'GH_TOKEN=',
			].join('\n');

			const result = parseEnvExample(input);

			// 5 vars (commented-out vars are excluded)
			expect(result).toHaveLength(5);

			// DATABASE_URL → resource, required
			const db = result.find((f) => f.key === 'DATABASE_URL');
			expect(db).toMatchObject({ resource: 'database', required: true });

			// AGENTUITY_AUTH_SECRET → required, not a resource
			const auth = result.find((f) => f.key === 'AGENTUITY_AUTH_SECRET');
			expect(auth).toMatchObject({ required: true, resource: undefined });

			// Optional vars
			expect(result.find((f) => f.key === 'GOOGLE_CLIENT_ID')).toMatchObject({
				required: false,
			});
			expect(result.find((f) => f.key === 'GOOGLE_CLIENT_SECRET')).toMatchObject({
				required: false,
			});
			expect(result.find((f) => f.key === 'GH_TOKEN')).toMatchObject({ required: false });
		});
	});
});
