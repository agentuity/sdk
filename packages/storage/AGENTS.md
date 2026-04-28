# Agent Guidelines for @agentuity/storage

## Package Overview

Dual-runtime S3 client for Agentuity storage buckets. Provides a unified
`S3ClientLike` interface backed by either Bun's native `S3Client` (faster,
preferred when available) or `@aws-sdk/client-s3` (works under Node).

## Commands

- **Build**: `bun run build`
- **Typecheck**: `bun run typecheck`
- **Clean**: `rm -rf dist`

## Architecture

- **Runtime**: Node.js and Bun compatible
- **Backend selection**: `package.json` `exports` conditions select
  `./dist/bun.js` under Bun and `./dist/node.js` under Node automatically.
  Subpath imports `@agentuity/storage/bun` and `@agentuity/storage/node`
  are also available for explicit pinning.
- **Dependencies**: `@aws-sdk/client-s3` (loaded lazily by the Node backend
  on first use, so non-storage callers don't pay the cold-start cost).

## Usage

```typescript
import { createS3Client } from '@agentuity/storage';

const s3 = createS3Client({
  endpoint: 'my-bucket.agentuity.run',
  access_key: '...',
  secret_key: '...',
});

const list = await s3.list({ prefix: 'logs/' });
for (const obj of list.contents) {
  console.log(obj.key, obj.size, obj.lastModified);
}

const bytes = await s3.write('hello.txt', 'Hello, World!', {
  type: 'text/plain',
});
console.log(`Uploaded ${bytes} bytes`);
```

### Pinning a backend explicitly

```typescript
// Bun-only (only resolvable when running under Bun):
import { createS3Client } from '@agentuity/storage/bun';

// Node-compatible (works under both Bun and Node):
import { createS3Client } from '@agentuity/storage/node';
```

## Publishing

1. Run `bun run build`
2. Must publish **after** any new direct deps are released
3. Must publish **before** `@agentuity/cli` (the CLI's storage subcommands
   depend on this package)
