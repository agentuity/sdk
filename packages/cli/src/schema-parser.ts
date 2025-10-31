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
	type: 'string' | 'number' | 'boolean';
	hasDefault?: boolean;
	defaultValue?: unknown;
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

function getShape(schema: ZodType): Record<string, unknown> {
	const unwrapped = unwrapSchema(schema) as ZodTypeInternal;
	const typeId = unwrapped?._def?.typeName || unwrapped?._def?.type;

	if (typeId === 'ZodObject' || typeId === 'object') {
		const shape = unwrapped._def.shape;
		return typeof shape === 'function' ? shape() : (shape as Record<string, unknown>) || {};
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
		const defaultValue = defaultInfo.defaultIsFunction
			? (defaultInfo.defaultValue as () => unknown)()
			: defaultInfo.defaultValue;

		let type: 'string' | 'number' | 'boolean' = 'string';
		if (typeId === 'ZodNumber' || typeId === 'number') {
			type = 'number';
		} else if (typeId === 'ZodBoolean' || typeId === 'boolean') {
			type = 'boolean';
		}

		options.push({
			name: key,
			type,
			description,
			hasDefault: defaultInfo.hasDefault,
			defaultValue,
		});
	}

	return options;
}

export function buildValidationInput(
	schemas: CommandSchemas,
	rawArgs: unknown[],
	rawOptions: Record<string, unknown>
): { args: Record<string, unknown>; options: Record<string, unknown> } {
	const result = { args: {} as Record<string, unknown>, options: {} as Record<string, unknown> };

	if (schemas.args) {
		const parsed = parseArgsSchema(schemas.args);
		for (let i = 0; i < parsed.names.length; i++) {
			result.args[parsed.names[i]] = rawArgs[i];
		}
	}

	if (schemas.options) {
		const parsed = parseOptionsSchema(schemas.options);
		for (const opt of parsed) {
			// Always include the option value (even if undefined) so zod can apply defaults
			result.options[opt.name] = rawOptions[opt.name];
		}
	}

	return result;
}
