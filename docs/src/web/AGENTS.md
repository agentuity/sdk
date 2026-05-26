# Web Folder Guide

This folder contains the TanStack Start docs app and React-based SDK Explorer UI.

## Frontend Guidelines

- Keep Explorer UI code close to standard React and browser APIs unless a nearby component already establishes a stronger pattern.
- Treat `code-examples.ts` as the public reference surface. Snippets there should match the current docs and be safe for readers to copy.
- Keep live-demo implementation details out of public copy when they only exist for compatibility with older Explorer internals.
- After adding a route under `src/web/routes`, regenerate TanStack route output before typechecking.
- After adding a sandbox script under `src/run`, run `bun run generate:scripts` from `docs/`.

## Directory Structure

Important files:

```text
src/web/
├── App.tsx              # Root app shell
├── router.tsx           # TanStack Router setup
├── routeTree.gen.ts     # Generated route tree
├── routes/              # TanStack route files
│   ├── _docs/           # Public docs routes
│   ├── explorer/        # SDK Explorer routes
│   └── demo/            # Shared demo routes
├── content/             # MDX docs content and meta.json files
├── demo-config.tsx      # SDK Explorer demo registry
├── code-examples.ts     # Reference snippets displayed in Explorer
├── test-outputs.ts      # Test-mode output fixtures
├── hooks/
│   └── useSandboxRunner.ts  # SSE-based sandbox execution
├── components/
│   ├── docs/                # Docs layout, cards, navigation, MDX rendering
│   ├── demo-view.tsx        # Shared Explorer page wrapper
│   ├── CodeBlock.tsx        # Code display and run button
│   ├── TerminalOutput.tsx   # Streaming output display
│   └── *Demo.tsx            # Explorer demo components
├── public/              # Root-served static assets
└── status/
    └── route.ts         # Health check route
```

## Route Patterns

Docs routes wrap MDX content with `MDXPage`:

```typescript
import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/services/example')({
	component: () => <MDXPage route="services/example" />,
	staticData: { crumb: 'Example' },
});
```

Explorer routes usually delegate to the shared `DemoView`:

```typescript
import { createFileRoute } from '@tanstack/react-router';
import { DemoView } from '../../components/demo-view';

export const Route = createFileRoute('/explorer/example')({
	component: () => <DemoView demoId="example" />,
	staticData: { crumb: 'Demo' },
});
```

## SDK Explorer Components

### Demo Registry

Add Explorer demos in `demo-config.tsx`. Keep these values in sync:

- `DemoId` union
- `DEMOS` entry
- `routes/explorer/{id}.tsx`
- `CODE_EXAMPLES` entry
- sandbox script name and default input, when the demo can run in a sandbox

### useSandboxRunner Hook

Custom hook for executing scripts in cloud sandboxes via SSE:

```typescript
import { useSandboxRunner } from './hooks/useSandboxRunner';

function MyDemo() {
    const { state, run } = useSandboxRunner();

    const handleRun = () => {
        run('hello', { name: 'World' }); // script name, input object
    };

    return (
        <div>
            <button onClick={handleRun} disabled={state.status === 'running'}>
                Run
            </button>
            <TerminalOutput
                status={state.status}
                output={state.output}
                exitCode={state.exitCode}
            />
        </div>
    );
}
```

**Returns:**

- `state.status`: 'idle' | 'creating' | 'recreating' | 'running' | 'completed' | 'error'
- `state.output`: Streamed stdout content
- `state.error`: Error message if failed
- `state.exitCode`: Process exit code when completed
- `run(script, input)`: Execute a script in the sandbox
- `stop()`: Stop the current execution
- `reset()`: Reset state to idle

### CodeBlock Component

Monaco editor wrapper with copy and run buttons:

```typescript
import { CodeBlock } from './components/CodeBlock';

<CodeBlock
    code={codeString}
    title="Example"
    showRunButton={true}
    onRun={() => sandbox.run('scriptName', input)}
    isRunning={state.status === 'running'}
    highlights={[
        { lines: [5, 10], className: 'important' },
        { lines: 15, className: 'subtle' },
    ]}
/>;
```

### TerminalOutput Component

Displays sandbox execution status and streaming output:

```typescript
import { TerminalOutput } from './components/TerminalOutput';

<TerminalOutput
    status={status} // 'idle' | 'creating' | 'running' | 'completed' | 'error'
    output={output} // string
    exitCode={exitCode} // number | null
    isRoute={false} // affects status text ("Executing agent" vs "Calling route")
/>;
```

## Demo Configuration

Demos are configured in `demo-config.tsx`:

```typescript
interface DemoConfig {
	id: DemoId; // route segment: /explorer/hello
	title: string; // Display name
	subtitle: string; // Short tagline
	description: string; // Landing page description
	explanation: React.ReactNode; // Educational content
	docsUrl?: string; // Link to docs
	category: 'basics' | 'services' | 'io-patterns' | 'examples';
	component: React.ComponentType; // Demo component
	codeExample: string; // Code to display
	sandboxEnabled?: boolean; // Can run in sandbox
	sandboxScript?: string; // Script name in scripts.ts
	sandboxInput?: unknown; // Default input
	codeHighlights?: LineHighlight[];
	isRoute?: boolean; // Route vs agent demo
}
```

## Static Assets

Agentuity uses standard Vite asset conventions. There are two ways to
reference static files:

### Import the asset (recommended for JS/TSX)

```typescript
import logoUrl from './assets/logo.svg';

export function Header() {
	return <img src={logoUrl} alt="Logo" />;
}
```

Vite emits a content-hashed copy and replaces the import with the final URL
(including the production CDN).

### Use `publicDir` for root-served files

Files under `src/web/public/` are served at the URL root, **without** a
`/public/` prefix:

```
src/web/public/
├── favicon.ico      # served at /favicon.ico
├── robots.txt       # served at /robots.txt
└── styles.css       # served at /styles.css
```

```html
<!-- In index.html, Vite rewrites root paths to the CDN in production -->
<link rel="stylesheet" href="/styles.css" />
<script src="/script.js"></script>
<link rel="icon" href="/favicon.ico" />
```

> Do not use a `/public/` prefix. That path is not served and will 404 in
> production. This is enforced by a build-time lint.

## Styling

Use the existing Tailwind and component patterns before adding new styling approaches. Keep route-level layout in route components and reusable UI in `components/`.

## Best Practices

- Prefer shared docs components from `components/docs/` for MDX routes.
- Prefer `DemoView` plus `demo-config.tsx` for Explorer pages.
- Keep displayed snippets in `code-examples.ts` aligned with the docs page for the same feature.
- Use `useSandboxRunner` for sandbox-backed demos and plain browser APIs for route calls when no shared hook already exists.
- Keep compatibility-only implementation details in comments or internal docs, not in public UI copy.

## Rules

- Route files under `routes/` should use `createFileRoute`.
- Regenerate route output after adding or renaming route files.
- Run `bun run generate:scripts` after adding or renaming sandbox scripts.
- Files in `src/web/public/` are served at the URL root (`/filename`, not `/public/filename`).
- For assets referenced from JS/TSX, use `import url from './path.svg'` instead of a `/public/...` string literal.
