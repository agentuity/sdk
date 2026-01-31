import type { ZodType } from 'zod';
import type { CommandSchemas } from './types';

export interface ParsedArgs {
	names: string[];
	metadata: Array<{
		name: string;
		optional: boolean;
		variadic: boolean;
	}>;
}

export interface ParsedOption {
	name: string;
	description?: string;
	type: 'string' | 'number' | 'boolean' | 'array' | 'optionalString';
	hasDefault?: boolean;
	defaultValue?: unknown;
	enumValues?: string[];
}

interface ZodTypeDef {
	typeName?: string;
	type?: string;
	innerType?: unknown;
	schema?: unknown;
	shape?: (() => Record<string, unknown>) | Record<string, unknown>;
	description?: string;
}

interface ZodTypeInternal {
	_def: ZodTypeDef;
}

function unwrapSchema(schema: unknown): unknown {
	let current = schema as ZodTypeInternal | undefined;

	while (current?._def) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const typeId = current._def.typeName || current._def.type || (current as any).type;

		if ((typeId === 'ZodEffects' || typeId === 'effects') && current._def.schema) {
			current = current._def.schema as ZodTypeInternal;
		} else if ((typeId === 'ZodOptional' || typeId === 'optional') && current._def.innerType) {
			current = current._def.innerType as ZodTypeInternal;
		} else if ((typeId === 'ZodNullable' || typeId === 'nullable') && current._def.innerType) {
			current = current._def.innerType as ZodTypeInternal;
		} else if ((typeId === 'ZodDefault' || typeId === 'default') && current._def.innerType) {
			current = current._def.innerType as ZodTypeInternal;
		} else if ((typeId === 'ZodReadonly' || typeId === 'readonly') && current._def.innerType) {
			current = current._def.innerType as ZodTypeInternal;
		} else {
			break;
		}
	}

	return current;
}

/**
 * Check if a schema is a union of boolean and string (for optional string flags like --org [value])
 * This pattern is used when a flag can be used as a boolean (--org) or with a value (--org=myOrgId)
 */
function isBooleanStringUnion(schema: unknown): boolean {
	const unwrapped = unwrapSchema(schema) as ZodTypeInternal;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const def = unwrapped?._def as any;
	// Zod 3 uses typeName, Zod 4 uses type
	const typeId = def?.typeName || def?.type;

	if (typeId !== 'ZodUnion' && typeId !== 'union') {
		return false;
	}

	// Zod 3 uses _def.options, Zod 4 uses .options directly on the schema or _def.options
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const options = def?.options || (unwrapped as any)?.options;
	if (!Array.isArray(options) || options.length !== 2) {
		return false;
	}

	const types = new Set<string>();
	for (const opt of options) {
		// Zod 4: type is directly on the object as .type
		// Zod 3: type is _def.typeName
		const optUnknown = opt as unknown as Record<string, unknown>;
		const optDef = optUnknown?._def as Record<string, unknown> | undefined;
		const optType =
			(optUnknown?.type as string) || (optDef?.typeName as string) || (optDef?.type as string);
		types.add(optType);
	}

	return (
		(types.has('boolean') || types.has('ZodBoolean')) &&
		(types.has('string') || types.has('ZodString'))
	);
}

function getShape(schema: ZodType): Record<string, unknown> {
	const unwrapped = unwrapSchema(schema) as ZodTypeInternal;
	const typeId = unwrapped?._def?.typeName || unwrapped?._def?.type;

	if (typeId === 'ZodObject' || typeId === 'object') {
		const shape = unwrapped._def.shape;
		return typeof shape === 'function' ? shape() : (shape as Record<string, unknown>) || {};
	}

	if (typeId === 'ZodIntersection' || typeId === 'intersection') {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const def = (unwrapped as any)._def;
		const leftShape = def.left ? getShape(def.left as ZodType) : {};
		const rightShape = def.right ? getShape(def.right as ZodType) : {};
		return { ...leftShape, ...rightShape };
	}

	return {};
}

export function parseArgsSchema(schema: ZodType): ParsedArgs {
	const shape = getShape(schema);
	const names: string[] = [];
	const metadata: Array<{ name: string; optional: boolean; variadic: boolean }> = [];

	for (const [key, value] of Object.entries(shape)) {
		names.push(key);

		/* eslint-disable @typescript-eslint/no-explicit-any */
		const typeId =
			(value as ZodTypeInternal)?._def?.typeName ||
			(value as any)._def?.type ||
			(value as any).type;
		const unwrapped = unwrapSchema(value) as ZodTypeInternal;
		const unwrappedTypeId =
			unwrapped?._def?.typeName || (unwrapped as any)?._def?.type || (unwrapped as any)?.type;
		/* eslint-enable @typescript-eslint/no-explicit-any */

		const isOptional = typeId === 'ZodOptional' || typeId === 'optional';
		const isVariadic = unwrappedTypeId === 'ZodArray' || unwrappedTypeId === 'array';

		metadata.push({ name: key, optional: isOptional, variadic: isVariadic });
	}

	return { names, metadata };
}

