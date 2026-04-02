# Agent Guidelines for @agentuity/sandbox

## Package Overview

Standalone package for the Agentuity Sandbox service. Provides a simple, ergonomic client for creating and managing sandbox environments for code execution.

## Commands

- **Build**: `bun run build`
- **Typecheck**: `bun run typecheck`
- **Clean**: `rm -rf dist`

## Architecture

- **Runtime**: Node.js and Bun compatible
- **Exports**: SandboxClient and all types from @agentuity/core/sandbox
- **Dependencies**: @agentuity/core

## Usage

```typescript
import { SandboxClient } from '@agentuity/sandbox';

const client = new SandboxClient();

// Create a sandbox
const sandbox = await client.create();
console.log(`Created sandbox: ${sandbox.id}`);

// Execute a command
const execution = await sandbox.execute({
  command: ['echo', 'Hello, World!']
});
console.log(`Execution status: ${execution.status}`);

// Clean up
await sandbox.destroy();
```

## Publishing

1. Run `bun run build`
2. Must publish **after** @agentuity/core