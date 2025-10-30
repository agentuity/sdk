# custom-app

Test application for verifying custom service implementations.

This app provides custom implementations of all storage services (kv, objectstore, stream, vector) to demonstrate that the framework properly supports custom service overrides via the `createApp` configuration.

## Running Tests

```bash
bun run test
```

This will start the server and test all endpoints to ensure they return the custom hardcoded data from the custom service implementations.
