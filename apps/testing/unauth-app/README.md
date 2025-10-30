# unauth-app

Test application for verifying unauthenticated service error handling.

This app intentionally does NOT set `AGENTUITY_SDK_KEY` to test that all storage services (kv, objectstore, stream, vector) return proper error responses when accessed without authentication.

## Running Tests

```bash
bun run test
```

This will start the server and test all endpoints to ensure they return 501 status codes with appropriate error messages.
