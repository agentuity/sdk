# `@agentuity/cli` — Node-compatibility audit

**Goal:** make `packages/cli/src/**` and `packages/cli/bin/**` runnable under
**Node 24+** without requiring Bun. Tests, scripts, and scaffolded user-project
templates may continue to use Bun and are out of scope.

**Branch plan:** this audit lands on `v3`. The migration work happens on a
branch cut from `v3`.

**Strategy:**
1. Prefer Node 24 native APIs (no new dependencies) wherever possible.
2. Add a small dependency only when a native equivalent is genuinely missing
   or significantly more complex (e.g. globbing, S3, named-pipe shells).
3. Keep the CLI runnable under both Bun and Node — Bun stays the dev/build
   runtime, Node becomes a supported execution runtime. Use a tiny
   `node-compat.ts` shim layer for the few APIs that diverge, and detect at
   runtime when behavior is genuinely different.

---

## 1. Inventory

258 Bun-related source lines across 86 files in `packages/cli/src` and
`packages/cli/bin`. Distinct APIs in use:

| API | Sites | Notes |
|---|---:|---|
| `Bun.file(path).{text,json,exists,size,stream,delete}` | 110 | File I/O, biggest category |
| `Bun.spawn` / `Bun.spawnSync` | 35 + 11 | Process launching |
| `Bun.write(path, data)` | 22 | File writes — strings, buffers, streams, `Bun.file()`, `Response` |
| `Bun.color(name, format)` | 17 | ANSI escape generation in `tui.ts` and `banner.ts` |
| `Bun.sleep(ms)` | 10 | Async delay |
| `Bun.stringWidth(s)` | 8 | TUI alignment |
| `Bun.version` | 4 | Logging metadata |
| `Bun.main` | 4 | Self-relaunch in `deploy-fork.ts`, installation-type detection |
| `import.meta.dir` | 4 | Resolve sibling files (`templates/`, `dist/`) |
| `Bun.which(cmd)` | 4 | Look up binary in PATH (git, bun, sound players) |
| `Bun.stripANSI(s)` | 2 | Internal logger normalization |
| `Bun.Glob` | 2 | Snapshot file globbing |
| `Bun.CryptoHasher` | 2 | sha1 / sha256 over file contents |
| `Bun.$` template tag | 2 | Inline shell (typecheck, git fetch) |
| `Bun.revision` | 2 | Git SHA in `--version` output |
| `Bun.serve` | 2 | One in vite-react template (out of scope), one comment-only |
| `Bun.s3` / `S3Client` | 1 + import | Storage client (`storage/utils.ts`) |
| `Bun.stdin.text()` / `.stream()` | 4 | Read piped input |
| `Bun.hash.xxHash64(s)` | 1 | Project-id hash — deterministic 64-bit |
| `Bun.Loader` (type only) | 1 | String-literal union — easy inline |

Explicit `import { … } from 'bun'` symbols:

```text
runtime.ts                                  → semver
config.ts, sandbox/snapshot/build.ts        → YAML
tui.ts                                      → stringWidth
utils/deps.ts, cmd/canary/index.ts          → $
utils/zip.ts                                → Glob
cmd/cloud/deploy-fork.ts                    → spawn, type Subprocess
cmd/build/ci.ts                             → spawn
cmd/cloud/storage/utils.ts                  → S3Client
```

Plus the entrypoint shebang in `bin/cli.ts`: `#!/usr/bin/env bun`.

---

## 2. Replacement matrix (Node 24 first, deps only when needed)

### 2.1 File I/O — `Bun.file(...)` and `Bun.write(...)`

These are the largest categories. Native Node 24 `node:fs/promises` covers
all current uses; no dependency required.

| Bun call | Node 24 native | Notes |
|---|---|---|
| `Bun.file(p).text()` | `await readFile(p, 'utf-8')` | direct |
| `Bun.file(p).json()` | `JSON.parse(await readFile(p, 'utf-8'))` | direct |
| `Bun.file(p).exists()` | `await access(p).then(() => true).catch(() => false)` | wrap as `pathExists()` |
| `Bun.file(p).size` | `(await stat(p)).size` | direct |
| `Bun.file(p).delete()` | `await rm(p, { force: true })` | direct |
| `Bun.file(p).stream()` | `Readable.toWeb(createReadStream(p))` | for `fetch` body |
| `Bun.file(p)` as `fetch` body | `await readFile(p)` (small) <br>or stream via `Readable.toWeb(createReadStream(p))` (large) | Bun auto-handles content-length; on Node we may need to set it explicitly |
| `Bun.write(p, str)` | `await writeFile(p, str)` | direct |
| `Bun.write(p, buf)` | `await writeFile(p, buf)` | direct |
| `Bun.write(p, response)` | `await writeFile(p, Buffer.from(await res.arrayBuffer()))` <br>or `pipeline(Readable.fromWeb(res.body), createWriteStream(p))` for streams | streaming is the right choice for large responses |
| `Bun.write(p, Bun.file(src))` | `await copyFile(src, p)` | direct |

