# @agentuity/core

Core utilities and shared types for the Agentuity framework.

## Installation

```bash
bun add @agentuity/core
```

## Overview

`@agentuity/core` provides foundational utilities, type helpers, schema interfaces, and shared HTTP wiring used by Agentuity's service-client packages (`@agentuity/keyvalue`, `@agentuity/queue`, `@agentuity/vector`, `@agentuity/db`, `@agentuity/storage`, etc.) and CLI tooling.

Import service clients and storage types from `@agentuity/{service}` directly — not from `@agentuity/core`.

## Features

- **Standard Schema**: Type-safe schema validation interfaces compatible with various validation libraries
- **Type Helpers**: Utility types for TypeScript development
- **JSON Utilities**: JSON parsing and serialization helpers

## Exports

### Standard Schema

```typescript
import type { StandardSchemaV1 } from '@agentuity/core';
```

Provides a standard interface for schema validation that works with libraries like Zod, Valibot, and others.

### Type Helpers

```typescript
import {} from /* type utilities */ '@agentuity/core';
```

TypeScript utility types for enhanced type safety.

### JSON Utilities

```typescript
import {} from /* JSON utilities */ '@agentuity/core';
```

Helpers for working with JSON data.

## Usage

This package is typically pulled in transitively through `@agentuity/cli` or other tooling. Service apps should depend on `@agentuity/{service}` packages directly.

## License

Apache 2.0