/**
 * Extract default value information from a Zod schema by walking the wrapper chain
 */
function extractDefaultInfo(schema: unknown): {
	hasDefault: boolean;
	defaultValue?: unknown;
	defaultIsFunction: boolean;
} {
	let current = schema as ZodTypeInternal | undefined;

	while (current?._def) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const typeId = current._def.typeName || (current as any)._def?.type;

		if (typeId === 'ZodDefault' || typeId === 'default') {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const rawDefaultValue = (current as any)._def?.defaultValue;
			const defaultIsFunction = typeof rawDefaultValue === 'function';

			return {
				hasDefault: true,
				defaultValue: rawDefaultValue,
				defaultIsFunction,
			};
		}

		// Continue through wrapper chain
		if (
			(typeId === 'ZodOptional' ||
				typeId === 'optional' ||
				typeId === 'ZodNullable' ||
				typeId === 'nullable' ||
				typeId === 'ZodEffects' ||
				typeId === 'effects' ||
				typeId === 'ZodReadonly' ||
				typeId === 'readonly') &&
			current._def.innerType
		) {
			current = current._def.innerType as ZodTypeInternal;
		} else if ((typeId === 'ZodEffects' || typeId === 'effects') && current._def.schema) {
			current = current._def.schema as ZodTypeInternal;
		} else {
			break;
		}
	}

	return { hasDefault: false, defaultIsFunction: false };
}

export function parseOptionsSchema(schema: ZodType): ParsedOption[] {
	const shape = getShape(schema);
	const options: ParsedOption[] = [];

	for (const [key, value] of Object.entries(shape)) {
		const unwrapped = unwrapSchema(value) as ZodTypeInternal;
		const description =
			(unwrapped as ZodTypeInternal)?._def?.description ??
			(value as unknown as { description?: string })?.description ??
			(value as ZodTypeInternal)?._def?.description;
		/* eslint-disable @typescript-eslint/no-explicit-any */
		const typeId =
			unwrapped?._def?.typeName || (unwrapped as any)?._def?.type || (unwrapped as any)?.type;
		/* eslint-enable @typescript-eslint/no-explicit-any */

		// Extract default info using helper that walks the wrapper chain
		const defaultInfo = extractDefaultInfo(value);

		// Evaluate function defaults at parse-time for actual default value
		// Wrapped in try/catch to handle non-pure default functions gracefully
		let defaultValue = defaultInfo.defaultValue;
		if (defaultInfo.defaultIsFunction) {
			try {
				defaultValue = (defaultInfo.defaultValue as () => unknown)();
			} catch {
				defaultValue = '<function>';
			}
		}

		let type: 'string' | 'number' | 'boolean' | 'array' | 'optionalString' = 'string';
		let enumValues: string[] | undefined;
		if (isBooleanStringUnion(value)) {
			// z.union([z.boolean(), z.string()]) - flag can be used as --flag or --flag=value
			type = 'optionalString';
		} else if (typeId === 'ZodNumber' || typeId === 'number') {
			type = 'number';
		} else if (typeId === 'ZodBoolean' || typeId === 'boolean') {
			type = 'boolean';
		} else if (typeId === 'ZodArray' || typeId === 'array') {
			type = 'array';
		} else if (typeId === 'ZodEnum' || typeId === 'enum') {
			// Extract enum values from Zod 4's def.entries
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const def = (unwrapped as any)?._def;
			if (def?.entries && typeof def.entries === 'object') {
				enumValues = Object.values(def.entries as Record<string, string>);
			}
		}

		options.push({
			name: key,
			type,
			description,
			hasDefault: defaultInfo.hasDefault,
			defaultValue,
			enumValues,
		});
	}

	return options;
}

// Cache for stdin confirmation detection
let stdinConfirmationChecked = false;
let stdinConfirmation: boolean | null = null;

/**
 * Check if stdin contains a piped "yes" confirmation.
 * This allows commands to be run with `echo "yes" | agentuity <command>` pattern.
 * Only works when stdin is not a TTY (piped input) and command doesn't use stdin.
 */