**Migration shim:** add `packages/cli/src/utils/fs-compat.ts` with `pathExists`,
`readText`, `readJson`, `writeText`, `writeBytes`, `streamToFile`. Replace
call sites mechanically. No dependency added.

### 2.2 Process spawning — `Bun.spawn`, `Bun.spawnSync`

Bun's `spawn` uses `{ cmd: [...], cwd, stdout, stderr, stdin, env }`. Node's
`child_process.spawn` takes `(command, args, options)`. Stdio modes
(`'inherit'`, `'pipe'`, `'ignore'`) are identical.

| Bun pattern | Node 24 native |
|---|---|
| `Bun.spawn({ cmd: ['x', 'y'], stdout: 'inherit' })` | `spawn('x', ['y'], { stdio: ['ignore', 'inherit', 'inherit'] })` |
| `Bun.spawn({ cmd, stdout: 'pipe' })` then `proc.stdout.text()` | `spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })` then await `streamConsumers.text(proc.stdout!)` |
| `proc.exited` | wrap `spawn` in `new Promise` resolving on `'exit'`/`'close'` |
| `Bun.spawnSync({ cmd, ... })` | `spawnSync(cmd[0], cmd.slice(1), { stdio: ... })` |
| Type `Subprocess` from `'bun'` | `import type { ChildProcess } from 'node:child_process'` |

**Migration shim:** add `packages/cli/src/utils/proc-compat.ts` exposing
`run({ cmd, cwd?, env?, stdio? }): { exitCode, stdout, stderr }` and an
`spawnInherit` for tunnel/SSH-style processes. Backed by
`node:child_process`. No dependency added.

The 2 `Bun.$` template-tag uses (`utils/git.ts:71`,
`cmd/build/typecheck.ts:86`) are for trivial commands — replace with our
`run()` helper, **not** with `execa`. No dependency added.

### 2.3 Sleep — `Bun.sleep(ms)`

Native: `import { setTimeout } from 'node:timers/promises'; await setTimeout(ms);`
Drop-in. No dependency added. 10 sites.

### 2.4 ANSI / TUI — `Bun.color`, `Bun.stringWidth`, `Bun.stripANSI`

Bun has these built in. Node does not.

| API | Replacement | Native? |
|---|---|---|
| `Bun.color('cyan', 'ansi-16m')` etc. | inline ~30-line ANSI helper (named colors → 16-color codes; hex → 256/truecolor codes). All current usages are either named colors or hex codes — small, well-defined surface. | Yes (inline) |
| `Bun.stringWidth(s)` | `string-width` (npm, ~1KB minified, zero deps as of v8) | **Dep needed.** Inlining a correct implementation (handles emoji, CJK, ANSI, ZWJ sequences) is ~150 lines and well-trodden. Use `string-width`. |
| `Bun.stripANSI(s)` | small regex: `s.replace(/\x1b\[[0-9;]*m/g, '')` covers SGR; full ANSI stripping (cursor codes etc.) needs `strip-ansi`. Internal-logger usage only needs SGR stripping — inline it. | Yes (inline) |

**Decision:**
- `Bun.color` → small inline helper, `node-compat/ansi.ts`.
- `Bun.stringWidth` → **add dep `string-width@^7`** (8 sites, all in TUI rendering, correctness matters for alignment).
- `Bun.stripANSI` → inline regex.

### 2.5 Globs — `Bun.Glob`

Two sites in `cmd/cloud/sandbox/snapshot/build.ts`:
```ts
const glob = new Bun.Glob(pattern);
for await (const file of glob.scan({ cwd, dot: true })) { … }
```

Node 24 ships `fs.glob` / `fs.globSync` (stable in 24). Both call sites use
basic `**/*` patterns and async iteration — direct replacement:

```ts
import { glob } from 'node:fs/promises';
for await (const file of glob(pattern, { cwd })) { … }
```

**Decision:** use `node:fs/promises.glob`. **No dependency added.**

