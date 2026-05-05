import { pgTable, serial, text, integer, timestamp } from 'drizzle-orm/pg-core';

/**
 * Translations table.
 *
 * Each row is one (source text, target language) pair we've translated.
 * The translate helper checks this table on cache lookup and inserts a
 * row after each fresh translation.
 */
export const translations = pgTable('translations', {
	id: serial('id').primaryKey(),
	sourceText: text('source_text').notNull(),
	language: text('language').notNull(),
	translation: text('translation').notNull(),
	model: text('model'),
	tokens: integer('tokens'),
	createdAt: timestamp('created_at').defaultNow(),
});

export type Translation = typeof translations.$inferSelect;
