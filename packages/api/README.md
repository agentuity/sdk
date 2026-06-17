# @agentuity/api

Platform HTTP client for Agentuity control-plane and CLI APIs.

Use `APIClient` for routes such as `/cli/project`, `/cli/stream`, deploy, org admin, and other Pulse-style `{ success, data, message }` endpoints.

Service storage clients (`KeyValueClient`, `StreamClient`, etc.) use `@agentuity/adapter` instead.

During the v3 isolation migration, `@agentuity/core/api` re-exports this package. New code should import from `@agentuity/api` directly.
