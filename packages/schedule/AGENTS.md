# Agent Guidelines for @agentuity/schedule

## Package Overview

Standalone package for the Agentuity Schedule service. Provides a simple, ergonomic client for managing cron-based scheduled jobs.

## Commands

- **Build**: `bun run build`
- **Typecheck**: `bun run typecheck`
- **Clean**: `rm -rf dist`

## Architecture

- **Runtime**: Node.js and Bun compatible
- **Exports**: ScheduleClient and all types from @agentuity/core/schedule
- **Dependencies**: @agentuity/core, zod

## Usage

```typescript
import { ScheduleClient } from '@agentuity/schedule';

const client = new ScheduleClient();

// Create a schedule
const result = await client.create({
  name: 'Hourly Sync',
  expression: '0 * * * *',
  destinations: [{ type: 'url', config: { url: 'https://example.com/sync' } }]
});
```

## Publishing

1. Run `bun run build`
2. Must publish **after** @agentuity/core