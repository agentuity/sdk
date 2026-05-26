# Run Scripts Guide

This folder contains standalone scripts used by the SDK Explorer sandbox runner.

## Rules

- Keep scripts focused on one Explorer capability.
- Use direct service clients, framework-neutral helpers, or `getDemoContext()` from `../api/context`.
- Do not import `@agentuity/runtime`.
- Do not use `createAgentContext()`, `getAgentContext()`, or `ctx.invoke()`.
- Use `ctx.logger` for logs when using the demo context.
- Always print results between `---OUTPUT---` markers.
- Clean up created demo resources when the service supports cleanup.
- After adding or renaming a script, run `bun run generate:scripts` from `docs/`.

## Output Format

```typescript
console.log('---OUTPUT---');
console.log(JSON.stringify(result, null, 2));
console.log('---OUTPUT---');
```

## Context Helper

Use the docs demo context when a script needs shared clients or logs:

```typescript
import { getDemoContext } from '../api/context';

const ctx = getDemoContext();

ctx.logger.info('running demo');
await ctx.kv.set('examples', 'hello', { value: 'world' }, { ttl: 300 });
const result = await ctx.kv.get('examples', 'hello');
await ctx.kv.delete('examples', 'hello');
```

The helper exists for the Explorer. Public docs should show direct service clients or framework route context instead.

## Sandbox Relationship

Scripts are bundled for the sandbox runner and referenced from `src/api/sandbox/scripts.ts`. The web UI executes:

```bash
bun run dist/run/{scriptName}.js '{jsonInput}'
```

Keep `src/web/code-examples.ts`, `src/web/demo-config.tsx`, and `src/api/sandbox/scripts.ts` in sync when adding a demo.
