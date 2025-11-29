/* eslint-disable @typescript-eslint/no-explicit-any */

// NOTE: these ideas are borrowed from https://github.com/Effect-TS/effect

import util from 'node:util';
import { safeStringify } from './json';

type PlainObject = Record<string, any>;

const _argsSym = Symbol('@@RichError:plainArgs');
const _causeSym = Symbol('@@RichError:cause');
const _metaSym = Symbol('@@RichError:meta'); // reserved for future use (non-enumerable)
const _structuredSym = Symbol.for('@@StructuredError');

const spacer = '  ';

export class RichError extends Error {
	// private slots (non-enumerable)
	private [_argsSym]?: PlainObject;
	private [_causeSym]?: unknown;
	private [_metaSym]?: PlainObject;

	constructor(args?: PlainObject) {
		const message = args?.message ?? undefined;
		const cause = (args?.cause ?? undefined) as unknown;

		// If platform supports error cause option, pass it to Error constructor
		// (Node 16+ / modern engines)
		if (cause !== undefined) {
			super(message, { cause } as any);
		} else {
			super(message);
		}

		// correct prototype chain when transpiled to older JS
		Object.setPrototypeOf(this, new.target.prototype);

		// capture a clean stack (omit this constructor)
		if (typeof (Error as any).captureStackTrace === 'function') {
			(Error as any).captureStackTrace(this, new.target);
		} else {
			// fallback: ensure stack exists
			if (!this.stack) {
				this.stack = new Error(message).stack;
			}
		}

		if (args && typeof args === 'object') {
			// copy all fields except cause and message (we keep them separate)
			const { cause: _c, message: _m, ...rest } = args;
			if (Object.keys(rest).length > 0) {
				Object.assign(this, rest);
				this[_argsSym] = rest;
			}
			if (cause !== undefined) {
				this[_causeSym] = cause;
			}
		}
		// hide internal symbols and meta (redefine non-enumerable)
		Object.defineProperty(this, _argsSym, {
			value: this[_argsSym],
			enumerable: false,
			writable: true,
		});
		Object.defineProperty(this, _causeSym, {
			value: this[_causeSym],
			enumerable: false,
			writable: true,
		});
		Object.defineProperty(this, _metaSym, {
			value: this[_metaSym] ?? {},
			enumerable: false,
			writable: true,
		});
	}

	/** Return the stored plain args (if any) */
	get plainArgs(): PlainObject | undefined {
		return this[_argsSym];
	}

	/** Return the cause (if any) */
	get cause(): unknown | undefined {
		return this[_causeSym];
	}

	/** Pretty, recursive string representation (follows cause chain). */
	prettyPrint(space = 2): string {
		const lines: string[] = [];
		const visited = new Set<Error>();

		// eslint-disable-next-line @typescript-eslint/no-this-alias
		let cur: Error | undefined = this;
		let depth = 0;
		while (cur && cur instanceof Error && !visited.has(cur)) {
			const curAny = cur as any;
			visited.add(cur);
			const header = `${cur.name}${curAny._tag && curAny._tag !== cur.name ? ` (${String(curAny._tag)})` : ''}${depth === 0 ? '' : ' [cause]'}`;
			const msg = cur.message !== undefined && cur.message !== '' ? `: ${cur.message}` : '';
			lines.push(header + msg);

			// include stack if present (limit to first line of stack header for brevity)
			if (cur.stack) {
				lines.push('');
				lines.push(spacer + 'stack trace:');
				const stackLines = String(cur.stack).split('\n').slice(1); // drop first line (it's message)
				if (stackLines.length > 0) {
					// indent stack
					let s = stackLines.map((s) => spacer + spacer + s.trim());
					if (s[s.length - 1].includes('processTicksAndRejections')) {
						s = s.slice(0, s.length - 1);
					}
					lines.push(...s);
				}
			}

			// include plain args as formatted output (if any)
			if (curAny[_argsSym]) {
				let argsStr = util.formatWithOptions(
					{
						depth: 10,
						sorted: true,
						showHidden: false,
						showProxy: false,
						maxArrayLength: 10,
						maxStringLength: 80 - spacer.length * 2,
					},
					curAny[_argsSym]
				);
				argsStr = argsStr.replace(/^{/, '').replace(/}$/, '');
				const jsonlines = argsStr
					.split('\n')
					.filter(Boolean)
					.map((l: string) => spacer + spacer + l + '\n')
					.join('');
				lines.push('');
				lines.push(spacer + 'context:\n' + jsonlines);
			}

			// include cause summary if non-Error (could be object)
			const c: unknown = cur.cause ?? curAny[_causeSym];
			if (c && !(c instanceof Error)) {
				lines.push(spacer + 'cause: ' + safeStringify(c, space));
			}

			cur = c instanceof Error ? c : undefined;
			depth += 1;
			if (cur) lines.push('-- caused by --');
		}

		return lines.join('\n');
	}

