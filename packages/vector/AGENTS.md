# Agent Guidelines for @agentuity/vector

## Package Overview

Standalone package for the Agentuity Vector storage service. Provides a simple, ergonomic client for storing and searching vector embeddings.

## Commands

- **Build**: `bun run build`
- **Typecheck**: `bun run typecheck`
- **Clean**: `rm -rf dist`

## Architecture

- **Runtime**: Node.js and Bun compatible
- **Exports**: VectorClient and all types from @agentuity/core/vector
- **Dependencies**: @agentuity/core, zod

## Usage

```typescript
import { VectorClient } from '@agentuity/vector';

const client = new VectorClient();

// Upsert vectors with automatic embedding
await client.upsert('products', {
  key: 'chair-001',
  document: 'Comfortable office chair with lumbar support',
  metadata: { category: 'furniture' }
});

// Search for similar vectors
const results = await client.search('products', {
  query: 'office seating',
  limit: 5
});
```

## Publishing

1. Run `bun run build`
2. Must publish **after** @agentuity/core