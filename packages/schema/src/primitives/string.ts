import type { Schema } from '../base';
import { createIssue, failure, success, createParseMethods, SCHEMA_KIND } from '../base';
import { optional } from '../utils/optional';
import { nullable } from '../utils/nullable';

const parseMethods = createParseMethods<string>();

/**
 * Schema for validating string values.
 *
 * @example
 * ```typescript
 * const schema = s.string();
 * const name = schema.parse('John'); // "John"
 * schema.parse(123); // throws ValidationError
 * ```
 */
export class StringSchema implements Schema<string, string> {
	readonly [SCHEMA_KIND] = 'StringSchema';
	description?: string;
	private _min?: number;
	private _max?: number;
	private _email?: boolean;
	private _url?: boolean;

	readonly '~standard' = {
		version: 1 as const,
		vendor: 'agentuity',
		validate: (value: unknown) => {
			if (typeof value !== 'string') {
				return failure([createIssue(`Expected string, got ${typeof value}`)]);
			}
			if (this._min !== undefined && value.length < this._min) {
				return failure([
					createIssue(`String must be at least ${this._min} characters, got ${value.length}`),
				]);
			}
			if (this._max !== undefined && value.length > this._max) {
				return failure([
					createIssue(`String must be at most ${this._max} characters, got ${value.length}`),
				]);
			}
			if (this._email) {
				// Basic email regex - matches most valid emails
				const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
				if (!emailRegex.test(value)) {
					return failure([createIssue(`Invalid email format`)]);
				}
			}
			if (this._url) {
				try {
					new URL(value);
				} catch {
					return failure([createIssue(`Invalid URL format`)]);
				}
			}
			return success(value);
		},
		types: undefined as unknown as { input: string; output: string },
	};

	describe(description: string): this {
		this.description = description;
		return this;
	}

	/**
	 * Set minimum length.
	 *
	 * @example
	 * ```typescript
	 * const schema = s.string().min(3);
	 * schema.parse('hello'); // "hello"
	 * schema.parse('hi'); // throws ValidationError
	 * ```
	 */
	min(length: number): StringSchema {
		const clone = this._clone();
		clone._min = length;
		return clone;
	}

	/**
	 * Set maximum length.
	 *
	 * @example
	 * ```typescript
	 * const schema = s.string().max(10);
	 * schema.parse('hello'); // "hello"
	 * schema.parse('hello world'); // throws ValidationError
	 * ```
	 */
	max(length: number): StringSchema {
		const clone = this._clone();
		clone._max = length;
		return clone;
	}

	/**
	 * Validate email format.
	 *
	 * @example
	 * ```typescript
	 * const schema = s.string().email();
	 * schema.parse('user@example.com'); // "user@example.com"
	 * schema.parse('invalid'); // throws ValidationError
	 * ```
	 */
	email(): StringSchema {
		const clone = this._clone();
		clone._email = true;
		return clone;
	}

	/**
	 * Validate URL format.
	 *
	 * @example
	 * ```typescript
	 * const schema = s.string().url();
	 * schema.parse('https://example.com'); // "https://example.com"
	 * schema.parse('invalid'); // throws ValidationError
	 * ```
	 */
	url(): StringSchema {
		const clone = this._clone();
		clone._url = true;
		return clone;
	}

	optional() {
		return optional(this);
	}

	nullable() {
		return nullable(this);
	}

	private _clone(): StringSchema {
		const clone = new StringSchema();
		clone.description = this.description;
		clone._min = this._min;
		clone._max = this._max;
		clone._email = this._email;
		clone._url = this._url;
		return clone;
	}

	parse = parseMethods.parse;
	safeParse = parseMethods.safeParse;
}

/**
 * Create a string schema.
 *
 * @example
 * ```typescript
 * const nameSchema = s.string().describe('User name');
 * const name = nameSchema.parse('John');
 * ```
 */
export function string(): StringSchema {
	return new StringSchema();
}
