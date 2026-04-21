/**
 * Transform: port `@agentuity/schema` usage to `zod`.
 *
 * v3 still ships @agentuity/schema but the idiomatic path for user-owned
 * schemas is zod. The migrate tool replaces the import and the `s.*`
 * namespace calls so downstream code parses with zod at runtime.
 *
 * Conservative mapping — we do not try to handle every edge case. Advanced
 * shapes (e.g. s.toJSONSchema) are flagged with a TODO comment for manual
 * review rather than silently mistranslated.
 */

export interface SchemaToZodResult {
	source: string;
	changed: boolean;
	changes: string[];
}

const BUILDERS = [
	'object',
	'string',
	'number',
	'boolean',
	'null_',
	'undefined_',
	'unknown',
	'any',
	'array',
	'record',
	'literal',
	'optional',
	'nullable',
	'enum',
	'union',
	'coerceString',
	'coerceNumber',
	'coerceBoolean',
	'coerceDate',
];

export function schemaToZod(source: string): SchemaToZodResult {
	let output = source;
	const changes: string[] = [];

	// 1. Import swap: `import { s } from '@agentuity/schema'` → `import { z } from 'zod'`.
	const importBefore = output;
	output = output.replace(
		/import\s*\{\s*s\s*\}\s*from\s*['"]@agentuity\/schema['"]\s*;?/g,
		"import { z } from 'zod';"
	);
	if (output !== importBefore) {
		changes.push(
			"Replaced `import { s } from '@agentuity/schema'` with `import { z } from 'zod'`"
		);
	}

	// Also handle `import type { Schema } from '@agentuity/schema'` which is
	// vestigial — the type isn't used anywhere we care about in the scaffold.
	// Drop it rather than try to translate.
	const typeImportBefore = output;
	output = output.replace(
		/import\s+type\s*\{[^}]*\}\s*from\s*['"]@agentuity\/schema['"]\s*;?\s*\n?/g,
		''
	);
	if (output !== typeImportBefore) {
		changes.push('Removed type imports from @agentuity/schema');
	}

	// If this file didn't use schema at all, bail early.
	if (changes.length === 0 && !/\bs\s*\./.test(output)) {
		return { source: output, changed: false, changes: [] };
	}

	// 2. s.<builder>(…) → z.<builder>(…).
	let replacedBuilders = 0;
	for (const name of BUILDERS) {
		const pattern = new RegExp(`(^|[^A-Za-z0-9_$.])s\\.${name}(?=\\b)`, 'g');
		output = output.replace(pattern, (_m, pre: string) => {
			replacedBuilders++;
			if (name.startsWith('coerce')) {
				const prim = name.slice('coerce'.length).toLowerCase();
				return `${pre}z.coerce.${prim}`;
			}
			// The @agentuity/schema names `null_` and `undefined_` map to zod's
			// keyword-named functions `null`/`undefined` but those are reserved,
			// so zod exposes them as methods on the `z` object just fine.
			let mapped = name;
			if (name === 'null_') mapped = 'null';
			if (name === 'undefined_') mapped = 'undefined';
			return `${pre}z.${mapped}`;
		});
	}
	if (replacedBuilders > 0) {
		changes.push(`Replaced ${replacedBuilders} s.<builder>() call(s) with z.<builder>()`);
	}

	// 3. Type helpers.
	const typeBefore = output;
	output = output.replace(/\bs\.infer\b/g, 'z.infer');
	if (output !== typeBefore) {
		changes.push('Replaced s.infer<…> with z.infer<…>');
	}

	// 4. Advanced APIs we can't safely auto-translate: s.toJSONSchema.
	const jsonSchemaBefore = output;
	output = output.replace(
		/\bs\.toJSONSchema\b/g,
		'/* TODO: replace with zodToJsonSchema() from `zod-to-json-schema`, or use `.toJSON()` on zod v4 */ (null as any)'
	);
	if (output !== jsonSchemaBefore) {
		changes.push('Stubbed s.toJSONSchema — requires manual swap to a zod equivalent');
	}

	// 5. @agentuity/schema's s.union(a, b, c) is variadic; zod's z.union takes
	// an array. Rewrite call sites with 2+ args to z.union([a, b, c]).
	const unionBefore = output;
	output = rewriteZUnionCalls(output);
	if (output !== unionBefore) {
		changes.push('Rewrote z.union(a, b, c) → z.union([a, b, c])');
	}

	return { source: output, changed: changes.length > 0, changes };
}

/**
 * Walk `z.union(…)` call sites and wrap the args in an array literal unless
 * they already are one. We scan with a brace-depth counter so nested parens
 * and generic type arguments don't confuse us.
 */
function rewriteZUnionCalls(source: string): string {
	const needle = 'z.union(';
	let output = '';
	let i = 0;
	while (i < source.length) {
		const idx = source.indexOf(needle, i);
		if (idx < 0) {
			output += source.slice(i);
			break;
		}
		output += source.slice(i, idx) + needle;
		let depth = 1;
		let j = idx + needle.length;
		const start = j;
		while (j < source.length && depth > 0) {
			const ch = source[j];
			if (ch === '(') depth++;
			else if (ch === ')') {
				depth--;
				if (depth === 0) break;
			}
			j++;
		}
		const argsStr = source.slice(start, j);
		if (argsStr.trimStart().startsWith('[')) {
			output += argsStr + ')';
		} else {
			output += '[' + argsStr + '])';
		}
		i = j + 1;
	}
	return output;
}