	toJSON() {
		// Represent as merged: args, public enumerable props, plus well-known fields
		const output: any = {};

		// include args first (non-enumerable original values)
		if (this[_argsSym]) {
			Object.assign(output, this[_argsSym]);
		}

		// copy enumerable own props
		for (const k of Object.keys(this)) {
			// skip internal symbols (they are non-enumerable anyway)
			output[k] = (this as any)[k];
		}

		// canonical fields
		output.name = this.name;
		if (this.message !== undefined) output.message = this.message;
		if (this.stack !== undefined) output.stack = this.stack;
		if (this.cause !== undefined) {
			if (this.cause instanceof Error) {
				output.cause = {
					name: this.cause.name,
					message: this.cause.message,
					stack: (this.cause as any).stack,
				};
			} else {
				output.cause = this.cause;
			}
		}

		return output;
	}

	toString(): string {
		// default to pretty print with small indent
		return this.prettyPrint(2);
	}

	[util.inspect.custom](_depth: number, _options: any) {
		return this.prettyPrint(); // or some concise string/JSON
	}
}

type StructuredErrorConstructor<
	Tag extends string,
	Shape extends PlainObject,
	HasDefault extends boolean,
> = {
	new (
		args?: Shape extends Record<string, never>
			? HasDefault extends true
				? { cause?: unknown }
				: { message?: string; cause?: unknown }
			: HasDefault extends true
				? Shape & { cause?: unknown }
				: Shape & { message?: string; cause?: unknown }
	): RichError & { readonly _tag: Tag } & Readonly<Shape>;
	readonly defaultMessage?: string;
};

/**
 * StructuredError factory with automatic tag inference and payload typing.
 *
 * Creates a custom error class with:
 * - A readonly `_tag` property for runtime type discrimination
 * - Automatic stack trace capture
 * - Cause chaining support
 * - Pretty printing with `prettyPrint()` and `toString()`
 * - JSON serialization with `toJSON()`
 *
 * @template Tag - The literal string tag type (automatically inferred from the tag parameter)
 * @param tag - The unique identifier for this error type (used as the error name)
 * @param defaultMessage - Optional default message to use when no message is provided in args
 * @returns A constructor function that can be called directly or with a shape generic
 *
 * @example
 * // Without shape (tag auto-inferred)
 * const NotFound = StructuredError("NotFound")
 * throw new NotFound({ id: 1, message: "nope", cause: someError })
 *
 * @example
 * // With typed shape (tag auto-inferred, shape explicitly typed)
 * const ValidationError = StructuredError("ValidationError")<{ field: string; code: string }>()
 * throw new ValidationError({ field: "email", code: "INVALID", message: "Invalid email" })
 *
 * @example
 * // With default message (message cannot be overridden)
 * const UpgradeRequired = StructuredError("UpgradeRequired", "Upgrade required to access this feature")
 * throw new UpgradeRequired({ feature: "advanced" }) // message is automatically set and cannot be changed
 */
type StructuredErrorFactory<
	Tag extends string,
	HasDefault extends boolean,
