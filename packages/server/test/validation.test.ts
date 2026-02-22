import { describe, test, expect } from 'bun:test';
import { validateDatabaseName, validateBucketName } from '../src/api/region/create.ts';

describe('validateDatabaseName', () => {
	test('should accept valid database names', () => {
		expect(validateDatabaseName('mydb')).toEqual({ valid: true });
		expect(validateDatabaseName('my_db')).toEqual({ valid: true });
		expect(validateDatabaseName('_private')).toEqual({ valid: true });
		expect(validateDatabaseName('db123')).toEqual({ valid: true });
		expect(validateDatabaseName('a')).toEqual({ valid: true });
		expect(validateDatabaseName('test_db_123')).toEqual({ valid: true });
	});

	test('should reject names starting with a number', () => {
		const result = validateDatabaseName('123db');
		expect(result.valid).toBe(false);
		expect(result.error).toContain('must start with a letter or underscore');
	});

	test('should reject uppercase letters', () => {
		const result = validateDatabaseName('MyDB');
		expect(result.valid).toBe(false);
		expect(result.error).toContain('must be lowercase');
	});

	test('should reject hyphens', () => {
		const result = validateDatabaseName('my-db');
		expect(result.valid).toBe(false);
		expect(result.error).toContain('must start with a letter or underscore');
	});

	test('should reject special characters', () => {
		const result = validateDatabaseName('my@db');
		expect(result.valid).toBe(false);
		expect(result.error).toContain('must start with a letter or underscore');
	});

	test('should reject names that are too long', () => {
		const longName = 'a'.repeat(64);
		const result = validateDatabaseName(longName);
		expect(result.valid).toBe(false);
		expect(result.error).toContain('too long');
	});

	test('should accept maximum length names', () => {
		const maxName = 'a'.repeat(63);
		expect(validateDatabaseName(maxName)).toEqual({ valid: true });
	});

	test('should reject empty names', () => {
		const result = validateDatabaseName('');
		expect(result.valid).toBe(false);
		expect(result.error).toContain('too short');
	});

	test('should reject names starting with pg_', () => {
		const result = validateDatabaseName('pg_fix_test');
		expect(result.valid).toBe(false);
		expect(result.error).toContain("'pg_'");
	});

	test('should reject any pg_ prefixed name', () => {
		const result = validateDatabaseName('pg_something');
		expect(result.valid).toBe(false);
		expect(result.error).toContain('reserved by PostgreSQL');
	});

	test('should allow names containing pg_ not at start', () => {
		expect(validateDatabaseName('my_pg_database')).toEqual({ valid: true });
	});
});

describe('validateBucketName', () => {
	test('should accept valid bucket names', () => {
		expect(validateBucketName('my-bucket')).toEqual({ valid: true });
		expect(validateBucketName('my.bucket')).toEqual({ valid: true });
		expect(validateBucketName('bucket123')).toEqual({ valid: true });
		expect(validateBucketName('abc')).toEqual({ valid: true });
	});

	test('should reject names that are too short', () => {
		const result = validateBucketName('ab');
		expect(result.valid).toBe(false);
		expect(result.error).toContain('too short');
	});

	test('should reject names that are too long', () => {
		const longName = 'a'.repeat(64);
		const result = validateBucketName(longName);
		expect(result.valid).toBe(false);
		expect(result.error).toContain('too long');
	});

	test('should reject uppercase letters', () => {
		const result = validateBucketName('MyBucket');
		expect(result.valid).toBe(false);
		expect(result.error).toContain('lowercase');
	});

	test('should reject xn-- prefix', () => {
		const result = validateBucketName('xn--bucket');
		expect(result.valid).toBe(false);
		expect(result.error).toContain('xn--');
	});

	test('should reject -s3alias suffix', () => {
		const result = validateBucketName('bucket-s3alias');
		expect(result.valid).toBe(false);
		expect(result.error).toContain('-s3alias');
	});

	test('should reject adjacent periods', () => {
		const result = validateBucketName('my..bucket');
		expect(result.valid).toBe(false);
		expect(result.error).toContain('adjacent periods');
	});

	test('should reject IP address format', () => {
		const result = validateBucketName('192.168.1.1');
		expect(result.valid).toBe(false);
		expect(result.error).toContain('IP address');
	});
});