### 2.6 Crypto — `Bun.CryptoHasher`, `Bun.hash.xxHash64`

| Site | Bun | Replacement |
|---|---|---|
| `cmd/build/ids.ts:9` | `new Bun.CryptoHasher('sha1')` | `crypto.createHash('sha1')` |
| `cmd/ai/prompt/version.ts:17` | `new Bun.CryptoHasher('sha256')` | `crypto.createHash('sha256')` |
| `domain.ts:107` | `Bun.hash.xxHash64(projectId).toString(16).padStart(16, '0')` | xxHash is **not** in `node:crypto`. Use a 16-hex-digit truncated SHA-256: `crypto.createHash('sha256').update(projectId).digest('hex').slice(0, 16)`. Output format unchanged (16 hex chars). |

**Decision:** `node:crypto`. **No dependency added.** Note the
xxHash64 → SHA-256 change is only inside a *local cache key* (project-id
domain); collisions at 64 bits are not security-sensitive. We just need a
*deterministic* 16-hex-digit derivation — a one-time migration that may
invalidate existing cache entries on first run under Node. Document this in
the PR.

### 2.7 YAML — `import { YAML } from 'bun'`

Two sites: `config.ts`, `cmd/cloud/sandbox/snapshot/build.ts`.

Node has no built-in YAML. **Add dep:** `yaml@^2`. (Already a transitive dep
in this repo's `bun.lock` via several packages — adding it as a direct dep
is essentially free.)

`Bun.YAML.parse(s)` and `Bun.YAML.stringify(o)` map 1:1 to `yaml.parse(s)` /
`yaml.stringify(o)`.

### 2.8 Semver — `import { semver } from 'bun'`

One site: `runtime.ts`. Used for version comparisons.

