# Plan: Node-compat for `@agentuity/cli` + dedicated `@agentuity/storage` package

> **Branch:** `cli/node-compat` (cut from `v3`)
> **Status:** planning. No production code touched yet.
> **Scope:** make `packages/cli/src/**` and `packages/cli/bin/**` runnable
> under **Node 24+** without requiring Bun. Tests, build scripts, and
> scaffolded user-project templates may continue to use Bun and are out of
> scope. Extract the S3 client surface into a dedicated dual-runtime
> `@agentuity/storage` workspace package along the way.

---

## Table of contents

- [1. Why we're doing this](#1-why-were-doing-this)
- [2. Conventions inferred from existing packages](#2-conventions-inferred-from-existing-packages)
- [3. Inventory of Bun-specific usage in the CLI](#3-inventory-of-bun-specific-usage-in-the-cli)
- [4. Replacement matrix (Node 24 first, deps only when needed)](#4-replacement-matrix-node-24-first-deps-only-when-needed)
- [5. Proposed `node-compat` shim layer](#5-proposed-node-compat-shim-layer)
- [6. Dedicated `@agentuity/storage` package](#6-dedicated-agentuitystorage-package)
- [7. New dependencies](#7-new-dependencies)
- [8. Risk / behavior-change watch list](#8-risk--behavior-change-watch-list)
- [9. Open questions](#9-open-questions)
- [10. Migration checklist](#10-migration-checklist)

---

## 1. Why we're doing this

The CLI (`@agentuity/cli`) is the most user-facing package after
`create-agentuity`. Today its shebang is `#!/usr/bin/env bun` and the
source contains **258 Bun-specific call sites** across **86 files** in
`src/` and `bin/`. That means:

- Anyone installing `@agentuity/cli` via `npm install -g @agentuity/cli`
  (or `npx`) without Bun on `PATH` gets a non-functional binary.
- Bundled / native-executable distribution paths assume Bun's runtime.
- The S3 client (`Bun.S3Client`, only used by the CLI's storage
  subcommands) is the single Bun-typed import that's worth preserving for
  performance, so we lift it out into its own package with both
  backends.

Goal: the same source builds and runs on **Node 24+** with no behavior
regressions, while continuing to run on Bun (Bun stays the dev/test/build
runtime).

---

## 2. Conventions inferred from existing packages

Before designing anything, surveying the workspace clarifies the house
style.

### 2.1 Package layout (from `keyvalue`, `queue`, `email`, `vector`, `webhook`, `db`, `schedule`, `task`, `sandbox`, `stream`)

These are all "service-client" packages. The shape is identical:

```text
packages/<name>/
├── package.json     // single export, type: module, main+types -> dist/
├── AGENTS.md        // one-paragraph overview + commands + publishing note
├── README.md
├── src/
│   └── index.ts     // re-exports types from @agentuity/core/<name>,
│                    // adds a Client class that wires @agentuity/adapter
│                    // (HTTP) to the service.
└── tsconfig.json
```

Each one declares **"Runtime: Node.js and Bun compatible"** in its
`AGENTS.md`. That compatibility is achieved by routing all I/O through
`@agentuity/adapter`, which uses native `fetch` (works identically on
Node 24+ and Bun).

`package.json` exports field is uniformly:

```json
"exports": {
    ".": {
        "import": "./dist/index.js",
        "types": "./dist/index.d.ts"
    }
}
```

Dependencies follow a tight pattern: `@agentuity/core`, `@agentuity/adapter`,
`zod`. No service package depends on `bun` or `bun-types` at runtime; both
appear only under `devDependencies`.

### 2.2 Adapter pattern (`@agentuity/adapter`)

`@agentuity/adapter` is the runtime-abstraction seam for HTTP. It wraps
`fetch` (native to both runtimes), adds auth headers, debug logging, and
error normalization. Service clients import `createServerFetchAdapter` and
`buildClientHeaders` and never touch `fetch` directly. We follow the same
pattern for our new storage package: don't expose `fetch` or the S3 SDK
directly; expose a stable `S3ClientLike` interface that both backends
implement.

### 2.3 Bun-only packages (`@agentuity/postgres`)

`@agentuity/postgres` is **explicitly Bun-only** — it imports
`{ SQL as BunSQL } from 'bun'` and wraps Bun's native SQL driver. No
Node fallback. This is the precedent for "if a Bun API genuinely has no
Node equivalent and the package is opt-in, it's OK to be Bun-only." For
the CLI we don't have that luxury (the CLI is not opt-in); for an
internal storage package we *do* have that luxury for the `/bun` subpath.

### 2.4 Build + publish

- All packages build via `bunx tsc --build --force` (or `tsgo` in the
  newer ones).
- `@agentuity/core` publishes first; `cli` publishes second-to-last;
  `create-agentuity` publishes last (see
  `scripts/publish.ts:getPublishablePackages()`).
- A new `@agentuity/storage` package would publish in the "others" group,
  before `cli` (because `cli` depends on it).

### 2.5 Implications for our work

1. The new `@agentuity/storage` package follows the standard layout:
   `package.json` + `AGENTS.md` + `README.md` + `src/index.ts` + `tsconfig.json`.
2. We can break with the existing convention only on **two** axes, both
   well-justified:
   - **Subpath exports for runtime selection** (`/bun` and `/node`) —
     no existing package does this, but it's the cleanest way to let
     callers pin a backend.
   - **A `bun` import** lives in the `/bun` subpath only, gated by the
     `bun` condition in `exports` so Node bundlers never try to resolve
     it.
3. Everything else mirrors `keyvalue` / `queue` / `email`.

---

## 3. Inventory of Bun-specific usage in the CLI

258 Bun-related source lines across 86 files in `packages/cli/src` and
`packages/cli/bin`. Generated via:

```bash
rg -c 'Bun\.|from .bun.|import\.meta\.(dir|file|path|main)' \
   packages/cli/src packages/cli/bin --type ts \
   | rg -v '\.test\.ts'
```

Distinct APIs in use, with site counts:

| API | Sites | Category |
|---|---:|---|
| `Bun.file(path).{text,json,exists,size,stream,delete,arrayBuffer}` | 110 | File I/O |
| `Bun.spawn` / `Bun.spawnSync` | 35 + 11 | Process spawning |
| `Bun.write(path, data)` | 22 | File writes |
| `Bun.color(name, format)` | 17 | ANSI / TUI |
| `Bun.sleep(ms)` | 10 | Async delay |
| `Bun.stringWidth(s)` | 8 | TUI alignment |
| `Bun.version` | 4 | Runtime metadata |
| `Bun.main` | 4 | Entry script path |
| `Bun.which(cmd)` | 4 | PATH lookup |
| `import.meta.dir` | 4 | Directory of current file |
| `Bun.stripANSI(s)` | 2 | ANSI stripping |
| `Bun.Glob` | 2 | File globbing |
| `Bun.CryptoHasher` | 2 | sha1 / sha256 |
| `Bun.$` template tag | 2 | Inline shell |
| `Bun.revision` | 2 | Git SHA in `--version` |
| `Bun.serve` | 2 | One in vite-react template (out of scope), one comment-only |
| `Bun.s3` / `S3Client` | 1 import + 5 method sites | S3 (extracted to `@agentuity/storage`) |
| `Bun.stdin.text()` / `Bun.stdin.stream()` | 4 | Read piped input |
| `Bun.hash.xxHash64(s)` | 1 | 64-bit hash for project-id |
| `Bun.Loader` (type only) | 1 | Literal-union type |

Explicit named imports from `'bun'`:

```text
runtime.ts                                  -> semver
config.ts, sandbox/snapshot/build.ts        -> YAML
tui.ts                                      -> stringWidth
utils/deps.ts, cmd/canary/index.ts          -> $
utils/zip.ts                                -> Glob
cmd/cloud/deploy-fork.ts                    -> spawn, type Subprocess
cmd/build/ci.ts                             -> spawn
cmd/cloud/storage/utils.ts                  -> S3Client          # moves to @agentuity/storage
```

Plus the entrypoint shebang in `bin/cli.ts`: `#!/usr/bin/env bun`.

---

## 4. Replacement matrix (Node 24 first, deps only when needed)

### 4.1 File I/O — `Bun.file(...)` and `Bun.write(...)`

110 + 22 sites. Native Node 24 `node:fs/promises` covers everything; no
dependency required.

| Bun call | Node 24 native | Notes |
|---|---|---|
| `Bun.file(p).text()` | `await readFile(p, 'utf-8')` | direct |
| `Bun.file(p).json()` | `JSON.parse(await readFile(p, 'utf-8'))` | direct |
| `Bun.file(p).exists()` | `await access(p).then(() => true).catch(() => false)` | wrap as `pathExists()` |
| `Bun.file(p).size` | `(await stat(p)).size` | direct |
| `Bun.file(p).delete()` | `await rm(p, { force: true })` | direct |
| `Bun.file(p).stream()` | `Readable.toWeb(createReadStream(p))` | for `fetch` body |
| `Bun.file(p).arrayBuffer()` | `(await readFile(p)).buffer` | direct |
| `Bun.file(p)` as `fetch` body | `await readFile(p)` (small) <br>or stream via `Readable.toWeb(createReadStream(p))` (large) | Bun auto-handles `Content-Length`; on Node we set it explicitly when streaming |
| `Bun.write(p, str)` | `await writeFile(p, str)` | direct |
| `Bun.write(p, buf)` | `await writeFile(p, buf)` | direct |
| `Bun.write(p, response)` | `await writeFile(p, Buffer.from(await res.arrayBuffer()))` <br>or `pipeline(Readable.fromWeb(res.body), createWriteStream(p))` for streams | streaming for large responses |
| `Bun.write(p, Bun.file(src))` | `await copyFile(src, p)` | direct |

**Shim:** `node-compat/fs.ts` exposing `pathExists`, `readText`,
`readJson`, `writeText`, `writeBytes`, `streamToFile`, `copyFileTo`.
**No dependency.**

### 4.2 Process spawning — `Bun.spawn`, `Bun.spawnSync`

35 + 11 sites. Bun's `spawn` uses `{ cmd: [...], cwd, stdout, stderr,
stdin, env }`. Node's `child_process.spawn` takes `(command, args,
options)`. Stdio modes (`'inherit'`, `'pipe'`, `'ignore'`) are identical.

| Bun pattern | Node 24 native |
|---|---|
| `Bun.spawn({ cmd: ['x', 'y'], stdout: 'inherit' })` | `spawn('x', ['y'], { stdio: ['ignore', 'inherit', 'inherit'] })` |
| `Bun.spawn({ cmd, stdout: 'pipe' })` then `proc.stdout.text()` | `spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })` then `await text(proc.stdout!)` from `node:stream/consumers` |
| `proc.exited` | wrap `spawn` in `new Promise` resolving on `'exit'` / `'close'` |
| `Bun.spawnSync({ cmd, ... })` | `spawnSync(cmd[0], cmd.slice(1), { stdio: ... })` |
| Type `Subprocess` from `'bun'` | `import type { ChildProcess } from 'node:child_process'` |

**Shim:** `node-compat/proc.ts` exposing `run({ cmd, cwd?, env?, stdio?
})` (returns `{ exitCode, stdout, stderr }`) and `spawnInherit()` for
SSH/SCP-style passthrough. **No dependency.**

The 2 `Bun.$` template-tag uses (`utils/git.ts:71`,
`cmd/build/typecheck.ts:86`) become `await run({ cmd: [...] })`. **No
`execa` dependency.**

### 4.3 Sleep — `Bun.sleep(ms)`

10 sites. Native:

```ts
import { setTimeout } from 'node:timers/promises';
await setTimeout(ms);
```

**Shim:** `node-compat/timers.ts` exposing `sleep(ms)`. **No
dependency.**

### 4.4 ANSI / TUI — `Bun.color`, `Bun.stringWidth`, `Bun.stripANSI`

| API | Sites | Replacement | Native? |
|---|---:|---|---|
| `Bun.color('cyan', 'ansi-16m')` etc. | 17 | inline ~30-line ANSI helper. All current usages are named colors or hex codes — small, well-defined surface. | Yes (inline) |
| `Bun.stringWidth(s)` | 8 | `string-width` (npm, ~1 KB minified, zero deps as of v8). Inlining a correct implementation (emoji, CJK, ANSI, ZWJ) is ~150 lines and well-trodden. | **Dep** |
| `Bun.stripANSI(s)` | 2 | small SGR-only regex inline. The CLI's only use is internal-logger normalization, where SGR-only is sufficient. | Yes (inline) |

**Shim:** `node-compat/ansi.ts` exposing `color(spec)`, `stripAnsi(s)`,
re-exporting `stringWidth` from the npm package.

### 4.5 Globs — `Bun.Glob`

2 sites in `cmd/cloud/sandbox/snapshot/build.ts`:

```ts
const glob = new Bun.Glob(pattern);
for await (const file of glob.scan({ cwd, dot: true })) { … }
```

Node 24 ships `fs.glob` / `fs.globSync` (stable in 24). Both call sites
use basic `**/*` patterns and async iteration:

```ts
import { glob } from 'node:fs/promises';
for await (const file of glob(pattern, { cwd })) { … }
```

**No dependency.**

### 4.6 Crypto — `Bun.CryptoHasher`, `Bun.hash.xxHash64`

| Site | Bun | Replacement |
|---|---|---|
| `cmd/build/ids.ts:9` | `new Bun.CryptoHasher('sha1')` | `crypto.createHash('sha1')` |
| `cmd/ai/prompt/version.ts:17` | `new Bun.CryptoHasher('sha256')` | `crypto.createHash('sha256')` |
| `domain.ts:107` | `Bun.hash.xxHash64(projectId).toString(16).padStart(16, '0')` | xxHash is **not** in `node:crypto`. Use 16-hex-digit truncated SHA-256: `crypto.createHash('sha256').update(projectId).digest('hex').slice(0, 16)`. Output format unchanged (16 hex chars). |

The xxHash64 → SHA-256 truncation is a **deterministic** behavior change:
local cache keys computed under Node will differ from those under Bun.
The site is a project-id domain hash used for cache lookup only — not
security-relevant. Documented in §8.

**Shim:** `node-compat/crypto.ts` exposing `sha256Hex(s)`, `sha1Hex(s)`,
`shortHash16(s)`. **No dependency.**

### 4.7 YAML — `import { YAML } from 'bun'`

2 sites: `config.ts`, `cmd/cloud/sandbox/snapshot/build.ts`.

Node has no built-in YAML. **Add dep `yaml@^2`** (already a transitive
dep in `bun.lock`). `Bun.YAML.parse(s)` and `Bun.YAML.stringify(o)` map
1:1 to `yaml.parse(s)` and `yaml.stringify(o)`.

### 4.8 Semver — `import { semver } from 'bun'`

1 site: `runtime.ts`. **Add dep `semver@^7`** (already transitive).
Bun's `semver.satisfies(a, b)` and `semver.order(a, b)` map to
`semver.satisfies(version, range)` and `semver.compare(a, b)`. Verify the
call surface during migration; it's a single file.

### 4.9 S3 — `import { S3Client } from 'bun'`

→ Extracted into a dedicated `@agentuity/storage` package. **See §6.**

### 4.10 `Bun.which(cmd)`

4 sites: `sound.ts`, `git-helper.ts`, `utils/git.ts`, `bun-path.ts`.

Node has no built-in `which`. **Inline a ~15-line implementation** in
`node-compat/which.ts`: walk `PATH`, check `access(path, X_OK)`, handle
Windows `PATHEXT`. **No dependency.**

### 4.11 `Bun.stdin.text()` and `Bun.stdin.stream()`

4 sites in `cmd/auth/{org/enroll,ssh/add}.ts` (text), and
`cmd/cloud/{vector/upsert,stream/create,storage/upload}.ts` (stream).

| Bun | Node 24 native |
|---|---|
| `await Bun.stdin.text()` | `await text(process.stdin)` from `node:stream/consumers` |
| `Bun.stdin.stream()` (Web `ReadableStream`) | `Readable.toWeb(process.stdin)` |

**Shim:** `node-compat/stdin.ts` exposing `readStdinText()` and
`stdinWebStream()`. **No dependency.**

### 4.12 `Bun.serve`

Two mentions:

- `cmd/project/templates/vite-react/server.ts` — **out of scope**
  (scaffolded into user projects, runs in their runtime).
- `cmd/build/adapters/static-server.ts:19` — **comment only.**

No CLI prod-code work needed.

### 4.13 `Bun.version`, `Bun.revision`, `Bun.main`, `import.meta.dir`

| Bun | Node 24 native |
|---|---|
| `Bun.version` | `process.versions.bun` (undefined under Node) — wrap behind a `runtime.ts` helper that returns either `bun-${version}` or `node-${process.versions.node}`. |
| `Bun.revision` | Embedded only in the Bun build. Under Node, return the build-time-injected git SHA from `package.json` metadata, or `'unknown'` (existing fallback). |
| `Bun.main` | `process.argv[1]` (or `fileURLToPath(import.meta.url)` for the entry module). |
| `import.meta.dir` | `path.dirname(fileURLToPath(import.meta.url))`. |

**Shim:** `node-compat/runtime-info.ts` exposing `runtimeKind()`,
`runtimeVersion()`, `entryScriptPath()`, `gitSha()`. Files that need
their own directory use a local `__dirname` constant. **No dependency.**

### 4.14 `Bun.Loader` (type only)

`cmd/build/patch/index.ts:24`. Replace with the literal union directly:

```ts
type LoaderKind = 'js' | 'jsx' | 'ts' | 'tsx';
```

Inline. **No dependency.**

### 4.15 Shebang — `#!/usr/bin/env bun`

Per direction: detect bun-or-node at install time. Approach options
captured in §9 Open Question 1.

---

## 5. Proposed `node-compat` shim layer

To minimize churn at every call site, introduce a small compat module
inside the CLI:

```text
packages/cli/src/node-compat/
├── index.ts           // re-exports
├── fs.ts              // pathExists, readText, readJson, writeText,
│                      // writeBytes, streamToFile, copyFileTo
├── proc.ts            // run(), spawnInherit(), waitFor()
├── timers.ts          // sleep()
├── ansi.ts            // color(), stripAnsi(); re-exports stringWidth
├── stdin.ts           // readStdinText(), stdinWebStream()
├── runtime-info.ts    // runtimeKind(), runtimeVersion(),
│                      // entryScriptPath(), gitSha()
├── which.ts           // which()
└── crypto.ts          // sha256Hex(), sha1Hex(), shortHash16()
```

`yaml`, `semver` are imported directly where used (no shim — single-site
dependencies).

`@agentuity/storage` is its own workspace package (§6), not part of the
shim layer.

Migration is one PR per area:

1. Add shims, add deps, no behavior change.
2. Migrate `config.ts` + `auth.ts` (heaviest single chunks).
3. Migrate `cmd/cloud/*` (excluding `storage/`, which moves to
   `@agentuity/storage`).
4. Migrate `cmd/build/*`.
5. Migrate `cmd/project/*`, `cmd/coder/*`, `cmd/support/*`.
6. Migrate `tui.ts` + `banner.ts` + `tui/box.ts` (TUI / ANSI).
7. Switch shebang + `bin` field, add Node-versions matrix to CI.
8. Remove `bun-types` runtime references where no longer needed (keep
   for `test/`, `scripts/`).

---

## 6. Dedicated `@agentuity/storage` package

### 6.1 Why a dedicated package

Three reasons to extract S3 from the CLI rather than rolling it into the
`node-compat` shim:

1. **Bun's `S3Client` is meaningfully faster than `@aws-sdk/client-s3`**
   for large uploads (the primary use case). Bun users running
   `agentuity cloud storage upload large.zip` should keep that
   performance — we shouldn't downgrade everyone to the AWS SDK just to
   support Node.
2. **The S3 surface is the only Bun-typed import remaining** in the CLI
   after every other Bun API gets shimmed or replaced. Quarantining it
   in a separate package means the CLI's own source becomes
   Bun-global-free, which is a cleaner end state than scattered
   `if (typeof Bun !== 'undefined')` branches.
3. **Future reuse.** Other packages or downstream SDK consumers may want
   the same dual-runtime client (e.g. `@agentuity/sandbox` if it ever
   needs direct S3, or third-party tools building on top of Agentuity
   storage credentials).

### 6.2 Package layout

```text
packages/storage/
├── package.json
├── README.md
├── AGENTS.md
├── tsconfig.json
└── src/
    ├── index.ts        // runtime-detect entry: re-exports from ./bun or ./node
    ├── bun.ts          // Bun.S3Client backend (Bun-only, gated by exports)
    ├── node.ts         // @aws-sdk/client-s3 backend (works on both runtimes)
    └── types.ts        // S3ClientLike interface, BucketConfig, response shapes
```

### 6.3 `package.json` shape

```jsonc
{
  "name": "@agentuity/storage",
  "version": "3.0.0-alpha.7",   // matches workspace
  "license": "Apache-2.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["AGENTS.md", "README.md", "src", "dist"],
  "exports": {
    ".": {
      // Bun resolves the "bun" condition first; everything else lands on "node".
      "bun": {
        "types": "./dist/bun.d.ts",
        "import": "./dist/bun.js"
      },
      "node": {
        "types": "./dist/node.d.ts",
        "import": "./dist/node.js"
      },
      "default": {
        "types": "./dist/node.d.ts",
        "import": "./dist/node.js"
      }
    },
    "./bun": {
      "types": "./dist/bun.d.ts",
      "import": "./dist/bun.js"
    },
    "./node": {
      "types": "./dist/node.d.ts",
      "import": "./dist/node.js"
    }
  },
  "scripts": {
    "clean": "rm -rf dist tsconfig.tsbuildinfo",
    "build": "bunx tsc --build --force",
    "typecheck": "bunx tsc --noEmit",
    "prepublishOnly": "bun run clean && bun run build"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "^3"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "bun-types": "latest",
    "typescript": "^5.9.0"
  },
  "publishConfig": { "access": "public" },
  "sideEffects": false,
  "repository": {
    "type": "git",
    "url": "git+https://github.com/agentuity/sdk.git",
    "directory": "packages/storage"
  }
}
```

The `exports` shape uses Node's [conditional exports]. The `"bun"`
condition resolves only under Bun's resolver; everything else (Node,
bundlers, TypeScript) hits `"node"` / `"default"`. Combined with the
explicit `./bun` and `./node` subpaths, callers have three modes:

```ts
// Auto-detect (bare import). Bun gets ./bun, Node gets ./node.
import { createS3Client } from '@agentuity/storage';

// Pin to Bun (max throughput; only resolvable under Bun).
import { createS3Client } from '@agentuity/storage/bun';

// Pin to Node (resolvable under both Bun and Node; uses AWS SDK).
import { createS3Client } from '@agentuity/storage/node';
```

> **Note on the `"bun"` exports condition.** Bun honors the `"bun"`
> condition by default; Node ignores it. This is the same mechanism Bun
> itself documents for runtime-specific entry points. We do **not** rely
> on a custom `--conditions` flag.

### 6.4 Public API (shared interface)

`src/types.ts`:

```ts
export interface BucketConfig {
  endpoint: string;          // e.g. "bucket-name.agentuity.run"
  access_key: string;
  secret_key: string;
  region?: string | null;
}

export interface S3ListOptions {
  prefix?: string;
  maxKeys?: number;
}

export interface S3Object {
  key: string;
  size: number;
  lastModified: string;       // ISO8601 — normalized; Bun returns Date, AWS SDK returns Date, we always emit string
  etag?: string;
}

export interface S3ListResult {
  contents: S3Object[];
  isTruncated: boolean;
}

export interface S3StatResult {
  size: number;
  type?: string;              // Content-Type
  lastModified?: Date;
  etag?: string;
}

export interface S3WriteOptions {
  type?: string;              // Content-Type
}

/** Anything we can stream to S3. */
export type S3Body =
  | Uint8Array
  | ArrayBuffer
  | Blob
  | ReadableStream<Uint8Array>
  | Buffer
  | string;

export interface S3FileLike {
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  stream(): ReadableStream<Uint8Array>;
}

export interface S3ClientLike {
  list(opts?: S3ListOptions | null): Promise<S3ListResult>;
  stat(key: string): Promise<S3StatResult>;
  file(key: string): S3FileLike;
  /** Returns number of bytes uploaded. */
  write(key: string, body: S3Body, opts?: S3WriteOptions): Promise<number>;
  delete(key: string): Promise<void>;
}

export function createS3Client(bucket: BucketConfig): S3ClientLike;
```

### 6.5 `src/bun.ts` — Bun backend

Thin wrapper around `Bun.S3Client`. Implements `S3ClientLike` by
delegating to the native client. Handles the same option translation as
today's `cmd/cloud/storage/utils.ts`:

```ts
import { S3Client } from 'bun';
import type { BucketConfig, S3ClientLike } from './types';

export function createS3Client(bucket: BucketConfig): S3ClientLike {
  const client = new S3Client({
    endpoint: bucket.endpoint.startsWith('http')
      ? bucket.endpoint
      : `https://${bucket.endpoint}`,
    accessKeyId: bucket.access_key,
    secretAccessKey: bucket.secret_key,
    region: bucket.region || 'auto',
    virtualHostedStyle: true,
  });
  return {
    list: (opts) => client.list(opts ?? null) as Promise<S3ListResult>,
    stat: (key) => client.stat(key),
    file: (key) => client.file(key),
    write: (key, body, opts) =>
      client.write(key, body as never, opts as never),
    delete: (key) => client.delete(key),
  };
}
```

### 6.6 `src/node.ts` — Node backend

Implements `S3ClientLike` over `@aws-sdk/client-s3`. The bucket's
endpoint is virtual-host-style, so we configure the SDK accordingly:

```ts
import {
  S3Client,
  ListObjectsV2Command,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import type { BucketConfig, S3ClientLike, S3Body } from './types';

export function createS3Client(bucket: BucketConfig): S3ClientLike {
  const endpoint = bucket.endpoint.startsWith('http')
    ? bucket.endpoint
    : `https://${bucket.endpoint}`;
  // Endpoint is bucket-specific (virtual-host style). The bucket name in
  // the URL is the hostname, so we MUST pass forcePathStyle: false.
  const client = new S3Client({
    endpoint,
    region: bucket.region || 'auto',
    credentials: {
      accessKeyId: bucket.access_key,
      secretAccessKey: bucket.secret_key,
    },
    forcePathStyle: false,
  });
  // Bucket is implicit in the endpoint, but the SDK still requires a
  // Bucket parameter on every command. Use a sentinel; the endpoint
  // overrides it on the wire.
  const Bucket = bucket.endpoint.split('.')[0];

  return {
    async list(opts) {
      const out = await client.send(
        new ListObjectsV2Command({
          Bucket,
          Prefix: opts?.prefix,
          MaxKeys: opts?.maxKeys,
        }),
      );
      return {
        contents: (out.Contents ?? []).map((o) => ({
          key: o.Key!,
          size: o.Size ?? 0,
          lastModified: o.LastModified?.toISOString() ?? '',
          etag: o.ETag,
        })),
        isTruncated: out.IsTruncated ?? false,
      };
    },
    async stat(key) {
      const out = await client.send(
        new HeadObjectCommand({ Bucket, Key: key }),
      );
      return {
        size: out.ContentLength ?? 0,
        type: out.ContentType,
        lastModified: out.LastModified,
        etag: out.ETag,
      };
    },
    file(key) {
      return {
        async arrayBuffer() {
          const out = await client.send(
            new GetObjectCommand({ Bucket, Key: key }),
          );
          const stream = out.Body as Readable;
          const chunks: Buffer[] = [];
          for await (const c of stream) {
            chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
          }
          return Buffer.concat(chunks).buffer;
        },
        async text() {
          const ab = await this.arrayBuffer();
          return new TextDecoder().decode(ab);
        },
        stream() {
          // Lazy: open the stream on first read.
          let inner: ReadableStream<Uint8Array> | null = null;
          return new ReadableStream({
            async pull(controller) {
              if (!inner) {
                const out = await client.send(
                  new GetObjectCommand({ Bucket, Key: key }),
                );
                inner = Readable.toWeb(out.Body as Readable) as
                  ReadableStream<Uint8Array>;
              }
              const reader = inner.getReader();
              const { value, done } = await reader.read();
              if (done) controller.close();
              else controller.enqueue(value);
              reader.releaseLock();
            },
          });
        },
      };
    },
    async write(key, body, opts) {
      const Body = await normalizeBody(body);
      const out = await client.send(
        new PutObjectCommand({
          Bucket,
          Key: key,
          Body,
          ContentType: opts?.type,
        }),
      );
      // PutObject doesn't return bytes uploaded; we track separately.
      return body instanceof Uint8Array || body instanceof ArrayBuffer
        ? body.byteLength
        : Buffer.isBuffer(body)
          ? body.length
          : 0; // TODO: count bytes for streaming bodies via a counting passthrough.
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },
  };
}

async function normalizeBody(body: S3Body) {
  if (body instanceof ReadableStream) {
    return Readable.fromWeb(body as never);
  }
  return body;
}
```

> **Implementation notes:**
> - The `Bucket` sentinel works because the `endpoint` URL fully
>   specifies the bucket; the SDK appends `Key` but the `Host` header
>   already routes to the right bucket.
> - `PutObjectCommand` does not return the byte count, unlike Bun's
>   `S3Client.write`. The Node backend tracks bytes via a counting
>   passthrough stream when `body` is a stream. A small wrapper handles
>   this.
> - `Readable.toWeb()` and `Readable.fromWeb()` are the only Node 24
>   APIs we need to bridge between WHATWG and Node streams; both are
>   stable in Node 24.

### 6.7 `src/index.ts` — runtime-detect default

```ts
// The "bun" / "node" / "default" exports conditions in package.json
// already pick the right module at resolve time. This file exists only
// for tooling that doesn't honor conditions (pre-bundled output, some
// IDEs). The real selection happens in package.json.
export * from './node';
```

The bare `@agentuity/storage` import resolves to `./bun.js` under Bun
and `./node.js` under Node — automatic. The `index.ts` fallback
re-exports the Node backend so even resolvers that ignore conditions
end up with a working import.

### 6.8 CLI integration

`packages/cli/src/cmd/cloud/storage/utils.ts` becomes a one-line
re-export:

```ts
export { createS3Client } from '@agentuity/storage';
```

The four call sites in `cmd/cloud/storage/{upload,download,list,delete}.ts`
stay unchanged because the `S3ClientLike` interface preserves the method
shapes they already use.

The single Bun-isolated change is in `upload.ts:191`, where today's
`new Response(stream)` body is wrapped. With `S3ClientLike`'s `S3Body`
type accepting `ReadableStream<Uint8Array>` directly, the wrap goes
away:

```ts
// before
bytesUploaded = await s3Client.write(objectKey, new Response(stream), {
  type: contentType,
});

// after
bytesUploaded = await s3Client.write(objectKey, stream, {
  type: contentType,
});
```

### 6.9 `AGENTS.md` (`packages/storage/AGENTS.md`)

Following the convention of every other service-client package:

```markdown
# Agent Guidelines for @agentuity/storage

## Package Overview

S3 client for Agentuity storage buckets. Provides a unified `S3ClientLike`
interface backed by Bun's native `S3Client` (faster) or `@aws-sdk/client-s3`
(works under Node).

## Architecture

- **Runtime**: Node.js and Bun compatible
- **Backend selection**: package.json `exports` conditions select `./bun.js`
  under Bun and `./node.js` under Node automatically. Subpath imports
  `@agentuity/storage/bun` and `@agentuity/storage/node` are also available
  for explicit pinning.
- **Dependencies**: `@aws-sdk/client-s3` (only loaded by the Node backend).

## Usage

\```ts
import { createS3Client } from '@agentuity/storage';

const s3 = createS3Client({
  endpoint: 'my-bucket.agentuity.run',
  access_key: '...',
  secret_key: '...',
});

const list = await s3.list({ prefix: 'logs/' });
\```

## Publishing

Must publish **after** @agentuity/core (no direct dep, but the workspace
publish order treats it as part of the standard cohort). Must publish
**before** @agentuity/cli.
```

---

## 7. New dependencies

### 7.1 New workspace package

| Workspace package | Why |
|---|---|
| `@agentuity/storage` | Dual-runtime S3 client. `/bun` uses Bun.S3Client; `/node` uses @aws-sdk/client-s3; bare entry uses package.json conditions. |

### 7.2 Direct deps in `packages/storage/package.json`

| Package | Why | Approx size |
|---|---|---:|
| `@aws-sdk/client-s3` | Node backend | ~1 MB (loaded only when Node runtime detected) |

### 7.3 Direct deps in `packages/cli/package.json`

| Package | Why | Approx size |
|---|---|---:|
| `string-width` | TUI alignment, correctness-critical | ~1 KB |
| `yaml` | Replace `Bun.YAML` | already transitive |
| `semver` | Replace `Bun.semver` | already transitive |
| `@agentuity/storage` | Dual-runtime S3 client (workspace dep) | n/a |

Everything else (file I/O, spawn, sleep, glob, crypto, which, ANSI strip,
stdin) is **handled with Node 24 natives + small inline helpers** in
`packages/cli/src/node-compat/`. **No additional deps.**

---

## 8. Risk / behavior-change watch list

Things that might surprise users mid-migration:

1. **`Bun.hash.xxHash64` → SHA-256 truncation in `domain.ts`.** Cache
   keys computed under Node will not match cache keys computed under
   Bun. This only affects local-machine cache invalidation (one-time
   re-cache).
2. **`Bun.file(...)` as `fetch` body.** Bun sets `Content-Length`
   automatically; under Node we must either buffer (small files) or set
   `'content-length'` explicitly when streaming. Audit each `fetch` /
   upload site during migration.
3. **`Bun.spawn` returns an awaitable `proc.exited`** that resolves to
   the exit code. Node's `child_process.spawn` requires manual `'exit'`
   / `'close'` event handling. The `run()` helper wraps this.
4. **`Bun.color('name', 'ansi-16m')`** returns a 24-bit color escape;
   named colors map to the 16-color palette in Bun. Our replacement
   must mirror this so banner gradients don't shift.
5. **`process.stdin.unref()` / `setRawMode()`** — `bin/cli.ts` already
   special-cases this for Bun; under Node it's natively supported, so
   we should be able to *remove* the explicit `process.exit()`
   workaround once running under Node.
6. **TLS / HTTP client behavior.** Bun's `fetch` is ~2x faster than
   Node's undici; for `agentuity cloud deploy` the difference may show
   up in upload throughput. Not blocking; worth measuring.
7. **YAML formatter output.** `yaml` (npm) and `Bun.YAML.stringify`
   produce slightly different formatting (key ordering, anchor
   handling). Verify any YAML the CLI *writes* round-trips identically,
   or document the intentional change.
8. **S3 byte counting on Node uploads.** Bun's `S3Client.write` returns
   bytes uploaded; AWS SDK does not. The Node backend wraps stream
   bodies in a counting passthrough. For non-stream bodies
   (`Uint8Array`, `Buffer`, `string`) we use `.byteLength`. Verify
   parity in the upload progress UI.
9. **AWS SDK bundle weight.** Adding `@aws-sdk/client-s3` to a CLI tool
   is ~1 MB on disk. Acceptable for a CLI install; we should still
   monitor cold-start time on commands that don't use storage (i.e.
   make sure `import 'storage'` doesn't pull `@aws-sdk` eagerly when
   `cmd/cloud/storage/*` isn't invoked). The `node` subpath module
   imports it at top level today; consider a lazy `import()` if
   benchmarks show cold-start regression.

---

## 9. Open questions

1. **Shebang strategy.** Per direction: detect bun-or-node at install
   time. Shape options:
   - **A)** `bin: "./bin/agentuity"` wrapper script (POSIX sh +
     `.cmd`) that picks the runtime per invocation.
   - **B)** `bin: "./dist/cli.js"` with `#!/usr/bin/env node`, plus a
     postinstall script that swaps in a Bun shebang if `bun` is
     detected at install time.
   - **C)** `bin: "./dist/cli.js"` always Node, document that Bun
     users get no special treatment (simplest).
   Prefer **(A)**: only one that truly auto-detects per-run. Confirm
   before migration starts.

2. **`bun-types` in `package.json`.** Keep as `devDependency` (tests /
   scripts still use Bun) but stop importing `bun-types` from prod
   source. Verify no `tsconfig.json` `types: ["bun-types"]` leaks Bun
   globals into prod build.

3. **VS Code extension's CLI calls.** `packages/vscode/` shells out to
   the `agentuity` binary. After migration, verify the extension still
   works when the CLI runs under Node.

4. **CI matrix.** Currently CI runs the CLI under Bun only. Add a
   Node-24 row to `release-next.yaml` (`bun run test:unit` already
   passes; we'd need a `node` test target for the migrated subset) —
   or run a smoke suite (`agentuity --help`, `agentuity auth whoami`,
   `agentuity --version`) under both runtimes to catch regressions.

5. **Self-update flow.** `cmd/upgrade/` re-invokes the CLI; verify that
   running under Node still finds the right entrypoint and the right
   runtime is preserved across the re-exec.

6. **`@agentuity/storage` package shape.** Confirmed: extract into a
   new workspace package with `/bun` and `/node` subpath exports plus
   a `bun`-condition default. Sub-decisions for review:
   - Package name `@agentuity/storage` (vs `@agentuity/s3` — chose
     `storage` to mirror `@agentuity/core`'s `services/storage/`
     naming).
   - Whether `S3ClientLike` exposes a thin wrapper API (current
     proposal) or re-exports each backend's native types and lets
     callers branch. The thin wrapper is portable; native types are
     closer to zero-cost.
   - Whether the package should also offer a higher-level API (e.g.
     `streamUpload(bucket, key, source)`) so `storage/upload.ts` can
     drop the manual `Response`-wrapping it does today. Probably yes;
     defer to follow-up.

7. **Bytes-uploaded reporting under Node.** Today's `upload.ts` shows a
   "(1234 bytes)" success message using the value returned by Bun's
   `s3Client.write`. The Node backend can match this for non-stream
   bodies but needs a counting passthrough for streams. Acceptable to
   ship without exact byte counts on streamed uploads in the first
   Node release? (Set the field to `0` and update the success message
   to omit the count when bytes are unknown.)

---

## 10. Migration checklist

### Phase 0 — Foundation (this branch, no behavior change)

- [ ] Branch `cli/node-compat` cut from `v3` (done).
- [ ] Land this `PLAN.md` (done by this commit).
- [ ] Resolve Open Questions 1, 6, 7 with the team.

### Phase 1 — `@agentuity/storage` extraction

- [ ] Create `packages/storage/` (package.json, AGENTS.md, README.md,
      tsconfig.json, src/).
- [ ] Implement `src/types.ts` (`S3ClientLike`, `BucketConfig`, etc.).
- [ ] Implement `src/bun.ts` (thin wrapper around `Bun.S3Client`).
- [ ] Implement `src/node.ts` (over `@aws-sdk/client-s3`, with
      counting passthrough for streamed uploads).
- [ ] Implement `src/index.ts` (re-export the Node backend as the
      condition-fallback).
- [ ] Add to workspace, run `bun install`, verify build under both
      Bun and Node.
- [ ] Add a smoke test that exercises both backends against a local
      MinIO container (or mock).

### Phase 2 — CLI compat shim

- [ ] Add `packages/cli/src/node-compat/` shim modules (no behavior
      change).
- [ ] Add deps to `packages/cli`: `string-width`, `yaml`, `semver`,
      `@agentuity/storage` (workspace).

### Phase 3 — CLI source migration (one PR per chunk)

- [ ] `cmd/cloud/storage/utils.ts` switches to
      `import { createS3Client } from '@agentuity/storage'` (one-line).
      Verify `upload.ts`, `download.ts`, `list.ts`, `delete.ts` work
      unchanged.
- [ ] Migrate `config.ts`, `auth.ts`.
- [ ] Migrate `cmd/cloud/**` (excluding `storage/`).
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

### Phase 4 — entrypoint + CI

- [ ] Update shebang and `bin` field per Open Question 1.
- [ ] Add Node-24 row to `release-next.yaml`.
- [ ] Smoke test: `agentuity --version`, `agentuity --help`,
      `agentuity auth whoami`, `agentuity cloud deploy --dry-run`,
      `agentuity dev`, `agentuity cloud sandbox list`,
      `agentuity cloud storage list`, `agentuity cloud storage upload`,
      `agentuity cloud storage download` — under both Bun and Node.

### Phase 5 — cleanup

- [ ] Update `packages/cli/AGENTS.md` with the new convention (no Bun
      globals in prod source).
- [ ] Update `packages/storage/AGENTS.md` with publish ordering note.
- [ ] Remove this `PLAN.md` (or move to `packages/cli/AGENTS.md` as
      historical context).

[conditional exports]: https://nodejs.org/api/packages.html#conditional-exports
