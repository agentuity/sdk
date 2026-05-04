/**
 * Default entry for `@agentuity/storage`.
 *
 * The real backend selection happens in `package.json`'s `exports`
 * conditions: under Bun the `"bun"` condition routes the bare import
 * to `./bun.js`; under Node (and other resolvers that respect the
 * `"node"` condition) it routes to `./node.js`.
 *
 * This file exists for resolvers that ignore conditions entirely (some
 * IDE indexers, certain bundler configurations, or callers using the
 * legacy `main` field). For those, we re-export the Node backend,
 * which works under both runtimes.
 */

export * from './node.ts';