Node's `module.satisfies` doesn't exist. **Add dep:** `semver@^7` (already
a transitive dep). Bun's `semver.satisfies(a, b)` and `semver.order(a, b)` map
to the `semver` package's `satisfies(version, range)` and
`compare(a, b)`. Verify the call surface during migration (it's a single file).

### 2.9 S3 — `import { S3Client } from 'bun'`

`cmd/cloud/storage/utils.ts` constructs an `S3Client`. Used in
`storage/upload.ts`, `download.ts`, `delete.ts`, `list.ts` via methods:
`.list()`, `.stat()`, `.file()`, `.write(key, body, opts)`, `.delete(key)`.

This is the **only** Bun-typed import remaining in `@agentuity/cli` after
all other migrations — every other Bun API can be removed via natives or
shims. Bun's `S3Client` is also meaningfully faster than
`@aws-sdk/client-s3` for large uploads (the primary use case), so we
don't want Bun users to lose that performance just to be compatible with
Node.

**Decision: extract a new `@agentuity/storage` package** with two subpath
entries:

```text
packages/storage/
├── package.json   // exports: "." + "./bun" + "./node"
├── src/
│   ├── index.ts   // runtime-detect: re-export from ./bun or ./node
│   ├── bun.ts     // wraps Bun.S3Client (Bun runtime only)
│   ├── node.ts    // wraps @aws-sdk/client-s3 (works on both)
│   └── types.ts   // shared interface: createS3Client(), S3Client surface
```

Usage:

```ts
// Pinned to Bun (CLI users running under Bun, max throughput)
import { createS3Client } from '@agentuity/storage/bun';

// Pinned to Node (CLI users running under Node, also works under Bun)
import { createS3Client } from '@agentuity/storage/node';

// Auto-detect (per user direction — see Open Question on default export)
import { createS3Client } from '@agentuity/storage';
```

The package exposes a single, stable interface that both backends
implement:

```ts
export interface S3ClientLike {
  list(opts?: { prefix?: string; maxKeys?: number }): Promise<S3ListResult>;
  stat(key: string): Promise<S3StatResult>;
  file(key: string): S3FileLike;          // Bun-style file handle
  write(key: string, body: Body, opts?: WriteOpts): Promise<number>;
  delete(key: string): Promise<void>;
}

export function createS3Client(bucket: BucketConfig): S3ClientLike;
```

**Default-export behavior** (per user direction): runtime-detect at import
time. The bare `@agentuity/storage` entry checks `typeof Bun` and
lazy-loads `./bun` or `./node`. This gives Bun users full performance
automatically while staying Node-compatible.

**Dependencies:**
- `./bun` — zero runtime deps; uses globals provided by Bun.
- `./node` — `@aws-sdk/client-s3` (~1 MB). Acceptable; only loaded when
  Node runtime is detected.
- `./` (auto) — dynamic `import()` of the chosen subpath, so bundlers
  that tree-shake away the unused branch don't pay both costs.

**Migration to CLI:** `cmd/cloud/storage/utils.ts` currently does:

```ts
import { S3Client } from 'bun';
export function createS3Client(bucket) { return new S3Client({ ... }); }
```

becomes:

```ts
import { createS3Client as createS3ClientImpl } from '@agentuity/storage';
export const createS3Client = createS3ClientImpl;
```

All four call sites in `cmd/cloud/storage/{upload,download,list,delete}.ts`
stay unchanged because the interface is preserved.

**See also:** the Bun S3Client API surface we currently use
(`upload.ts:191` does `s3Client.write(key, new Response(stream), opts)` —
the `Response` body shape is Bun-specific and needs to map to a
`ReadableStream`/`Buffer` for the Node backend). Document the canonical
input shapes in `types.ts`.

### 2.10 `Bun.which(cmd)`

Four sites: `sound.ts`, `git-helper.ts`, `utils/git.ts`, `bun-path.ts`.

Node has no built-in `which`. Two options:

- **Inline implementation** (~15 lines): walk `PATH`, check `access(path,
  X_OK)`, handle Windows `PATHEXT`. Trivial to write correctly.
- `which` npm package.

**Decision:** **inline a small `which()` helper** in `utils/which.ts`. No
dependency added. The npm package is reliable but not worth a transitive
dependency for ~15 lines of code we'll fully own.

### 2.11 `Bun.stdin.text()` and `Bun.stdin.stream()`

Sites in `cmd/auth/{org/enroll,ssh/add}.ts` (text), and
`cmd/cloud/{vector/upsert,stream/create,storage/upload}.ts` (stream).

| Bun | Node 24 native |
|---|---|
| `await Bun.stdin.text()` | `await streamConsumers.text(process.stdin)` |
| `Bun.stdin.stream()` (Web `ReadableStream`) | `Readable.toWeb(process.stdin)` |

Both native. No dep added.

### 2.12 `Bun.serve`

Two mentions:
- `cmd/project/templates/vite-react/server.ts` — **out of scope** (scaffolded
  into user projects, runs in their runtime).
- `cmd/build/adapters/static-server.ts:19` — **comment only**, no actual
  call.

No migration work in CLI prod code.

### 2.13 `Bun.version`, `Bun.revision`, `Bun.main`, `import.meta.dir`

| Bun | Node 24 native |
|---|---|
| `Bun.version` | `process.versions.bun` (undefined under Node) — wrap behind a `runtime.ts` helper that returns either `bun-${version}` or `node-${process.versions.node}`. |
| `Bun.revision` | Embedded only in the Bun build; under Node use a build-time-injected git SHA (already done elsewhere in the repo via `tsc` → keep current value or read from `package.json` git metadata). For pre-release/dev builds, return `'unknown'` (existing behavior). |
| `Bun.main` | `process.argv[1]` (or `fileURLToPath(import.meta.url)` for the entry module). |
| `import.meta.dir` | `path.dirname(fileURLToPath(import.meta.url))` — wrap as `__dirname` constant in each file (or a `currentDir(meta)` helper). |

All native. No dep added.

### 2.14 `Bun.Loader` (type only)

`cmd/build/patch/index.ts:24` uses it as a return type. Replace with the
literal union directly (the docs list ~9 values; we only return `'js'` /
`'jsx'` / `'ts'` / `'tsx'` based on the file extension). Inline as
`type LoaderKind = 'js' | 'jsx' | 'ts' | 'tsx';`.

### 2.15 Shebang — `#!/usr/bin/env bun`

Final entrypoint behavior choice (per user instruction): **detect
bun-or-node at install time**.

Approach:
1. Keep `bin/cli.ts` as the published entrypoint.
2. Replace shebang with `#!/usr/bin/env node`. Node 24 runs the compiled
   `dist/cli.js` (we publish only compiled JS via `bin: { agentuity:
   "./bin/cli.ts" }` → switch to `./dist/cli.js`).
3. Optionally ship a tiny shell wrapper `bin/agentuity` that, at install,
   prefers `bun` if on `PATH` and falls back to `node`. Most users won't
   care; the wrapper costs ~10 lines of POSIX sh + a `.cmd` for Windows.

This is the only piece that's worth a separate design pass during migration
— see `Open Question #1` below.

---

## 3. Proposed shim layer

To minimize churn at every call site, introduce a small compat module:

```text
packages/cli/src/node-compat/
├── index.ts        // re-exports
├── fs.ts           // pathExists, readText, readJson, writeText, writeBytes, streamToFile
├── proc.ts         // run(), spawnInherit(), waitFor()
├── timers.ts       // sleep()
├── ansi.ts         // color(), stripAnsi() (regex-based)
├── stdin.ts        // readStdinText(), stdinStream()
├── runtime-info.ts // runtimeKind(), runtimeVersion(), entryScriptPath(), gitSha()
├── which.ts        // which()
└── crypto.ts       // sha256Hex(), sha1Hex(), shortHashHex() // replaces xxHash64
```

`stringWidth` stays as a direct `import { default as stringWidth } from
'string-width'` — no shim needed.

`yaml`, `semver`, `@aws-sdk/client-s3` are imported directly where used.

Migration is one PR per area:
1. Add shims, add deps, no behavior change.
2. Migrate `config.ts` + auth (heaviest single chunks).
3. Migrate `cmd/cloud/*`.
4. Migrate `cmd/build/*`.
5. Migrate `cmd/project/*`, `cmd/coder/*`, `cmd/support/*`.
6. Migrate `tui.ts` + `banner.ts` (TUI/ANSI).
7. Switch shebang + `bin` field, add Node-versions matrix to CI.
8. Remove `bun-types` runtime references where no longer needed (keep for
   `test/`, `scripts/`).

---

## 4. New dependencies summary

New **workspace package**:

| Package | Why |
|---|---|
| `@agentuity/storage` | Dual-runtime S3 client. `/bun` uses Bun.S3Client; `/node` uses @aws-sdk/client-s3; bare entry runtime-detects. |

New direct deps in `packages/cli/package.json`:

| Package | Why | Approx size |
|---|---|---:|
| `string-width` | TUI alignment, correctness-critical | ~1 KB |
| `yaml` | Replace `Bun.YAML` | already transitive |
| `semver` | Replace `Bun.semver` | already transitive |
| `@agentuity/storage` | Dual-runtime S3 client (workspace dep) | n/a |

New direct deps in `packages/storage/package.json` (the `/node` subpath
only):

| Package | Why | Approx size |
|---|---|---:|
| `@aws-sdk/client-s3` | Node-side S3 backend | ~1 MB (loaded only when Node runtime detected) |

Everything else (file I/O, spawn, sleep, glob, crypto, which, ANSI strip,
stdin) is **handled with Node 24 natives + small inline helpers** — no new
deps.

---

## 5. Risk / behavior-change watch list

Things that might surprise users mid-migration:

1. **`Bun.hash.xxHash64` → SHA-256 truncation in `domain.ts`.** Cache keys
   computed under Node will not match cache keys computed under Bun. This
   only affects local-machine cache invalidation (one-time re-cache).
2. **`Bun.file(...)` as `fetch` body** — Bun sets `Content-Length`
   automatically; under Node we must either buffer (small files) or set
   `'content-length'` explicitly when streaming. Audit each `fetch` /
   upload site during migration.
3. **`Bun.spawn` returns an awaitable `proc.exited`** that resolves to the
   exit code. Node's `child_process.spawn` requires manual `'exit'` /
   `'close'` event handling. The `run()` helper wraps this; uses outside
   the helper need to be inspected.
4. **`Bun.color('name', 'ansi-16m')`** returns a 24-bit color escape; named
   colors map to the 16-color palette in Bun. Our replacement must mirror
   this so banner gradients don't shift.
5. **`process.stdin.unref()` / `setRawMode()`** — `bin/cli.ts` already
   special-cases this for Bun; under Node it's natively supported, so we
   should be able to *remove* the explicit `process.exit()` workaround at
   line 305-310 of `bin/cli.ts` once running under Node.
6. **TLS / HTTP client behavior.** Bun's `fetch` is ~2x faster than Node's
   undici; for `agentuity cloud deploy` the difference may show up in
   upload throughput. Not blocking, just worth measuring on first Node
   release.
7. **YAML formatter output.** `yaml` (npm) and `Bun.YAML.stringify` produce
   slightly different formatting (key ordering, anchor handling). Verify
   any YAML the CLI *writes* round-trips identically, or document the
   intentional change.

---

## 6. Open questions

0. **`@agentuity/storage` package shape.** Confirmed: extract into a new
   workspace package with `/bun` and `/node` subpath exports plus a
   runtime-detecting default. Sub-decisions to confirm during migration:
   - Package name `@agentuity/storage` (vs `@agentuity/s3` — we picked
     `storage` to match `@agentuity/core`'s `services/storage/` naming).
   - Whether to expose a thin wrapper API (today's `S3ClientLike`) or to
     re-export each backend's native types and let callers branch. The
     former is portable; the latter is closer to zero-cost.
   - Whether the package should also offer a higher-level API (e.g.
     `streamUpload(bucket, key, source)`) so `storage/upload.ts` can
     drop the manual `Response`-wrapping it does today.

1. **Shebang strategy.** Per user direction, detect bun-or-node at install
   time. Shape options:
   - **A)** `bin: "./bin/agentuity"` wrapper script (POSIX sh + `.cmd`)
     that chooses runtime.
   - **B)** `bin: "./dist/cli.js"` with `#!/usr/bin/env node`, plus a
     postinstall script that swaps in a Bun shebang if `bun` is detected.
   - **C)** `bin: "./dist/cli.js"` always Node, document that users with
     Bun installed get no special treatment (simplest).
   Prefer **(A)** since it's the only one that truly auto-detects per-run.
   Confirm before migration starts.

