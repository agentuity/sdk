# Drizzle Integration with Agentuity Auth

This guide covers advanced Drizzle ORM integration patterns with Agentuity Auth.

## Overview

Agentuity Auth uses [Drizzle ORM](https://orm.drizzle.team/) for type-safe database operations. The auth schema is exported from `@agentuity/auth/schema` for easy integration with your application's schema.

## Quick Start

The simplest path is to use a connection string:

```typescript
import { createAgentuityAuth } from '@agentuity/auth';

export const auth = createAgentuityAuth({
  connectionString: process.env.DATABASE_URL,
});
```

This creates the pg pool and Drizzle instance internally. For more control, read on.

## Shared Database Instance

To share a single Drizzle instance between auth and your app:

### 1. Define Your App Schema

```typescript
// src/db/schema.ts
import { pgTable, text, timestamp, integer } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import * as authSchema from '@agentuity/auth/schema';

// Your app tables
export const project = pgTable('project', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ownerId: text('owner_id').references(() => authSchema.user.id),
  organizationId: text('organization_id').references(() => authSchema.organization.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const task = pgTable('task', {
  id: text('id').primaryKey(),
  projectId: text('project_id').references(() => project.id),
  title: text('title').notNull(),
  status: text('status').notNull().default('todo'),
  assigneeId: text('assignee_id').references(() => authSchema.user.id),
});

// Relations
export const projectRelations = relations(project, ({ one, many }) => ({
  owner: one(authSchema.user, {
    fields: [project.ownerId],
    references: [authSchema.user.id],
  }),
  organization: one(authSchema.organization, {
    fields: [project.organizationId],
    references: [authSchema.organization.id],
  }),
  tasks: many(task),
}));

export const taskRelations = relations(task, ({ one }) => ({
  project: one(project, {
    fields: [task.projectId],
    references: [project.id],
  }),
  assignee: one(authSchema.user, {
    fields: [task.assigneeId],
    references: [authSchema.user.id],
  }),
}));

// Combined schema export
export const schema = {
  ...authSchema,
  project,
  task,
  projectRelations,
  taskRelations,
};

// Re-export auth schema for convenience
export * from '@agentuity/auth/schema';
```

### 2. Create Shared Database

```typescript
// src/db/index.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { schema } from './schema';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });
export { schema };
```

### 3. Configure Auth with Shared Database

```typescript
// src/auth.ts
import { createAgentuityAuth, createSessionMiddleware, mountAgentuityAuthRoutes } from '@agentuity/auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db, schema } from './db';
import * as authSchema from '@agentuity/auth/schema';

export const auth = createAgentuityAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: authSchema, // Use just auth tables for adapter
  }),
});

export const authMiddleware = createSessionMiddleware(auth);
```

### 4. Use in Routes

```typescript
// src/api/index.ts
import { createRouter } from '@agentuity/runtime';
import { auth, authMiddleware } from '../auth';
import { db, schema } from '../db';
import { eq, and } from 'drizzle-orm';

const api = createRouter();

api.use('/api/*', authMiddleware);

// Create a project for the current user's org
api.post('/api/projects', async (c) => {
  const user = await c.var.auth.getUser();
  const org = await c.var.auth.getOrg();
  
  const { name } = await c.req.json();
  
  const [project] = await db.insert(schema.project).values({
    id: crypto.randomUUID(),
    name,
    ownerId: user.id,
    organizationId: org?.id,
  }).returning();
  
  return c.json(project);
});

// Get projects for current org
api.get('/api/projects', async (c) => {
  const org = await c.var.auth.getOrg();
  
  if (!org) {
    return c.json({ error: 'No active organization' }, 400);
  }
  
  const projects = await db.query.project.findMany({
    where: eq(schema.project.organizationId, org.id),
    with: {
      owner: true,
      tasks: true,
    },
  });
  
  return c.json(projects);
});
```

## Auth Schema Tables

The auth schema exports these tables:

| Table | Description |
|-------|-------------|
| `user` | User accounts with email, name, image |
| `session` | Active sessions with tokens and expiry |
| `account` | OAuth/credential accounts linked to users |
| `verification` | Email verification tokens |
| `organization` | Organizations for multi-tenancy |
| `member` | Organization memberships with roles |
| `invitation` | Pending organization invitations |
| `jwks` | JWT signing keys |
| `apikey` | API keys with permissions |

## Querying Auth Tables

You can query auth tables directly using your shared db instance:

```typescript
import { db, schema } from './db';
import { eq } from 'drizzle-orm';

// Get user with their organizations
const userWithOrgs = await db.query.user.findFirst({
  where: eq(schema.user.id, userId),
  with: {
    members: {
      with: {
        organization: true,
      },
    },
  },
});

// Get organization members
const members = await db.query.member.findMany({
  where: eq(schema.member.organizationId, orgId),
  with: {
    user: true,
  },
});

// Get user's API keys
const apiKeys = await db.query.apikey.findMany({
  where: eq(schema.apikey.userId, userId),
  columns: {
    id: true,
    name: true,
    start: true,
    createdAt: true,
    expiresAt: true,
    // Never select 'key' - it's hashed
  },
});
```

## Migrations

### Using CLI

The recommended approach is to use the Agentuity CLI:

```bash
# Run auth migrations
agentuity project auth setup

# Generate Drizzle migration files
agentuity project auth generate
```

### Using Drizzle Kit

For full control, use drizzle-kit directly:

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

```bash
# Generate migrations
bunx drizzle-kit generate

# Apply migrations
bunx drizzle-kit migrate

# Push schema (dev only)
bunx drizzle-kit push
```

## Extending User Schema

To add custom fields to users:

```typescript
// src/db/schema.ts
import { pgTable, text, jsonb } from 'drizzle-orm/pg-core';
import * as authSchema from '@agentuity/auth/schema';

// Extend with a separate profile table
export const userProfile = pgTable('user_profile', {
  userId: text('user_id')
    .primaryKey()
    .references(() => authSchema.user.id, { onDelete: 'cascade' }),
  bio: text('bio'),
  preferences: jsonb('preferences'),
  avatarUrl: text('avatar_url'),
});

export const userProfileRelations = relations(userProfile, ({ one }) => ({
  user: one(authSchema.user, {
    fields: [userProfile.userId],
    references: [authSchema.user.id],
  }),
}));
```

## Performance Optimization

### Enable Joins

Agentuity Auth enables experimental joins by default for better query performance:

```typescript
export const auth = createAgentuityAuth({
  connectionString: process.env.DATABASE_URL,
  experimental: {
    joins: true, // Default
  },
});
```

### Connection Pooling

For production, configure connection pool settings:

```typescript
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

### Prepared Statements

Drizzle uses prepared statements by default for better performance. For frequently-used queries:

```typescript
import { db, schema } from './db';
import { eq } from 'drizzle-orm';

// Create a prepared query
const getUserById = db.query.user.findFirst({
  where: eq(schema.user.id, sql.placeholder('id')),
}).prepare('getUserById');

// Execute
const user = await getUserById.execute({ id: userId });
```

## Type Safety

The schema provides full type inference:

```typescript
import { schema } from './db';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';

// Inferred types
type User = InferSelectModel<typeof schema.user>;
type NewUser = InferInsertModel<typeof schema.user>;
type Project = InferSelectModel<typeof schema.project>;

// Use in functions
async function createProject(data: Omit<InferInsertModel<typeof schema.project>, 'id' | 'createdAt'>) {
  const [project] = await db.insert(schema.project).values({
    id: crypto.randomUUID(),
    ...data,
  }).returning();
  return project;
}
```

## Testing

For tests, use a separate database or transactions:

```typescript
import { beforeEach, afterEach, describe, it, expect } from 'bun:test';
import { db } from './db';

describe('projects', () => {
  beforeEach(async () => {
    // Start transaction
    await db.execute('BEGIN');
  });

  afterEach(async () => {
    // Rollback
    await db.execute('ROLLBACK');
  });

  it('creates a project', async () => {
    // Test code here
  });
});
```

Or use an in-memory SQLite database for faster tests (requires adjusting schema for SQLite compatibility).
