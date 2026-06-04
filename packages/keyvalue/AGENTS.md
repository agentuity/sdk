# Agent Guidelines for @agentuity/keyvalue

## Package Overview

Standalone package for the Agentuity Key-Value storage service. Provides a simple, ergonomic client for storing and retrieving key-value data.

## Commands

- **Build**: `bun run build`
- **Typecheck**: `bun run typecheck`
- **Clean**: `rm -rf dist`

## Architecture

- **Runtime**: Node.js and Bun compatible
- **Exports**: KeyValueClient, KeyValueStorageService, and all KV types/schemas
- **Dependencies**: @agentuity/adapter, @agentuity/core (env/config/pagination only), zod
- **Note**: Implementation lives in this package (`src/service.ts`). `@agentuity/core/keyvalue` still re-exports a copy until Phase 5 shim removal.

## Usage

```typescript
import { KeyValueClient } from '@agentuity/keyvalue';

const client = new KeyValueClient();

// Set a value
await client.set('my-namespace', 'my-key', { foo: 'bar' });

// Get a value
const result = await client.get('my-namespace', 'my-key');
if (result.exists) {
  console.log(result.data);
}
```

## Publishing

1. Run `bun run build`
2. Must publish **after** @agentuity/core