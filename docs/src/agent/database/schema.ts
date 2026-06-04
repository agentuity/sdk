import { pgTable, real, serial, text } from 'drizzle-orm/pg-core';

export const products = pgTable('products', {
	id: serial('id').primaryKey(),
	sku: text('sku').notNull().unique(),
	name: text('name').notNull(),
	price: real('price').notNull(),
	avg_rating: real('avg_rating').notNull(),
	description: text('description').notNull(),
	customer_feedback: text('customer_feedback').notNull(),
});
