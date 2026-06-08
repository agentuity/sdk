/**
 * Published CLI JavaScript entry for `@agentuity/cli`.
 *
 * This file is intentionally tiny:
 *   - `bin/agentuity` (POSIX) and `bin/agentuity.cmd` (Windows) detect an
 *     available runtime (bun or node) and exec this file with it.
 *   - Direct invocation still works: `node bin/cli.js` or `bun bin/cli.js`.
 *   - It hands off to the compiled CLI at `dist/main.js`.
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
