import { describe, it, expect } from 'bun:test';
import { isMutationStatement } from '../src/mutation';

describe('isMutationStatement', () => {
	// Direct mutations
	it('detects INSERT', () =>
		expect(isMutationStatement('INSERT INTO items VALUES (1)')).toBe(true));
	it('detects UPDATE', () => expect(isMutationStatement('UPDATE items SET name = $1')).toBe(true));
	it('detects DELETE', () =>
		expect(isMutationStatement('DELETE FROM items WHERE id = $1')).toBe(true));
	it('detects case-insensitive', () =>
		expect(isMutationStatement('insert into items values (1)')).toBe(true));

	// Non-mutations
	it('rejects SELECT', () => expect(isMutationStatement('SELECT * FROM items')).toBe(false));
	it('rejects empty', () => expect(isMutationStatement('')).toBe(false));

	// Leading comments/whitespace
	it('detects INSERT with leading whitespace', () =>
		expect(isMutationStatement('  INSERT INTO items VALUES (1)')).toBe(true));
	it('detects INSERT with block comment', () =>
		expect(isMutationStatement('/* comment */ INSERT INTO items VALUES (1)')).toBe(true));
	it('detects INSERT with line comment', () =>
		expect(isMutationStatement('-- comment\nINSERT INTO items VALUES (1)')).toBe(true));

	// Inline comment after keyword (word boundary fix)
	it('detects INSERT with inline comment', () =>
		expect(isMutationStatement('INSERT/*hint*/INTO items VALUES (1)')).toBe(true));

	// CTE mutations
	it('detects CTE INSERT', () =>
		expect(isMutationStatement('WITH cte AS (SELECT 1) INSERT INTO items VALUES (1)')).toBe(
			true
		));
	it('detects CTE UPDATE', () =>
		expect(isMutationStatement('WITH cte AS (SELECT 1) UPDATE items SET name = $1')).toBe(true));
	it('detects CTE DELETE', () =>
		expect(isMutationStatement('WITH cte AS (SELECT 1) DELETE FROM items WHERE id = $1')).toBe(
			true
		));
	it('rejects CTE SELECT', () =>
		expect(isMutationStatement('WITH cte AS (SELECT 1) SELECT * FROM cte')).toBe(false));

	// CTE with nested parens
	it('detects CTE with nested subquery', () =>
		expect(
			isMutationStatement(
				'WITH cte AS (SELECT id FROM (SELECT id FROM items WHERE id IN (1, 2))) INSERT INTO archive (id) SELECT id FROM cte'
			)
		).toBe(true));
	it('detects CTE with multiple CTEs', () =>
		expect(
			isMutationStatement(
				'WITH a AS (SELECT 1), b AS (SELECT 2) INSERT INTO items (id) VALUES (1)'
			)
		).toBe(true));

	// CTE with parens in strings/comments (regression tests)
	it('handles closing paren in string', () =>
		expect(
			isMutationStatement("WITH cte AS (SELECT ')' AS x) INSERT INTO items VALUES (1)")
		).toBe(true));
	it('handles opening paren in string', () =>
		expect(
			isMutationStatement("WITH cte AS (SELECT '(' AS x) INSERT INTO items VALUES (1)")
		).toBe(true));
	it('handles escaped quotes with parens', () =>
		expect(
			isMutationStatement("WITH cte AS (SELECT 'it''s ()' AS x) INSERT INTO items VALUES (1)")
		).toBe(true));
	it('handles parens in double-quoted identifier', () =>
		expect(
			isMutationStatement('WITH cte AS (SELECT "col(1)" FROM t) INSERT INTO items VALUES (1)')
		).toBe(true));
	it('handles parens in block comment', () =>
		expect(
			isMutationStatement('WITH cte AS (SELECT /* ) */ 1) INSERT INTO items VALUES (1)')
		).toBe(true));
	it('handles parens in line comment', () =>
		expect(
			isMutationStatement('WITH cte AS (SELECT 1 -- )\nFROM t) INSERT INTO items VALUES (1)')
		).toBe(true));
	it('handles parens in dollar-quoted string', () =>
		expect(
			isMutationStatement('WITH cte AS (SELECT $$)$$ AS x) INSERT INTO items VALUES (1)')
		).toBe(true));
	it('handles parens in tagged dollar-quoted string', () =>
		expect(
			isMutationStatement('WITH cte AS (SELECT $fn$)($fn$ AS x) INSERT INTO items VALUES (1)')
		).toBe(true));
	it('string parens with SELECT still non-mutation', () =>
		expect(isMutationStatement("WITH cte AS (SELECT '(' AS x) SELECT * FROM cte")).toBe(false));
});