2. **`bun-types` in `package.json`.** Keep as `devDependency` (tests/scripts
   still use Bun) but stop importing `bun-types` from prod source. Verify
   no `tsconfig.json` `types: ["bun-types"]` leaks Bun globals into prod
   build.

3. **VS Code extension's CLI calls.** `packages/vscode/` shells out to the
   `agentuity` binary. After migration, verify the extension still works
   when the CLI runs under Node.

4. **CI matrix.** Currently CI runs the CLI under Bun only. Add a Node-24
   row to `release-next.yaml` (`bun run test:unit` already passes; we'd
   need a `node` test target for the migrated subset) — or run a smoke
   suite (`agentuity --help`, `agentuity auth whoami`, `agentuity --version`)
   under both runtimes to catch regressions.

5. **Self-update flow.** `cmd/upgrade/` re-invokes the CLI; verify that
   running under Node still finds the right entrypoint and the right
   runtime is preserved across the re-exec.

---

## 7. Migration checklist (for the follow-up branch)

- [ ] Branch `node-compat` cut from `v3`.
- [ ] Add `node-compat/*` shim modules.
- [ ] Create `packages/storage/` workspace package with `/bun`, `/node`,
      and runtime-detecting default exports.
- [ ] Add `@aws-sdk/client-s3` to `packages/storage`'s deps (only used by
      the `/node` backend).
