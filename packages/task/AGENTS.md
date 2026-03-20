# Agent Guidelines for @agentuity/task

## Package Overview

Standalone package for the Agentuity Task service. Provides a simple, ergonomic client for managing tasks, comments, tags, and attachments in a lightweight task tracking system.

## Commands

- **Build**: `bun run build`
- **Typecheck**: `bun run typecheck`
- **Clean**: `rm -rf dist`

## Architecture

- **Runtime**: Node.js and Bun compatible
- **Exports**: TaskClient and all types from @agentuity/core/task
- **Dependencies**: @agentuity/core, @agentuity/server, zod

## Usage

```typescript
import { TaskClient } from '@agentuity/task';

const client = new TaskClient();

// Create a task
const task = await client.create({
  title: 'Implement feature',
  description: 'Add new feature to the system',
  priority: 'high'
});

// Add a comment
await client.createComment(task.id, 'Started working on this');
```

## Publishing

1. Run `bun run build`
2. Must publish **after** @agentuity/core