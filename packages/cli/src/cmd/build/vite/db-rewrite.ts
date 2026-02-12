/**
 * DB import rewriting helpers for the Bun.build plugin.
 *
 * These functions rewrite `import { SQL } from 'bun'` → `@agentuity/postgres`
 * and `import { Pool } from 'pg'` → `@agentuity/postgres` so that
 * the Agentuity resilient postgres driver is bundled into the server output.
 */

/**
 * Map a file path to the appropriate Bun loader based on extension.
 */
export const getLoaderForPath = (filePath: string): string => {
	if (filePath.endsWith('.tsx')) return 'tsx';
	if (filePath.endsWith('.jsx')) return 'jsx';
	if (filePath.endsWith('.ts')) return 'ts';
	if (filePath.endsWith('.mts') || filePath.endsWith('.cts')) return 'ts';
	if (filePath.endsWith('.js')) return 'js';
	if (filePath.endsWith('.mjs')) return 'js';
	if (filePath.endsWith('.cjs')) return 'js';
	return 'js';
};

/**
 * Split named import/export specifiers, moving the `targetName` specifier
 * to the `move` list while leaving everything else in `stay`.
 *
 * Type-only specifiers (prefixed with `type `) always stay.
 * Aliases (`SQL as Foo`) are matched on the import name, not the alias.
 */
export const rewriteNamedSpecifiers = (
	specifiers: string,
	targetName: string
): {
	stay: string[];
	move: string[];
	moved: boolean;
} => {
	const stay: string[] = [];
	const move: string[] = [];
	for (const raw of specifiers.split(',')) {
		const spec = raw.trim();
		if (!spec) continue;
		const isType = spec.startsWith('type ');
		const specText = isType ? spec.slice(5).trim() : spec;
		const [importName] = specText.split(/\s+as\s+/);
		if (!isType && importName === targetName) {
			move.push(specText);
		} else {
			stay.push(spec);
		}
	}

	return { stay, move, moved: move.length > 0 };
};

/**
 * Rewrite `import { SQL } from 'bun'` → `import { SQL } from '@agentuity/postgres'`.
 *
 * - Type-only imports (`import type { SQL }`) are left untouched.
 * - Inline type specifiers (`import { type SQL }`) are left untouched.
 * - Mixed imports are split: non-SQL specifiers stay with `'bun'`.
 * - Works with both single and double quotes, with or without semicolons.
 * - Preserves leading indentation.
 */
export const rewriteBunImports = (contents: string): { contents: string; changed: boolean } => {
	const bunNamedRegex =
		/(^|\n)([\t ]*)(import|export)\s+(type\s+)?\{([^}]+)\}\s+from\s+(['"])bun\6\s*;?/g;
	let changed = false;
	const updated = contents.replace(
		bunNamedRegex,
		(match, prefix, indent, keyword, typeKeyword, specifiers) => {
			if (typeKeyword) {
				return match;
			}
			const { stay, move, moved } = rewriteNamedSpecifiers(specifiers, 'SQL');
			if (!moved) {
				return match;
			}
			changed = true;
			const statements: string[] = [];
			if (stay.length > 0) {
				statements.push(`${indent}${keyword} { ${stay.join(', ')} } from 'bun';`);
			}
			if (move.length > 0) {
				statements.push(
					`${indent}${keyword} { ${move.join(', ')} } from '@agentuity/postgres';`
				);
			}
			return `${prefix}${statements.join('\n')}`;
		}
	);

	return { contents: updated, changed };
};

/**
 * Rewrite `import { Pool } from 'pg'` → `import { Pool } from '@agentuity/postgres'`.
 *
 * - Type-only imports (`import type { Pool }`) are left untouched.
 * - Namespace imports (`import * as pg`) are left untouched.
 * - Default imports (`import pg from 'pg'`) are left untouched.
 * - Mixed default+named imports are split correctly.
 * - Works with both `import` and `export` statements.
 */
export const rewritePgImports = (contents: string): { contents: string; changed: boolean } => {
	const importRegex = /(^|\n)([\t ]*)(import)\s+(type\s+)?([^;]+?)\s+from\s+(['"])pg\6\s*;?/g;
	const exportRegex = /(^|\n)([\t ]*)(export)\s+(?!type\b)\{([^}]+)\}\s+from\s+(['"])pg\5\s*;?/g;
	let changed = false;

	const updatedImports = contents.replace(
		importRegex,
		(match, prefix, indent, keyword, typeKeyword, clause) => {
			if (typeKeyword) {
				return match; // import type { ... } from 'pg' — skip entirely
			}
			const trimmed = clause.trim();
			if (trimmed.startsWith('*')) {
				return match;
			}

			let defaultImport: string | undefined;
			let namedSpecifiers: string | undefined;
			if (trimmed.startsWith('{')) {
				namedSpecifiers = trimmed.slice(1, trimmed.lastIndexOf('}'));
			} else if (trimmed.includes('{')) {
				const [defaultPart, rest] = trimmed.split('{', 2);
				defaultImport = defaultPart.replace(/,\s*$/, '').trim();
				namedSpecifiers = rest.slice(0, rest.lastIndexOf('}'));
			} else {
				defaultImport = trimmed;
			}

			const movedNamed = namedSpecifiers
				? rewriteNamedSpecifiers(namedSpecifiers, 'Pool')
				: { stay: [], move: [], moved: false };
			const moveDefault = false; // Default import is the entire pg module, not Pool — keep it with 'pg'
			const shouldMove = moveDefault || movedNamed.moved;

			if (!shouldMove) {
				return match;
			}

			changed = true;
			const statements: string[] = [];
			const pgNamed = movedNamed.stay;
			const postgresNamed = movedNamed.move;
			const pgDefault = moveDefault ? undefined : defaultImport;
			const postgresDefault = moveDefault ? defaultImport : undefined;

			if (pgDefault || pgNamed.length > 0) {
				const parts: string[] = [];
				if (pgDefault) parts.push(pgDefault);
				if (pgNamed.length > 0) parts.push(`{ ${pgNamed.join(', ')} }`);
				statements.push(`${indent}${keyword} ${parts.join(', ')} from 'pg';`);
			}
			if (postgresDefault || postgresNamed.length > 0) {
				const parts: string[] = [];
				if (postgresDefault) parts.push(postgresDefault);
				if (postgresNamed.length > 0) parts.push(`{ ${postgresNamed.join(', ')} }`);
				statements.push(`${indent}${keyword} ${parts.join(', ')} from '@agentuity/postgres';`);
			}

			return `${prefix}${statements.join('\n')}`;
		}
	);

	const updatedExports = updatedImports.replace(
		exportRegex,
		(match, prefix, indent, keyword, specifiers) => {
			const { stay, move, moved } = rewriteNamedSpecifiers(specifiers, 'Pool');
			if (!moved) {
				return match;
			}
			changed = true;
			const statements: string[] = [];
			if (stay.length > 0) {
				statements.push(`${indent}${keyword} { ${stay.join(', ')} } from 'pg';`);
			}
			if (move.length > 0) {
				statements.push(
					`${indent}${keyword} { ${move.join(', ')} } from '@agentuity/postgres';`
				);
			}
			return `${prefix}${statements.join('\n')}`;
		}
	);

	return { contents: updatedExports, changed };
};
