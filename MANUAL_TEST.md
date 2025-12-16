# Manual Testing Guide - Vite Dev Mode

## Prerequisites

1. Build the SDK:

```bash
cd /Users/jhaynie/code/agentuity/worktree/refactor-to-vite/sdk
bun run build
```

2. Copy packages to test app:

```bash
TEST_APP="/Users/jhaynie/tmp/v1/testing-9"
rm -rf "$TEST_APP/node_modules/@agentuity"
mkdir -p "$TEST_APP/node_modules/@agentuity"
for pkg in cli core react runtime schema server workbench; do
  cp -r packages/$pkg "$TEST_APP/node_modules/@agentuity/"
done
```

## Start Dev Server

```bash
cd /Users/jhaynie/tmp/v1/testing-9
bun run dev
```

You should see:

```
╭───────────────────────────────────╮
│ ⨺ Agentuity DevMode               │
│                                   │
│ Local:      http://127.0.0.1:3500 │
│ Public:     Disabled              │
│ Workbench:  Disabled              │
│ Dashboard:  Disabled              │
│ HMR:        Enabled               │
│                                   │
│ Press h for keyboard shortcuts    │
╰───────────────────────────────────╯

[INFO] Starting Vite dev server with HMR...
[INFO] Dev server running on http://localhost:3500
[INFO] Client HMR enabled via @hono/vite-dev-server
[INFO] Server HMR enabled - changes to app.ts will reload automatically
```

## Test Endpoints

### In another terminal:

**Test GET /** (should return HTML with Vite HMR scripts):

```bash
curl -s http://localhost:3500/ | head -20
```

Expected output:

```html
<!DOCTYPE html>
<html lang="en">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>Agentuity App</title>
	</head>
	<body>
		<div id="root"></div>
		<script type="module" src="/@vite/client"></script>
		...
	</body>
</html>
```

**Test POST /api/hello**:

```bash
curl -s -X POST -H "Content-Type: application/json" -d '{"name":"World"}' http://localhost:3500/api/hello
```

Expected output:

```
"Hello, World! Welcome to Agentuity 🤖."
```

**Test GET /api/hello** (should 404):

```bash
curl -s http://localhost:3500/api/hello
```

Expected output:

```
404 Not Found
```

## Test HMR (Hot Module Reload)

### Test 1: Modify API Route

1. Edit `src/api/hello/index.ts`
2. Change line 13 from:

```typescript
return `Hello, ${data.name}! Welcome to Agentuity 🤖.`;
```

to:

```typescript
return `HMR WORKS! Hello, ${data.name}! Welcome to Agentuity 🤖.`;
```

3. Save the file
4. Watch the terminal - you should see Vite recompiling
5. Test the endpoint again:

```bash
curl -s -X POST -H "Content-Type: application/json" -d '{"name":"World"}' http://localhost:3500/api/hello
```

Expected output:

```
"HMR WORKS! Hello, World! Welcome to Agentuity 🤖."
```

### Test 2: Modify app.ts

1. Edit `app.ts`
2. Change the debug message from:

```typescript
logger.debug('Running %s', server.url);
```

to:

```typescript
logger.debug('HMR TEST - Running %s', server.url);
```

3. Save the file
4. Watch the terminal - you should see the server reload
5. Check the logs show the new message

## Verify Generated Files

Check that the generated files exist:

```bash
ls -la .agentuity/
```

Expected files:

- `agentuity_app.generated.ts` - Generated entry file
- `.vite/vite.config.ts` - Generated Vite config
- `registry.generated.ts` - Agent registry
- `route-registry.generated.ts` - Route registry

View the generated entry file:

```bash
cat .agentuity/agentuity_app.generated.ts
```

Should contain:

- Router creation
- `globalThis.__AGENTUITY_ROUTER__ = app;`
- Import of `../app.ts`
- Route mounting
- Web routes with Vite HMR scripts
- Fetch wrapper for initialization

View the generated Vite config:

```bash
cat .agentuity/.vite/vite.config.ts
```

Should contain:

- `agentuityPlugin` configuration
- `devServer` plugin pointing to `.agentuity/agentuity_app.generated.ts`
- User plugin loading from `agentuity.config.ts`

## Stop the Server

Press `Ctrl+C` in the terminal where dev server is running

## Checklist

- [ ] Dev server starts without errors
- [ ] GET / returns HTML with Vite scripts
- [ ] POST /api/hello works correctly
- [ ] GET /api/hello returns 404
- [ ] HMR works when editing API route
- [ ] HMR works when editing app.ts
- [ ] Generated files are created correctly
- [ ] No console errors in terminal
