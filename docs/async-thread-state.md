# Async Thread State Design

## Problem

Every API request incurs 100-150ms latency from thread state restoration, even when the handler never accesses `ctx.thread.state`. The current implementation:

1. Middleware calls `threadProvider.restore()` before every handler
2. `restore()` makes a WebSocket round-trip to Catalyst to fetch thread data
3. State is fully deserialized into a `Map<string, unknown>`
4. On save, the entire state is serialized and sent back

## Solution

Make thread state lazy-loaded with async methods. State is only fetched when first accessed, and write-only operations can be batched and sent as a "merge" command without ever reading the existing state.

## New Interfaces

### ThreadState

```typescript
interface ThreadState {
  /**
   * Whether state has been loaded from storage.
   * True when state has been fetched via a read operation.
   */
  readonly loaded: boolean;

  /**
   * Whether state has pending changes.
   * True when there are queued writes (pending-writes state) or
   * modifications after loading (loaded state with changes).
   */
  readonly dirty: boolean;

  /**
   * Get a value from thread state.
   * Triggers lazy load if state hasn't been fetched yet.
   */
  get<T = unknown>(key: string): Promise<T | undefined>;

  /**
   * Set a value in thread state.
   * If state hasn't been loaded, queues the operation for merge.
   */
  set<T = unknown>(key: string, value: T): Promise<void>;

  /**
   * Check if a key exists in thread state.
   * Triggers lazy load if state hasn't been fetched yet.
   */
  has(key: string): Promise<boolean>;

  /**
   * Delete a key from thread state.
   * If state hasn't been loaded, queues the operation for merge.
   */
  delete(key: string): Promise<void>;

  /**
   * Clear all thread state.
   * If state hasn't been loaded, queues a clear operation for merge.
   */
  clear(): Promise<void>;

  /**
   * Get all entries as key-value pairs.
   * Triggers lazy load if state hasn't been fetched yet.
   */
  entries<T = unknown>(): Promise<[string, T][]>;

  /**
   * Get all keys.
   * Triggers lazy load if state hasn't been fetched yet.
   */
  keys(): Promise<string[]>;

  /**
   * Get all values.
   * Triggers lazy load if state hasn't been fetched yet.
   */
  values<T = unknown>(): Promise<T[]>;

  /**
   * Get the number of entries in state.
   * Triggers lazy load if state hasn't been fetched yet.
   */
  size(): Promise<number>;
}
```

### Thread (Updated)

```typescript
interface Thread {
  /**
   * Unique thread identifier (e.g., "thrd_a1b2c3d4...").
   */
  id: string;

  /**
   * Thread-scoped state storage with async lazy-loading.
   */
  state: ThreadState;

  /**
   * Get thread metadata (lazy-loaded).
   * Returns the full metadata object.
   */
  getMetadata(): Promise<Record<string, unknown>>;

  /**
   * Set thread metadata (full replace).
   */
  setMetadata(metadata: Record<string, unknown>): Promise<void>;

  /**
   * Register event listener for thread destruction.
   */
  addEventListener(
    eventName: 'destroyed',
    callback: (eventName: 'destroyed', thread: Thread) => Promise<void> | void
  ): void;

  /**
   * Remove event listener.
   */
  removeEventListener(
    eventName: 'destroyed',
    callback: (eventName: 'destroyed', thread: Thread) => Promise<void> | void
  ): void;

  /**
   * Destroy the thread and clean up resources.
   */
  destroy(): Promise<void>;

  /**
   * Check if thread has any data.
   */
  empty(): Promise<boolean>;
}
```

## Internal State Machine

The `LazyThreadState` implementation uses a state machine to track loading status:

```
                    ┌─────────────────────────────────┐
                    │                                 │
                    ▼                                 │
┌──────┐  write   ┌─────────────────┐  read    ┌─────┴─────┐
│ idle │ ───────► │ pending-writes  │ ───────► │  loaded   │
└──────┘          └─────────────────┘          └───────────┘
    │                                                ▲
    │                    read                        │
    └────────────────────────────────────────────────┘
```

### States

| State | Description |
|-------|-------------|
| `idle` | Initial state. No operations performed yet. |
| `pending-writes` | Write operations queued but state never loaded. |
| `loaded` | State has been fetched from Catalyst and is cached locally. |

