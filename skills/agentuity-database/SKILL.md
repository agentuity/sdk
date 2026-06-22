---
name: agentuity-database
description: >-
  Use when adding relational data to an Agentuity app. Covers creating or linking
  managed Postgres, DATABASE_URL, pg, Drizzle ORM, pooling, transactions,
  migrations, safe parameter binding, and the narrow admin-script role for
  DBClient.
license: Apache-2.0
metadata:
  author: agentuity
  version: "1.0.0"
---

# Agentuity Database

Use database resources when your app needs SQL, joins, constraints,
transactions, or relational user data. Agentuity-managed databases are Postgres
databases. App code should connect through `DATABASE_URL` with the Postgres
client or ORM your app owns.

## Create or Link a Database

Create a database and link it to the current project:

```bash
agentuity cloud db create --name app_data
agentuity project add database app_data
```

Linking writes `DATABASE_URL` to `.env`. Recover the URL later with credentials shown only in a trusted shell:

```bash
agentuity cloud db get app_data --show-credentials
```

Use the `agentuity-cloud` skill for database CLI management and logs.

## Choose a Client

| Need | Use |
|---|---|
| Direct SQL with parameter binding | `pg` |
| Schema-first TypeScript queries | `drizzle-orm/node-postgres` with `pg` |
| Existing Prisma, Kysely, or another Postgres client | Keep it and point it at `DATABASE_URL` |
| Trusted admin script by Agentuity database resource name | `DBClient` from `@agentuity/db` |

`DBClient` is not the app query layer. It calls the Agentuity database service
API by resource name and organization ID, which is useful for trusted scripts,
introspection, or query logs.

## Use `pg`

```bash
npm install pg
npm install -D @types/pg
```

```typescript
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

export const pool = new Pool({
  connectionString: databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
});

export async function findUserByEmail(email: string): Promise<{
  readonly id: string;
  readonly email: string;
} | null> {
  const { rows } = await pool.query<{
    readonly id: string;
    readonly email: string;
  }>('SELECT id, email FROM users WHERE email = $1 LIMIT 1', [email]);

  return rows[0] ?? null;
}
```

Use placeholders such as `$1` for every request value, form value, queue payload,
or model output. Do not concatenate untrusted values into SQL strings.

## Use Drizzle

```bash
npm install drizzle-orm pg
npm install -D drizzle-kit @types/pg
```

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { boolean, pgTable, serial, text } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  active: boolean('active').notNull().default(true),
});

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

export const db = drizzle(new Pool({ connectionString: databaseUrl }), {
  schema: { users },
});
```

Route usage:

```typescript
import { eq } from 'drizzle-orm';
import { db, users } from '@/src/db/client';

export async function GET(): Promise<Response> {
  const activeUsers = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.active, true))
    .limit(20);

  return Response.json({ users: activeUsers });
}
```

## Migrations

Use `drizzle-kit` when the app uses Drizzle:

```typescript
import { defineConfig } from 'drizzle-kit';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for Drizzle migrations');
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
});
```

```bash
bunx drizzle-kit generate
bunx drizzle-kit migrate
```

Use migration files for repeatable deploy-time schema changes. Use
`bunx drizzle-kit push` only for quick development loops.

## Transactions

Use one transaction boundary for one write workflow:

```typescript
const client = await pool.connect();

try {
  await client.query('BEGIN');
  await client.query('UPDATE accounts SET balance = balance - $1 WHERE name = $2', [100, 'Alice']);
  await client.query('UPDATE accounts SET balance = balance + $1 WHERE name = $2', [100, 'Bob']);
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}
```

Use your ORM's transaction helper when the app already uses an ORM.

## DBClient for Trusted Scripts

```bash
npm install @agentuity/db
```

```typescript
import { DBClient } from '@agentuity/db';

const database = process.env.AGENTUITY_DB_DATABASE;
const orgId = process.env.AGENTUITY_CLOUD_ORG_ID;

if (!database || !orgId) {
  throw new Error('AGENTUITY_DB_DATABASE and AGENTUITY_CLOUD_ORG_ID are required');
}

const db = new DBClient({ database, orgId });

const result = await db.query('SELECT 1 AS ok');
const tables = await db.tables();
const logs = await db.logs({ limit: 50 });
```

Use `DBClient` only for trusted SQL such as introspection or administrative
checks. It does not replace a parameterized app query client.

## Common Mistakes

| Mistake | Better approach |
|---|---|
| Creating a new pool inside every request | Create one pool at module scope |
| Using KV for relational queries | Use Postgres for joins, constraints, and transactions |
| Concatenating request values into SQL | Use placeholders or ORM query builders |
| Treating `DBClient` as the app ORM | Use `pg`, Drizzle, Prisma, Kysely, or your existing client |
| Forgetting to link the database | Run `agentuity project add database <name>` so `DATABASE_URL` is written |

## Useful Docs

- Database overview: https://agentuity.dev/services/database
- Postgres clients: https://agentuity.dev/services/database/postgres
- Drizzle ORM: https://agentuity.dev/services/database/drizzle
- Database API reference: https://agentuity.dev/reference/api/database
