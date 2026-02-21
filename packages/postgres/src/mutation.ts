/**
 * Strips leading whitespace and SQL comments (block and line) from a query string.
 * Returns the remaining query text starting at the first non-comment token.
 */
export const LEADING_COMMENTS_RE = /^(?:\s+|\/\*[\s\S]*?\*\/|--[^\n]*\n)*/;

/**
 * Determines whether a SQL query is a mutation (INSERT, UPDATE, or DELETE)
 * that requires transaction wrapping for safe retry.
 *
 * Mutation statements wrapped in a transaction can be safely retried because
 * PostgreSQL guarantees that uncommitted transactions are rolled back when
 * the connection drops. This prevents:
 * - Duplicate rows from retried INSERTs
 * - Double-applied changes from retried UPDATEs (e.g., counter increments)
 * - Repeated side effects from retried DELETEs (e.g., cascade triggers)
 *
 * Handles two patterns:
 * 1. Direct mutations: `INSERT INTO ...`, `UPDATE ... SET`, `DELETE FROM ...`
 *    (with optional leading comments/whitespace)
 * 2. CTE mutations: `WITH cte AS (...) INSERT|UPDATE|DELETE ...` — scans past
 *    the WITH clause by tracking parenthesis depth to skip CTE subexpressions,
 *    then checks if the first top-level DML keyword is a mutation. The scanner
 *    treats single-quoted strings, double-quoted identifiers, dollar-quoted
 *    strings, line comments (--), and block comments as atomic regions so
 *    parentheses inside them do not corrupt depth tracking.
 *
 * @see https://github.com/agentuity/sdk/issues/911
 */
export function isMutationStatement(query: string): boolean {
	// Strip leading whitespace and SQL comments
	const stripped = query.replace(LEADING_COMMENTS_RE, '');

	// Fast path: direct mutation statement
	if (/^(INSERT|UPDATE|DELETE)\b/i.test(stripped)) {
		return true;
	}

	// Check for WITH (CTE) prefix
	if (!/^WITH\s/i.test(stripped)) {
		return false;
	}

	// Scan past the CTE clause to find the first top-level DML keyword.
	// We track parenthesis depth so we skip CTE subexpressions like
	// "WITH cte AS (SELECT ... INSERT ...)" without false-matching the
	// INSERT inside the parens.
	let depth = 0;
	let i = 4; // skip past "WITH"
	const len = stripped.length;

	while (i < len) {
		const ch = stripped[i]!;

		// ── Skip atomic regions (at any depth) ──────────────────────
		// These regions may contain parentheses that must not affect depth.

		// Single-quoted string: 'it''s a (test)'
		if (ch === "'") {
			i++;
			while (i < len) {
				if (stripped[i] === "'") {
					i++;
					if (i < len && stripped[i] === "'") {
						i++; // escaped '' → still inside string
					} else {
						break; // end of string
					}
				} else {
					i++;
				}
			}
			continue;
		}

		// Double-quoted identifier: "col(1)"
		if (ch === '"') {
			i++;
			while (i < len) {
				if (stripped[i] === '"') {
					i++;
					if (i < len && stripped[i] === '"') {
						i++; // escaped "" → still inside identifier
					} else {
						break;
					}
				} else {
					i++;
				}
			}
			continue;
		}

		// Line comment: -- has (parens)\n
		if (ch === '-' && i + 1 < len && stripped[i + 1] === '-') {
			i += 2;
			while (i < len && stripped[i] !== '\n') i++;
			if (i < len) i++; // skip newline
			continue;
		}

		// Block comment: /* has (parens) */
		if (ch === '/' && i + 1 < len && stripped[i + 1] === '*') {
			i += 2;
			while (i < len && !(stripped[i] === '*' && i + 1 < len && stripped[i + 1] === '/')) i++;
			if (i < len) i += 2; // skip */
			continue;
		}

		// Dollar-quoted string: $$has (parens)$$ or $tag$...$tag$
		if (ch === '$') {
			let tagEnd = i + 1;
			while (tagEnd < len && /[a-zA-Z0-9_]/.test(stripped[tagEnd]!)) tagEnd++;
			if (tagEnd < len && stripped[tagEnd] === '$') {
				const tag = stripped.substring(i, tagEnd + 1);
				i = tagEnd + 1;
				const closeIdx = stripped.indexOf(tag, i);
				if (closeIdx !== -1) {
					i = closeIdx + tag.length;
				} else {
					i = len; // unterminated — skip to end
				}
				continue;
			}
			// Not a dollar-quote tag, fall through
		}

		// ── Track parenthesis depth ─────────────────────────────────
		if (ch === '(') {
			depth++;
			i++;
			continue;
		}
		if (ch === ')') {
			depth--;
			i++;
			continue;
		}

		// Only inspect keywords at top level (depth === 0)
		if (depth === 0) {
			// Skip whitespace at top level
			if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
				i++;
				continue;
			}

			// Skip commas between CTEs: WITH a AS (...), b AS (...)
			if (ch === ',') {
				i++;
				continue;
			}

			// Check for DML keywords at this position.
			// We look for INSERT, UPDATE, DELETE, or SELECT — the first one
			// we find at top level determines whether this is a mutation.
			const rest = stripped.substring(i);
			const dmlMatch = /^(INSERT|UPDATE|DELETE|SELECT)\b/i.exec(rest);
			if (dmlMatch) {
				return dmlMatch[1]!.toUpperCase() !== 'SELECT';
			}

			// Skip over any other word (e.g., CTE names, AS keyword, RECURSIVE)
			// by advancing past alphanumeric/underscore characters
			if (/\w/.test(ch)) {
				while (i < len && /\w/.test(stripped[i]!)) {
					i++;
				}
				continue;
			}
		}

		i++;
	}

	return false;
}