async function checkStdinConfirmation(): Promise<boolean> {
	if (stdinConfirmationChecked) {
		return stdinConfirmation === true;
	}
	stdinConfirmationChecked = true;

	// Only check if stdin is not a TTY (meaning input is piped)
	if (process.stdin.isTTY) {
		stdinConfirmation = null;
		return false;
	}

	try {
		// Read stdin with a short timeout to avoid blocking
		const reader = process.stdin;
		let timeoutId: ReturnType<typeof setTimeout> | null = null;
		let resolved = false;
		const MAX_BYTES = 4096;

		// Define handlers outside so we can remove them in all paths
		let data = '';
		const onData = (chunk: Buffer) => {
			data += chunk.toString();
			if (data.length >= MAX_BYTES) {
				data = data.slice(0, MAX_BYTES);
			}
		};

		let onEnd: (() => void) | null = null;
		let onError: ((err: Error) => void) | null = null;

		const cleanup = () => {
			reader.removeListener('data', onData);
			if (onEnd) {
				reader.removeListener('end', onEnd);
			}
			if (onError) {
				reader.removeListener('error', onError);
			}
			reader.pause();
		};

		const readPromise = new Promise<string>((resolve) => {
			onEnd = () => {
				if (resolved) return;
				resolved = true;
				if (timeoutId !== null) {
					clearTimeout(timeoutId);
					timeoutId = null;
				}
				cleanup();
				resolve(data.trim().toLowerCase());
			};
			onError = (_err: Error) => {
				if (resolved) return;
				resolved = true;
				stdinConfirmation = null;
				if (timeoutId !== null) {
					clearTimeout(timeoutId);
					timeoutId = null;
				}
				cleanup();
				resolve('');
			};
			reader.on('data', onData);
			reader.on('end', onEnd);
			reader.on('error', onError);
		});

		// Use a short timeout to avoid blocking
		const timeoutPromise = new Promise<string>((resolve) => {
			timeoutId = setTimeout(() => {
				if (resolved) return;
				resolved = true;
				// Clean up listeners and pause stdin when timeout wins
				cleanup();
				resolve('');
			}, 100);
		});

		const input = await Promise.race([readPromise, timeoutPromise]);
		// Take first token/line to handle inputs like "yes\nanything"
		const firstToken = input.split(/\s+/)[0] ?? '';
		stdinConfirmation = firstToken === 'yes' || firstToken === 'y';
		return stdinConfirmation;
	} catch {
		stdinConfirmation = null;
		return false;
	}
}

/**
 * Reset stdin confirmation cache (for testing)
 */
export function resetStdinConfirmationCache(): void {
	stdinConfirmationChecked = false;
	stdinConfirmation = null;
}

export function buildValidationInput(
	schemas: CommandSchemas,
	rawArgs: unknown[],
	rawOptions: Record<string, unknown>,
	_options?: { usesStdin?: boolean }
): { args: Record<string, unknown>; options: Record<string, unknown> } {
	const result = { args: {} as Record<string, unknown>, options: {} as Record<string, unknown> };

	if (schemas.args) {
		const parsed = parseArgsSchema(schemas.args);
		for (let i = 0; i < parsed.names.length; i++) {
			const name = parsed.names[i];
			if (name !== undefined) {
				result.args[name] = rawArgs[i];
			}
		}
	}

	if (schemas.options) {
		const parsed = parseOptionsSchema(schemas.options);
		for (const opt of parsed) {
			// Only include the option if it has a value - omitting undefined allows Zod to apply defaults
			// Commander.js converts kebab-case to camelCase, so we need to check both
			const camelCaseName = opt.name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
			let value = rawOptions[opt.name] ?? rawOptions[camelCaseName];

			// Handle --yes alias for --confirm: if confirm is not set but yes is, use yes value
			if (opt.name === 'confirm' && value === undefined && rawOptions.yes === true) {
				value = true;
			}

			if (value !== undefined) {
				result.options[opt.name] = value;
			}
		}
	}

	return result;
}

/**
 * Async version of buildValidationInput that also checks stdin for "yes" confirmation.
 * Use this when the command has a confirm option and doesn't use stdin for other purposes.
 */
export async function buildValidationInputAsync(
	schemas: CommandSchemas,
	rawArgs: unknown[],
	rawOptions: Record<string, unknown>,
	options?: { usesStdin?: boolean }
): Promise<{ args: Record<string, unknown>; options: Record<string, unknown> }> {
	const result = buildValidationInput(schemas, rawArgs, rawOptions, options);

	// Check for stdin confirmation if:
	// 1. Command has a confirm option in schema
	// 2. Command doesn't use stdin for other purposes
	// 3. confirm is not already set via flags
	if (schemas.options && !options?.usesStdin) {
		// Use getShape() instead of parseOptionsSchema() to avoid re-evaluating function defaults
		const shape = getShape(schemas.options);
		const hasConfirmOption = Object.prototype.hasOwnProperty.call(shape, 'confirm');
		const confirmValue = result.options.confirm;

		if (hasConfirmOption && confirmValue === undefined) {
			const stdinConfirmed = await checkStdinConfirmation();
			if (stdinConfirmed) {
				result.options.confirm = true;
			}
		}
	}

	return result;
}
