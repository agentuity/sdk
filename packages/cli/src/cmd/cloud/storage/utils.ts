/**
 * Re-export of `@agentuity/storage`'s `createS3Client`.
 *
 * Historically this file constructed a `Bun.S3Client` directly. The
 * client construction has moved into `@agentuity/storage`, which
 * exposes a single `createS3Client(bucket)` factory backed by either
 * `Bun.S3Client` (under Bun) or `@aws-sdk/client-s3` (under Node) via
 * conditional `exports`. Local callers do not need to change beyond
 * updating their import path — and most do not, because this module
 * still re-exports the same `createS3Client` symbol.
 *
 * Keeping the re-export here (rather than asking each call site to
 * import `@agentuity/storage` directly) limits the blast radius if we
 * later need to pre-/post-process bucket configs CLI-side (e.g. log
 * which backend was selected, inject a custom retry policy, etc.).
 */

export { createS3Client } from '@agentuity/storage';
