# @agentuity/core

Core utilities and shared types for the Agentuity framework.

## Installation

```bash
bun add @agentuity/core
```

## Overview

`@agentuity/core` provides foundational utilities, type helpers, and standard schema interfaces used across the Agentuity ecosystem. This package is a dependency for both `@agentuity/server` and `@agentuity/react`.

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

This package is typically used as a peer dependency and not directly imported in user code. The `@agentuity/server` and `@agentuity/react` packages expose the necessary types and utilities.

## License

MIT
