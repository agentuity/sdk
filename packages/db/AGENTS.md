# Agent Guidelines for @agentuity/db

## Package Overview

Standalone package for the Agentuity Database service. Provides a simple, ergonomic client for querying databases and viewing query logs.

## Commands

- **Build**: `bun run build`
- **Typecheck**: `bun run typecheck`
- **Clean**: `rm -rf dist`

## Architecture

- **Runtime**: Node.js and Bun compatible
- **Exports**: DBClient and all types from @agentuity/core/db
- **Dependencies**: @agentuity/core, @agentuity/server, zod

## Usage

```typescript
import { DBClient } from '@agentuity/db';

const client = new DBClient();

// Query the database
const result = await client.query('SELECT * FROM users LIMIT 10');
console.log(result.rows);

// Get table schemas
const tables = await client.tables();
```

## Publishing

1. Run `bun run build`
2. Must publish **after** @agentuity/core