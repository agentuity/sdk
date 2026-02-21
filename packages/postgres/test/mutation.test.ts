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

	describe('additional mutation types', () => {
		it('detects COPY FROM', () =>
			expect(isMutationStatement("COPY items FROM '/tmp/data.csv' CSV")).toBe(true));
		it('detects COPY TO', () =>
			expect(isMutationStatement("COPY items TO '/tmp/data.csv' CSV")).toBe(true));
		it('detects TRUNCATE TABLE', () =>
			expect(isMutationStatement('TRUNCATE TABLE items')).toBe(true));
		it('detects TRUNCATE without TABLE keyword', () =>
			expect(isMutationStatement('TRUNCATE items')).toBe(true));
		it('detects MERGE INTO', () =>
			expect(
				isMutationStatement(
					'MERGE INTO items USING source ON items.id = source.id WHEN MATCHED THEN UPDATE SET name = source.name'
				)
			).toBe(true));
		it('detects CALL procedure', () =>
			expect(isMutationStatement("CALL create_user('alice')")).toBe(true));
		it('detects DO block', () =>
			expect(isMutationStatement("DO $$ BEGIN RAISE NOTICE 'hello'; END $$")).toBe(true));
		it('detects DO with dollar-quote tag', () =>
			expect(isMutationStatement("DO $body$ BEGIN RAISE NOTICE 'hello'; END $body$")).toBe(
				true
			));

		// Case-insensitive variants
		it('detects lowercase copy', () =>
			expect(isMutationStatement("copy items from '/tmp/data.csv'")).toBe(true));
		it('detects lowercase truncate', () =>
			expect(isMutationStatement('truncate items')).toBe(true));

		// With leading comments
		it('detects COPY with leading comment', () =>
			expect(isMutationStatement("/* load */ COPY items FROM '/tmp/data.csv'")).toBe(true));
		it('detects TRUNCATE with leading comment', () =>
			expect(isMutationStatement('-- reset\nTRUNCATE items')).toBe(true));
	});

	describe('EXPLAIN exclusion', () => {
		it('rejects EXPLAIN SELECT', () =>
			expect(isMutationStatement('EXPLAIN SELECT * FROM items')).toBe(false));
		it('rejects EXPLAIN INSERT', () =>
			expect(isMutationStatement('EXPLAIN INSERT INTO items VALUES (1)')).toBe(false));
		it('rejects EXPLAIN UPDATE', () =>
			expect(isMutationStatement('EXPLAIN UPDATE items SET name = $1')).toBe(false));
		it('rejects EXPLAIN DELETE', () =>
			expect(isMutationStatement('EXPLAIN DELETE FROM items WHERE id = $1')).toBe(false));
		it('rejects EXPLAIN ANALYZE INSERT', () =>
			expect(isMutationStatement('EXPLAIN ANALYZE INSERT INTO items VALUES (1)')).toBe(false));
		it('rejects EXPLAIN (ANALYZE, BUFFERS) INSERT', () =>
			expect(
				isMutationStatement('EXPLAIN (ANALYZE, BUFFERS) INSERT INTO items VALUES (1)')
			).toBe(false));
		it('rejects EXPLAIN with leading comment', () =>
			expect(isMutationStatement('/* plan */ EXPLAIN INSERT INTO items VALUES (1)')).toBe(
				false
			));
	});

	describe('multi-statement queries', () => {
		it('detects mutation in second statement', () =>
			expect(isMutationStatement('SELECT 1; INSERT INTO items VALUES (1)')).toBe(true));
		it('detects mutation in third statement', () =>
			expect(isMutationStatement('SELECT 1; SELECT 2; DELETE FROM items WHERE id = 1')).toBe(
				true
			));
		it('detects mutation as first of multi-statement', () =>
			expect(isMutationStatement('INSERT INTO items VALUES (1); SELECT 1')).toBe(true));
		it('rejects multi-statement with only SELECTs', () =>
			expect(isMutationStatement('SELECT 1; SELECT 2')).toBe(false));
		it('ignores semicolons inside single-quoted strings', () =>
			expect(isMutationStatement("SELECT ';'")).toBe(false));
		it('ignores semicolons inside double-quoted identifiers', () =>
			expect(isMutationStatement('SELECT "col;" FROM items')).toBe(false));
		it('ignores semicolons inside dollar-quoted strings', () =>
			expect(isMutationStatement('SELECT $$;$$')).toBe(false));
		it('ignores semicolons inside block comments', () =>
			expect(isMutationStatement('SELECT /* ; */ 1')).toBe(false));
		it('ignores semicolons inside line comments', () =>
			expect(isMutationStatement('SELECT 1 -- ;\n')).toBe(false));
	});

	describe('nested block comments', () => {
		it('handles simple nested comment', () =>
			expect(isMutationStatement('/* /* inner */ outer */ INSERT INTO items VALUES (1)')).toBe(
				true
			));
		it('handles deeply nested comments', () =>
			expect(isMutationStatement('/* /* /* deep */ */ */ INSERT INTO items VALUES (1)')).toBe(
				true
			));
		it('handles nested comment with parens in CTE', () =>
			expect(
				isMutationStatement('WITH cte AS (SELECT /* /* ) */ */ 1) INSERT INTO items VALUES (1)')
			).toBe(true));
		it('handles nested comment before mutation keyword', () =>
			expect(isMutationStatement('/* outer /* inner */ still outer */ DELETE FROM items')).toBe(
				true
			));
	});

	describe('DDL commands', () => {
		it('rejects CREATE TABLE', () =>
			expect(isMutationStatement('CREATE TABLE items (id INT)')).toBe(false));
		it('rejects DROP TABLE', () => expect(isMutationStatement('DROP TABLE items')).toBe(false));
		it('rejects ALTER TABLE', () =>
			expect(isMutationStatement('ALTER TABLE items ADD COLUMN name TEXT')).toBe(false));
		it('rejects CREATE INDEX', () =>
			expect(isMutationStatement('CREATE INDEX idx ON items (name)')).toBe(false));
	});

	describe('CTE with new mutation types', () => {
		it('detects CTE with COPY', () =>
			expect(isMutationStatement("WITH cte AS (SELECT 1) COPY items FROM '/tmp/data.csv'")).toBe(
				true
			));
		it('detects CTE with TRUNCATE', () =>
			expect(isMutationStatement('WITH cte AS (SELECT 1) TRUNCATE items')).toBe(true));
		it('detects CTE with MERGE', () =>
			expect(
				isMutationStatement(
					'WITH cte AS (SELECT 1) MERGE INTO items USING source ON items.id = source.id WHEN MATCHED THEN UPDATE SET name = source.name'
				)
			).toBe(true));
	});

	describe('edge cases', () => {
		it('handles empty query', () => expect(isMutationStatement('')).toBe(false));
		it('handles whitespace-only query', () =>
			expect(isMutationStatement('   \n\t  ')).toBe(false));
		it('handles comment-only query', () =>
			expect(isMutationStatement('/* just a comment */')).toBe(false));
		it('rejects keyword-prefix identifiers like DELETE_FLAG', () =>
			expect(isMutationStatement('SELECT DELETE_FLAG FROM items')).toBe(false));
		it('rejects INSERT_LOG as table name', () =>
			expect(isMutationStatement('SELECT * FROM INSERT_LOG')).toBe(false));
		it('handles very long query', () => {
			const longSelect =
				'SELECT ' +
				Array.from({ length: 1000 }, (_, i) => `col${i}`).join(', ') +
				' FROM items';
			expect(isMutationStatement(longSelect)).toBe(false);
		});
	});
});
