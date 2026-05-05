# @agentuity/core

Core utilities and shared types for the Agentuity framework.

## Installation

```bash
bun add @agentuity/core
```

## Overview

`@agentuity/core` provides foundational utilities, type helpers, schema interfaces, and the underlying API client used by Agentuity's service-client packages (`@agentuity/keyvalue`, `@agentuity/queue`, `@agentuity/vector`, `@agentuity/db`, `@agentuity/storage`, etc.) and CLI tooling.

## Features

- **Standard Schema**: Type-safe schema validation interfaces compatible with various validation libraries
- **Type Helpers**: Utility types for TypeScript development
- **JSON Utilities**: JSON parsing and serialization helpers
- **Storage Services**: Interfaces for key-value, object, stream, and vector storage

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

### Storage Services

```typescript
import type { KeyValueStorage, ObjectStorage, StreamStorage, VectorStorage } from '@agentuity/core';
```

Interfaces for various storage backends used in Agentuity applications.

### JSON Utilities

```typescript
import {} from /* JSON utilities */ '@agentuity/core';
```

Helpers for working with JSON data.

## Usage

This package is typically pulled in transitively through one of the service-client packages or `@agentuity/cli`. You generally don't need to depend on it directly.

## License

Apache 2.0
