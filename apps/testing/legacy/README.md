# Legacy Testing Apps

These apps were used to test the old route-based agent architecture and are preserved here for reference.

## Moved Apps

- **auth-app** - Testing app with authentication (SDK key required)
- **custom-app** - Testing app with custom service implementations
- **unauth-app** - Testing app without authentication

## Why Moved to Legacy

The agent refactor changed the architecture:

- Agents no longer have separate route files
- Routes are auto-generated from agent names
- Agent handlers are defined directly in `agent.ts`
- The old `/agent/[name]/route.ts` pattern is deprecated

These apps tested the old route-based patterns and HTTP endpoint functionality that no longer applies to the new architecture.

## Testing Strategy

Testing is now done via:

- Unit tests in `packages/runtime/test/`
- Integration tests that call agents directly via `agent.run()`
- The runtime package has comprehensive tests for all functionality
