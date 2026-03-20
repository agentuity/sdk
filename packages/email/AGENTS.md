# Agent Guidelines for @agentuity/email

## Package Overview

Standalone package for the Agentuity Email service. Provides a simple, ergonomic client for sending and receiving emails.

## Commands

- **Build**: `bun run build`
- **Typecheck**: `bun run typecheck`
- **Clean**: `rm -rf dist`

## Architecture

- **Runtime**: Node.js and Bun compatible
- **Exports**: EmailClient and all types from @agentuity/core/email
- **Dependencies**: @agentuity/core, zod

## Usage

```typescript
import { EmailClient } from '@agentuity/email';

const client = new EmailClient();

// Create an email address
const addr = await client.createAddress('support');

// Send an email
await client.send({
  from: addr.email,
  to: ['user@example.com'],
  subject: 'Hello',
  text: 'Welcome!'
});
```

## Publishing

1. Run `bun run build`
2. Must publish **after** @agentuity/core