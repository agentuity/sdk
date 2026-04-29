/**
 * Re-export Better Auth's tables so drizzle-kit picks them up
 *
 * To add your own tables, declare them below. They share the same Postgres
 * database and Drizzle client as Better Auth's tables. Reference `user.id`
 * for per-user rows. See AGENTS.md for an example
 */
export * from '@agentuity/auth/schema';
