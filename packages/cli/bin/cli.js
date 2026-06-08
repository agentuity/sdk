#!/usr/bin/env node

/**
 * Published CLI entry point for `@agentuity/cli`.
 *
 * This file is intentionally tiny:
 *   - npm uses it as the `agentuity` binary (see package.json `bin`).
 *   - The shebang lets the kernel launch Node directly when users run
 *     `agentuity` from a shell on macOS/Linux.
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
