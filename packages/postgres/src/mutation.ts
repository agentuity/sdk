/**
 * Strips leading whitespace and SQL comments (block and line) from a query string.
 * Returns the remaining query text starting at the first non-comment token.
 *
 * Note: This regex does NOT support nested block comments. Use
 * {@link stripLeadingComments} for full nested comment support.
 */
export const LEADING_COMMENTS_RE = /^(?:\s+|\/\*[\s\S]*?\*\/|--[^\n]*\n)*/;

/**
 * Strips leading whitespace and SQL comments from a query string.
 * Supports nested block comments.
 * Returns the remaining query text starting at the first non-comment token.
 */
function stripLeadingComments(query: string): string {
	let i = 0;
	const len = query.length;
	while (i < len) {
		const ch = query[i]!;
		// Skip whitespace
		if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
			i++;
			continue;
		}
		// Skip line comment: -- ...\n
		if (ch === '-' && i + 1 < len && query[i + 1] === '-') {
			i += 2;
			while (i < len && query[i] !== '\n') i++;
			if (i < len) i++; // skip newline
			continue;
		}
		// Skip block comment with nesting: /* ... /* ... */ ... */
		if (ch === '/' && i + 1 < len && query[i + 1] === '*') {
			let commentDepth = 1;
			i += 2;
			while (i < len && commentDepth > 0) {
				if (query[i] === '/' && i + 1 < len && query[i + 1] === '*') {
					commentDepth++;
					i += 2;
				} else if (query[i] === '*' && i + 1 < len && query[i + 1] === '/') {
					commentDepth--;
					i += 2;
				} else {
					i++;
				}
			}
			continue;
		}
		break;
	}
	return query.substring(i);
}

/** Regex matching the first keyword of a mutation statement. */
const MUTATION_KEYWORD_RE = /^(INSERT|UPDATE|DELETE|COPY|TRUNCATE|MERGE|CALL|DO)\b/i;

/**
 * Determines whether a SQL query is a mutation that requires transaction
 * wrapping for safe retry.
 *
 * Detected mutation types: INSERT, UPDATE, DELETE, COPY, TRUNCATE, MERGE,
 * CALL, DO. EXPLAIN queries are never wrapped (read-only analysis, even
 * when the explained statement is a mutation like `EXPLAIN INSERT INTO ...`).
 *
 * Mutation statements wrapped in a transaction can be safely retried because
 * PostgreSQL guarantees that uncommitted transactions are rolled back when
 * the connection drops. This prevents:
 * - Duplicate rows from retried INSERTs
 * - Double-applied changes from retried UPDATEs (e.g., counter increments)
 * - Repeated side effects from retried DELETEs (e.g., cascade triggers)
 *
 * Handles three patterns:
 * 1. Direct mutations: `INSERT INTO ...`, `UPDATE ... SET`, `DELETE FROM ...`,
 *    `COPY ...`, `TRUNCATE ...`, `MERGE ...`, `CALL ...`, `DO ...`
 *    (with optional leading comments/whitespace)
 * 2. CTE mutations: `WITH cte AS (...) INSERT|UPDATE|DELETE|... ...` — scans
 *    past the WITH clause by tracking parenthesis depth to skip CTE
 *    subexpressions, then checks if the first top-level DML keyword is a
 *    mutation. The scanner treats single-quoted strings, double-quoted
 *    identifiers, dollar-quoted strings, line comments (--), and block
 *    comments (including nested) as atomic regions so parentheses inside
 *    them do not corrupt depth tracking.
 * 3. Multi-statement queries: `SELECT 1; INSERT INTO items VALUES (1)` —
 *    scans past semicolons at depth 0 to find mutation keywords in
 *    subsequent statements.
 *
 * @see https://github.com/agentuity/sdk/issues/911
 */
export function isMutationStatement(query: string): boolean {
	// Strip leading whitespace and SQL comments (supports nested block comments)
	const stripped = stripLeadingComments(query);

	// EXPLAIN never mutates (even EXPLAIN INSERT INTO...)
	if (/^EXPLAIN\b/i.test(stripped)) return false;

	// Fast path: direct mutation statement
	if (MUTATION_KEYWORD_RE.test(stripped)) {
		return true;
	}

	// Fast path: no CTE prefix and no multi-statement separator → not a mutation
	if (!/^WITH\s/i.test(stripped) && !stripped.includes(';')) {
		return false;
	}

	// Full scan: walk the entire query character-by-character.
	// Track parenthesis depth and check for mutation keywords at depth 0.
	// This handles both CTE queries (WITH ... AS (...) DML ...) and
	// multi-statement queries (SELECT ...; INSERT ...).
	let depth = 0;
	let i = 0;
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

		// Block comment: /* has (parens) */ — supports nesting
		if (ch === '/' && i + 1 < len && stripped[i + 1] === '*') {
			let commentDepth = 1;
			i += 2;
			while (i < len && commentDepth > 0) {
				if (stripped[i] === '/' && i + 1 < len && stripped[i + 1] === '*') {
					commentDepth++;
					i += 2;
				} else if (stripped[i] === '*' && i + 1 < len && stripped[i + 1] === '/') {
					commentDepth--;
					i += 2;
				} else {
					i++;
				}
			}
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

			// Skip semicolons and commas between CTEs or statements
			if (ch === ';' || ch === ',') {
				i++;
				continue;
			}

			// Check for mutation keyword or skip other words
			// (CTE names, AS, RECURSIVE, SELECT, WITH, etc.)
			if (/\w/.test(ch)) {
				const rest = stripped.substring(i);
				if (MUTATION_KEYWORD_RE.test(rest)) {
					return true;
				}
				// Skip past this word
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