> = StructuredErrorConstructor<Tag, Record<string, never>, HasDefault> &
	(<Shape extends PlainObject = Record<string, never>>() => StructuredErrorConstructor<
		Tag,
		Shape,
		HasDefault
	>);

export function StructuredError<const Tag extends string>(
	tag: Tag,
	defaultMessage: string
): StructuredErrorFactory<Tag, true>;
export function StructuredError<const Tag extends string>(
	tag: Tag
): StructuredErrorFactory<Tag, false>;
export function StructuredError<const Tag extends string>(tag: Tag, defaultMessage?: string) {
	function createErrorClass<
		Shape extends PlainObject = Record<string, never>,
	>(): StructuredErrorConstructor<
		Tag,
		Shape,
		typeof defaultMessage extends string ? true : false
	> {
		// create a unique symbol for this tag's args storage so different factories don't clash
		const tagArgsSym = Symbol.for(`@StructuredError:tag:${tag}`);

		class Tagged extends RichError {
			// runtime readonly property for tag
			public readonly _tag: Tag = tag as Tag;
			static readonly defaultMessage = defaultMessage;

			constructor(args?: Shape & { message?: string; cause?: unknown }) {
				// ensure `_tag` isn't copied from args accidentally
				const safeArgs =
					args && typeof args === 'object'
						? (() => {
								const { _tag: _discard, ...rest } = args as any;
								return rest;
							})()
						: args;

				// Apply default message if no message provided
				const finalArgs =
					safeArgs && typeof safeArgs === 'object'
						? { ...safeArgs, message: safeArgs.message ?? defaultMessage }
						: defaultMessage
							? { message: defaultMessage }
							: safeArgs;

				super(finalArgs);
				// name the class for nicer stacks
				try {
					Object.defineProperty(this, 'name', { value: tag, configurable: true });
				} catch {
					(this as any).name = tag;
				}
				// mark as StructuredError with brand symbol
				Object.defineProperty(this, _structuredSym, {
					value: true,
					enumerable: false,
					writable: false,
				});
				// store tag args symbol to hide anything specific to this factory (non-enumerable)
				Object.defineProperty(this, tagArgsSym, {
					value: safeArgs,
					enumerable: false,
					writable: true,
				});
			}
		}

		// set prototype name (works in many engines)
		try {
			Object.defineProperty(Tagged, 'name', { value: String(tag) });
		} catch {
			(Tagged as any).name = tag;
		}

		return Tagged as unknown as StructuredErrorConstructor<
			Tag,
			Shape,
			typeof defaultMessage extends string ? true : false
		>;
	}

	// Create a callable constructor: can be used directly or called with generics
	type WithShape = <
		Shape extends Record<string, any> = Record<string, never>,
	>() => StructuredErrorConstructor<
		Tag,
		Shape,
		typeof defaultMessage extends string ? true : false
	>;
	type Result = StructuredErrorConstructor<
		Tag,
		Record<string, never>,
		typeof defaultMessage extends string ? true : false
	> &
		WithShape;

	const baseClass = createErrorClass<Record<string, never>>();

	// Use a Proxy to intercept calls and return shaped classes
	const callable = new Proxy(baseClass, {
		apply(_target, _thisArg, _args) {
			// When called as a function (for generic type application), return a new class
			// This happens when TypeScript sees: StructuredError("Tag")<Shape>()
			return createErrorClass();
		},
	});

	return callable as Result;
}

/**
 * Returns true if the error passed is an instance of a StructuredObject
 *
 * @param err the error object
 * @returns true if err is a StructuredError
 *
 * @example
 * const UpgradeRequired = StructuredError("UpgradeRequired", "Upgrade required to access this feature")
 * try {
 *   throw UpgradeRequired();
 * } catch (ex) {
 *   if (isStructuredError(ex)) {
 *     console.log(ex._tag);
 *   }
 * }
 */
export function isStructuredError(err: unknown): err is RichError & { _tag: string } {
	return (
		typeof err === 'object' &&
		err !== null &&
		(_structuredSym in err || err instanceof RichError) &&
		typeof (err as any)._tag === 'string'
	);
}
