# @agentuity/storage

Dual-runtime S3 client for Agentuity storage buckets.

## Why this exists

Agentuity storage buckets are S3-compatible. The CLI and other tooling
need to upload, download, list, and delete objects. Bun ships a native
`S3Client` that's significantly faster than `@aws-sdk/client-s3` for
large transfers, but it doesn't work under Node.

This package exposes a single `S3ClientLike` interface implemented by
both backends. Bun consumers automatically get the fast native client;
Node consumers automatically get the AWS SDK. Subpath imports
(`@agentuity/storage/bun`, `@agentuity/storage/node`) are available for
explicit pinning.

## Installation

```bash
npm install @agentuity/storage
```

## Quick Start

```typescript
import { createS3Client } from '@agentuity/storage';

const s3 = createS3Client({
  endpoint: 'my-bucket.agentuity.run',
  access_key: 'AKIA...',
  secret_key: '...',
  region: 'us-east-1', // optional, defaults to 'auto'
});

// List objects
const result = await s3.list({ prefix: 'logs/', maxKeys: 100 });
for (const obj of result.contents) {
  console.log(obj.key, obj.size, obj.lastModified);
}

// Upload (string, Buffer, Uint8Array, or ReadableStream)
const bytes = await s3.write('hello.txt', 'Hello, World!', {
  type: 'text/plain',
});

// Stat (HEAD)
const meta = await s3.stat('hello.txt');
console.log(meta.size, meta.type);

// Download
const file = s3.file('hello.txt');
const text = await file.text();

// Delete
await s3.delete('hello.txt');
```

## Backends

| Subpath | Resolver | Implementation | Notes |
| --- | --- | --- | --- |
| `@agentuity/storage` (bare) | `package.json` conditions | Bun → `bun.ts`, Node → `node.ts` | Recommended for most callers |
| `@agentuity/storage/bun` | explicit | `Bun.S3Client` wrapper | Bun runtime only |
| `@agentuity/storage/node` | explicit | `@aws-sdk/client-s3` wrapper | Works under both runtimes |

The Node backend lazy-loads `@aws-sdk/client-s3` on first method call,
so importing the package does not incur the SDK's cold-start cost
unless storage operations are actually performed.

## License

Apache-2.0
