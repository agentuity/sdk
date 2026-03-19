# Agent Guidelines for @agentuity/queue

## Package Overview

Standalone package for the Agentuity Queue service. Provides a simple, ergonomic client for publishing messages to queues.

## Commands

- **Build**: `bun run build`
- **Typecheck**: `bun run typecheck`
- **Clean**: `rm -rf dist`

## Architecture

- **Runtime**: Node.js and Bun compatible
- **Exports**: QueueClient and all types from @agentuity/core/queue
- **Dependencies**: @agentuity/core, zod

## Usage

```typescript
import { QueueClient } from '@agentuity/queue';

const client = new QueueClient();

// Create a queue
await client.createQueue('my-queue');

// Publish a message
const result = await client.publish('my-queue', { task: 'process' });
console.log(`Message ${result.id} published at offset ${result.offset}`);
```

## Publishing

1. Run `bun run build`
2. Must publish **after** @agentuity/core