- [ ] Add deps to `packages/cli`: `string-width`, `yaml`, `semver`,
      `@agentuity/storage` (workspace).
- [ ] Migrate `cmd/cloud/storage/utils.ts` to import from
      `@agentuity/storage` (one-line change; `createS3Client` API is
      preserved). Verify `upload.ts`, `download.ts`, `list.ts`,
      `delete.ts` work unchanged.
- [ ] Migrate `config.ts`, `auth.ts`.
- [ ] Migrate `cmd/cloud/**` (S3, SSH, deploy, sandbox).
- [ ] Migrate `cmd/build/**` (typecheck shell, patch loader).
- [ ] Migrate `cmd/project/**` (scaffold, reconcile, remote-import,
      template-flow).
- [ ] Migrate `cmd/coder/**`, `cmd/support/**`, `cmd/setup/**`,
      `cmd/git/**`, `cmd/auth/**`, `cmd/ai/**`, `cmd/dev/**`,
      `cmd/upgrade/**`, `cmd/canary/**`.
- [ ] Migrate `tui.ts`, `banner.ts`, `tui/box.ts` (ANSI / stringWidth).
- [ ] Migrate `keychain.ts`, `git-helper.ts`, `utils/**`,
      `internal-logger.ts`, `version.ts`, `runtime.ts`,
      `deploy-metadata.ts`, `domain.ts`, `bun-path.ts`,
      `agent-detection.ts`, `sound.ts`, `repl.ts`, `regions.ts`,
      `env-util.ts`, `version-check.ts`, `typescript-errors.ts`,
      `build-report.ts`.
- [ ] Update shebang and `bin` field per Open Question #1.
- [ ] Add Node-24 row to release-next CI.
- [ ] Smoke test: `agentuity --version`, `agentuity --help`,
      `agentuity auth whoami`, `agentuity cloud deploy --dry-run`,
      `agentuity dev`, `agentuity cloud sandbox list`,
      `agentuity cloud storage list`.
- [ ] Update `packages/cli/AGENTS.md` with the new convention (no Bun
      globals in prod source).
