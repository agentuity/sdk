import type { Schema } from '../base';
import { createIssue, failure, success, createParseMethods, SCHEMA_KIND } from '../base';
import { optional } from '../utils/optional';
import { nullable } from '../utils/nullable';

const parseMethods = createParseMethods<number>();

/**
 * Schema for validating number values.
 * Rejects NaN values.
 *
 * @example
 * ```typescript
 * const schema = s.number();
 * const age = schema.parse(30); // 30
 * schema.parse('30'); // throws ValidationError
 * schema.parse(NaN); // throws ValidationError
 * ```
 */
export class NumberSchema implements Schema<number, number> {
	readonly [SCHEMA_KIND] = 'NumberSchema';
	description?: string;
	private _finite = false;
	private _min?: number;
	private _max?: number;

	readonly '~standard' = {
		version: 1 as const,
		vendor: 'agentuity',
		validate: (value: unknown) => {
			if (typeof value !== 'number' || Number.isNaN(value)) {
				return failure([createIssue(`Expected number, got ${typeof value}`)]);
			}
			if (this._finite && !Number.isFinite(value)) {
				return failure([createIssue('Expected finite number (not Infinity or -Infinity)')]);
			}
			if (this._min !== undefined && value < this._min) {
				return failure([createIssue(`Expected number >= ${this._min}, got ${value}`)]);
			}
			if (this._max !== undefined && value > this._max) {
				return failure([createIssue(`Expected number <= ${this._max}, got ${value}`)]);
			}
			return success(value);
		},
		types: undefined as unknown as { input: number; output: number },
	};

	describe(description: string): this {
		this.description = description;
		return this;
	}

	/**
	 * Require the number to be finite (not Infinity, -Infinity, or NaN).
	 *
	 * @example
	 * ```typescript
	 * const schema = s.number().finite();
	 * schema.parse(123); // 123
	 * schema.parse(Infinity); // throws ValidationError
	 * schema.parse(-Infinity); // throws ValidationError
	 * ```
	 */
	finite(): NumberSchema {
		const clone = this._clone();
		clone._finite = true;
		return clone;
	}

	/**
	 * Set minimum value (inclusive).
	 *
	 * @example
	 * ```typescript
	 * const schema = s.number().min(0);
	 * schema.parse(5); // 5
	 * schema.parse(-1); // throws ValidationError
	 * ```
	 */
	min(value: number): NumberSchema {
		const clone = this._clone();
		clone._min = value;
		return clone;
	}

	/**
	 * Set maximum value (inclusive).
	 *
	 * @example
	 * ```typescript
	 * const schema = s.number().max(100);
	 * schema.parse(50); // 50
	 * schema.parse(101); // throws ValidationError
	 * ```
	 */
	max(value: number): NumberSchema {
		const clone = this._clone();
		clone._max = value;
		return clone;
	}

	optional() {
		return optional(this);
	}

	nullable() {
		return nullable(this);
	}

	private _clone(): NumberSchema {
		const clone = new NumberSchema();
		clone.description = this.description;
		clone._finite = this._finite;
		clone._min = this._min;
		clone._max = this._max;
		return clone;
	}

	parse = parseMethods.parse;
	safeParse = parseMethods.safeParse;
}

/**
 * Create a number schema.
 *
 * @example
 * ```typescript
 * const ageSchema = s.number().describe('User age');
 * const age = ageSchema.parse(30);
 *
 * const finiteSchema = s.number().finite();
 * finiteSchema.parse(123); // OK
 * finiteSchema.parse(Infinity); // throws
 *
 * const rangeSchema = s.number().min(0).max(100);
 * rangeSchema.parse(50); // OK
 * rangeSchema.parse(101); // throws
 * ```
 */
export function number(): NumberSchema {
	return new NumberSchema();
}
