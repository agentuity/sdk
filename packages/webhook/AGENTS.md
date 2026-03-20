# Agent Guidelines for @agentuity/webhook

## Package Overview

Standalone package for the Agentuity Webhook service. Provides a simple, ergonomic client for creating and managing webhook endpoints.

## Commands

- **Build**: `bun run build`
- **Typecheck**: `bun run typecheck`
- **Clean**: `rm -rf dist`

## Architecture

- **Runtime**: Node.js and Bun compatible
- **Exports**: WebhookClient and all types from @agentuity/core/webhook
- **Dependencies**: @agentuity/core, @agentuity/server, zod

## Usage

```typescript
import { WebhookClient } from '@agentuity/webhook';

const client = new WebhookClient();

// Create a webhook
const { webhook } = await client.create({ name: 'GitHub Events' });

// Add a destination
await client.createDestination(webhook.id, {
  type: 'url',
  config: { url: 'https://example.com/webhook' }
});
```

## Publishing

1. Run `bun run build`
2. Must publish **after** @agentuity/core