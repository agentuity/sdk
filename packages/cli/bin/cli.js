#!/bin/sh
':' /*
command -v bun >/dev/null 2>&1 && exec bun "$0" "$@"
exec node "$0" "$@"
*/
/**
 * Published polyglot CLI entry for `@agentuity/cli`.
 *
 * This file is intentionally tiny and ships as-is:
 *   - Shell invocation chooses bun when available, otherwise node, then
 *     execs this same file with that runtime.
 *   - Direct invocation works too: `node bin/cli.js` or `bun bin/cli.js`.
 *   - JavaScript execution hands off to the compiled CLI at `dist/main.js`.
 *
 * The old `--version` fast-path that printed this package's version and
 * exited is removed so version queries flow through main.ts like every
 * other command. That lets them delegate to a project-local @agentuity/cli
 * (v2 back-compat) instead of always reporting the global version.
 *
 * No build step rewrites this file. It ships as-is from the repo to
 * the published tarball.
 */

await import('../dist/main.js');