### Transitions

| From | Trigger | To | Action |
|------|---------|-----|--------|
| `idle` | `get`, `has`, `entries`, `keys`, `values`, `size` | `loaded` | Fetch state via WebSocket |
| `idle` | `set`, `delete`, `clear` | `pending-writes` | Queue operation |
| `pending-writes` | `get`, `has`, `entries`, `keys`, `values`, `size` | `loaded` | Fetch state, apply queued ops |
| `pending-writes` | `set`, `delete`, `clear` | `pending-writes` | Queue operation |
| `loaded` | any | `loaded` | Operate on local cache |

## Save Behavior

At the end of a request, the `ThreadProvider.save()` method inspects the state:

| State | Dirty? | Action |
|-------|--------|--------|
| `idle` | n/a | No-op (nothing touched) |
| `pending-writes` | n/a | Send `merge` command with queued operations |
| `loaded` | no | No-op (no changes) |
| `loaded` | yes | Send full `save` command (existing behavior) |

## Catalyst Changes

### New WebSocket Action: `merge`

```json
{
  "id": "request-uuid",
  "action": "merge",
  "data": {
    "thread_id": "thrd_abc123...",
    "operations": [
      {"op": "set", "key": "count", "value": 42},
      {"op": "set", "key": "user", "value": {"name": "Alice"}},
      {"op": "delete", "key": "temp"},
      {"op": "clear"}
    ],
    "metadata": {"userId": "user_123", "department": "sales"}
  }
}
```

### Operation Semantics

Operations are applied in order:

- **`set`**: Set key to value (JSON-serializable)
- **`delete`**: Remove key if exists
- **`clear`**: Remove all keys (applied before any subsequent sets)

### Implementation

Since `user_data` is encrypted, Catalyst cannot use PostgreSQL JSONB operations directly. The merge operation:

1. Read existing row (if exists)
2. Decrypt `user_data`
3. Parse JSON to map
4. Apply operations in order
5. Serialize to JSON
6. Encrypt
7. Upsert row

For metadata (unencrypted), we could use PostgreSQL JSONB merge, but for consistency we use the same pattern.

## Performance Comparison

### Before (Current)

```
Request Start:
  → WebSocket restore() ─────────────────────► 100-150ms
  → Parse + populate Map ────────────────────► ~1ms

Handler executes (may or may not use state)

Request End:
  → Check dirty ─────────────────────────────► ~0ms
  → If dirty: serialize + WebSocket save() ──► ~50ms
```

**Total overhead (no state access):** 100-150ms

### After (Lazy Loading)

```
Request Start:
  → No WebSocket call ───────────────────────► 0ms

Handler executes

If state.get() called:
  → WebSocket restore() ─────────────────────► 100-150ms (only if needed)

Request End:
  → If pending-writes: WebSocket merge() ────► ~50ms
  → If loaded+dirty: WebSocket save() ───────► ~50ms
  → If idle or loaded+clean: nothing ────────► 0ms
```

**Total overhead (no state access):** 0ms
**Total overhead (write-only):** ~50ms (merge, no restore)
**Total overhead (read+write):** 150-200ms (same as before)

## Migration

This is a breaking change. The `Thread` interface changes from:

```typescript
// Before
ctx.thread.state.get('key')        // sync
ctx.thread.state.set('key', value) // sync
ctx.thread.metadata.userId = '123' // sync property access

// After
await ctx.thread.state.get('key')        // async
await ctx.thread.state.set('key', value) // async
const meta = await ctx.thread.getMetadata()
await ctx.thread.setMetadata({ ...meta, userId: '123' })
```

No automatic migration path is provided. Users must update their code.

## Implementation Order

1. **Catalyst:** Add `merge` WebSocket action
2. **Catalyst:** Add SQL for upsert-with-operations
3. **SDK:** Create `ThreadState` interface
4. **SDK:** Implement `LazyThreadState` class
5. **SDK:** Update `Thread` interface
6. **SDK:** Update `DefaultThread` implementation
7. **SDK:** Update `ThreadProvider.save()` for merge support
8. **SDK:** Update middleware (remove eager restore)
9. **SDK:** Update `ThreadWebSocketClient` with merge method
10. **SDK:** Update all tests
