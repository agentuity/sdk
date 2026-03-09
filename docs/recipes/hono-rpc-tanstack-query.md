# Hono RPC with TanStack Query

This guide shows how to get end-to-end type safety between your Agentuity API routes and React frontend using [Hono RPC](https://hono.dev/docs/guides/rpc) and [TanStack Query](https://tanstack.com/query).

## Overview

Hono RPC lets you infer client types directly from your route definitions — no codegen, no schemas to maintain. Combined with TanStack Query, you get:

- **Type-safe API calls** — request params, body, and response types are inferred from route handlers
- **Automatic caching and revalidation** — TanStack Query manages server state
- **Zero duplication** — the route definition is the single source of truth

## Installation

```bash
bun add @tanstack/react-query hono
```

> `hono` is already a dependency of `@agentuity/runtime`, but you need it in your app for the `hc` client import.

## Server: Define Typed Routes

Use method chaining on `createRouter()` so TypeScript can infer the full route tree:

```typescript
// src/api/users.ts
import { createRouter } from '@agentuity/runtime';

const router = createRouter()
   .get('/users', async (c) => {
      // In a real app, query your database here
      const users = [
         { id: '1', name: 'Alice', email: 'alice@example.com' },
         { id: '2', name: 'Bob', email: 'bob@example.com' },
      ];
      return c.json({ users });
   })
   .get('/users/:id', async (c) => {
      const id = c.req.param('id');
      return c.json({ id, name: 'Alice', email: 'alice@example.com' });
   })
   .post(
      '/users',
      async (c) => {
         const body = await c.req.json<{ name: string; email: string }>();
         const user = { id: crypto.randomUUID(), ...body };
         return c.json({ user }, 201);
      }
   )
   .delete('/users/:id', async (c) => {
      const id = c.req.param('id');
      return c.json({ deleted: id });
   });

// Export the type — this is what the client imports
export type UsersRoute = typeof router;
export default router;
```

> **Important:** Chain `.get()`, `.post()`, etc. directly on `createRouter()`. If you use separate `router.get(...)` statements, TypeScript can't infer the combined type.

## Safely Exporting Types to the Client

⚠️ **Never import server route files directly from client code.** Even `import type` can cause bundlers to trace the module graph and pull server-only code (database clients, secrets, etc.) into the client bundle.

Use a dedicated types file that re-exports only the types:

```typescript
// src/shared/api-types.ts
// This file contains ONLY type re-exports — no runtime code
export type { UsersRoute } from '../api/users';
export type { PostsRoute } from '../api/posts';
```

Then import from this file on the client:

```typescript
// src/web/api.ts
import { hc } from 'hono/client';
import type { UsersRoute } from '../shared/api-types';

export const client = hc<UsersRoute>('/api');
```

This works because:

1. `src/shared/api-types.ts` uses only `export type { ... }` — TypeScript erases these completely at compile time
2. Vite's client build sees an empty module after type erasure and tree-shakes it away
3. Your server code (database queries, secrets, env vars) never enters the client bundle

> **Why not import directly?** A file like `src/api/users.ts` may import `@agentuity/runtime`, database clients, or read `process.env` at the top level. Even with `import type`, some bundlers evaluate the module to resolve its exports, which can leak server dependencies into the client build or cause build errors.

## Client: Use with TanStack Query

### Setup the Query Provider

```tsx
// src/web/frontend.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';

const queryClient = new QueryClient({
   defaultOptions: {
      queries: {
         staleTime: 30_000, // 30 seconds
      },
   },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
   <React.StrictMode>
      <QueryClientProvider client={queryClient}>
         <App />
      </QueryClientProvider>
   </React.StrictMode>
);
```

### Query Hooks

```typescript
// src/web/hooks/useUsers.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { client } from '../api';

// Fetch all users
export function useUsers() {
   return useQuery({
      queryKey: ['users'],
      queryFn: async () => {
         const res = await client.users.$get();
         if (!res.ok) throw new Error('Failed to fetch users');
         return res.json();
         //     ^? { users: { id: string; name: string; email: string }[] }
      },
   });
}

// Fetch a single user by ID
export function useUser(id: string) {
   return useQuery({
      queryKey: ['users', id],
      queryFn: async () => {
         const res = await client.users[':id'].$get({ param: { id } });
         if (!res.ok) throw new Error('Failed to fetch user');
         return res.json();
         //     ^? { id: string; name: string; email: string }
      },
      enabled: !!id,
   });
}

// Create a new user
export function useCreateUser() {
   const queryClient = useQueryClient();

   return useMutation({
      mutationFn: async (data: { name: string; email: string }) => {
         const res = await client.users.$post({ json: data });
         if (!res.ok) throw new Error('Failed to create user');
         return res.json();
      },
      onSuccess: () => {
         // Invalidate the users list so it refetches
         queryClient.invalidateQueries({ queryKey: ['users'] });
      },
   });
}

// Delete a user
export function useDeleteUser() {
   const queryClient = useQueryClient();

   return useMutation({
      mutationFn: async (id: string) => {
         const res = await client.users[':id'].$delete({ param: { id } });
         if (!res.ok) throw new Error('Failed to delete user');
         return res.json();
      },
      onSuccess: () => {
         queryClient.invalidateQueries({ queryKey: ['users'] });
      },
   });
}
```

### Use in Components

```tsx
// src/web/components/UserList.tsx
import { useUsers, useCreateUser, useDeleteUser } from '../hooks/useUsers';
import { useState } from 'react';

export function UserList() {
   const { data, isLoading, error } = useUsers();
   const createUser = useCreateUser();
   const deleteUser = useDeleteUser();
   const [name, setName] = useState('');
   const [email, setEmail] = useState('');

   if (isLoading) return <div>Loading...</div>;
   if (error) return <div>Error: {error.message}</div>;

   return (
      <div>
         <form
            onSubmit={(e) => {
               e.preventDefault();
               createUser.mutate({ name, email });
               setName('');
               setEmail('');
            }}
         >
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
            <button type="submit" disabled={createUser.isPending}>
               {createUser.isPending ? 'Adding...' : 'Add User'}
            </button>
         </form>

         <ul>
            {data?.users.map((user) => (
               <li key={user.id}>
                  {user.name} ({user.email})
                  <button
                     onClick={() => deleteUser.mutate(user.id)}
                     disabled={deleteUser.isPending}
                  >
                     Delete
                  </button>
               </li>
            ))}
         </ul>
      </div>
   );
}
```

## Multiple Route Files

When you have multiple route files, export all types from a shared file:

```typescript
// src/api/posts.ts
import { createRouter } from '@agentuity/runtime';

const router = createRouter()
   .get('/posts', async (c) => {
      return c.json({ posts: [] });
   })
   .get('/posts/:id', async (c) => {
      return c.json({ id: c.req.param('id'), title: '', body: '' });
   });

export type PostsRoute = typeof router;
export default router;
```

```typescript
// src/shared/api-types.ts
export type { UsersRoute } from '../api/users';
export type { PostsRoute } from '../api/posts';
```

```typescript
// src/web/api.ts
import { hc } from 'hono/client';
import type { UsersRoute, PostsRoute } from '../shared/api-types';

export const usersClient = hc<UsersRoute>('/api');
export const postsClient = hc<PostsRoute>('/api');
```

Or with the explicit routing API, compose them into a single typed router and export one type:

```typescript
// src/api/index.ts
import { createRouter } from '@agentuity/runtime';
import users from './users';
import posts from './posts';

const router = createRouter()
   .route('/users', users)
   .route('/posts', posts);

export type AppRoute = typeof router;
export default router;
```

```typescript
// src/shared/api-types.ts
export type { AppRoute } from '../api/index';
```

```typescript
// src/web/api.ts
import { hc } from 'hono/client';
import type { AppRoute } from '../shared/api-types';

// Single client for all routes
export const client = hc<AppRoute>('/api');

// client.users.$get()  — typed
// client.posts.$get()  — typed
```

## With Explicit Routing

If you're using `createApp({ router })`, export the type from the shared types file:

```typescript
// src/api/index.ts
import { createRouter } from '@agentuity/runtime';
import users from './users';
import posts from './posts';

const router = createRouter()
   .route('/users', users)
   .route('/posts', posts);

export type AppRoute = typeof router;
export default router;
```

```typescript
// src/app.ts
import { createApp } from '@agentuity/runtime';
import router from './api/index';

export const app = await createApp({ router });
```

```typescript
// src/shared/api-types.ts
export type { AppRoute } from '../api/index';
```

```typescript
// src/web/api.ts
import { hc } from 'hono/client';
import type { AppRoute } from '../shared/api-types';

// Default mount is /api
export const client = hc<AppRoute>('/api');
```

For custom mount paths:

```typescript
// src/app.ts
export const app = await createApp({
   router: { path: '/v1', router: myRouter },
});
```

```typescript
// src/web/api.ts
export const client = hc<AppRoute>('/v1');
```

## Validated Input with Zod

For request validation, use [Hono's Zod validator](https://hono.dev/docs/guides/validation#with-zod) — the types flow through to the client automatically:

```bash
bun add zod @hono/zod-validator
```

```typescript
// src/api/users.ts
import { createRouter } from '@agentuity/runtime';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

const createUserSchema = z.object({
   name: z.string().min(1),
   email: z.string().email(),
});

const router = createRouter()
   .get('/users', async (c) => {
      return c.json({ users: [] });
   })
   .post('/users', zValidator('json', createUserSchema), async (c) => {
      const { name, email } = c.req.valid('json');
      //      ^? { name: string; email: string } — validated and typed
      const user = { id: crypto.randomUUID(), name, email };
      return c.json({ user }, 201);
   });

export type UsersRoute = typeof router;
export default router;
```

The client mutation is now type-safe against the Zod schema:

```typescript
// TypeScript error if you pass invalid data
createUser.mutate({ name: '', email: 'not-an-email' }); // runtime validation catches this
createUser.mutate({ wrong: 'field' }); // compile-time error
```

## Tips

- **Chain methods** on `createRouter()` — separate statements lose type inference
- **Never import server files from client code** — use `src/shared/api-types.ts` with `export type` to avoid leaking server code into the client bundle
- **Match mount paths** — the `hc()` base URL must match where the router is mounted
- **Error handling** — always check `res.ok` before calling `res.json()` in query functions
- **Key structure** — use hierarchical query keys (`['users']`, `['users', id]`) for granular invalidation
