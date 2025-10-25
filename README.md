# Agentuity TypeScript Monorepo

TypeScript monorepo using Bun 1.3+ workspaces.

## Structure

-   `packages/core` - Shared utilities
-   `packages/react` - React package (browser)
-   `packages/server` - Server-side package (Bun runtime)

## Setup

```bash
bun install
```

## Build

```bash
bun run build
```

## Typecheck

```bash
bun run typecheck
```

## Usage

Packages can import from each other using workspace protocol:

```typescript
import { createResponse } from '@agentuity/core';
```
