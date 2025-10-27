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

export function parseOptionsSchema(schema: ZodType): ParsedOption[] {
	const shape = getShape(schema);
	const options: ParsedOption[] = [];

	for (const [key, value] of Object.entries(shape)) {
		const unwrapped = unwrapSchema(value) as ZodTypeInternal;
		const description = (value as ZodTypeInternal)?._def?.description;
		/* eslint-disable @typescript-eslint/no-explicit-any */
		const typeId =
			unwrapped?._def?.typeName || (unwrapped as any)?._def?.type || (unwrapped as any)?.type;
		/* eslint-enable @typescript-eslint/no-explicit-any */

		let type: 'string' | 'number' | 'boolean' = 'string';
		if (typeId === 'ZodNumber' || typeId === 'number') {
			type = 'number';
		} else if (typeId === 'ZodBoolean' || typeId === 'boolean') {
			type = 'boolean';
		}

		options.push({ name: key, type, description });
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
			if (rawOptions[opt.name] !== undefined) {
				result.options[opt.name] = rawOptions[opt.name];
			}
		}
	}

	return result;
}
