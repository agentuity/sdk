# custom-app

Test application for verifying custom service implementations.

This app provides custom implementations of all storage services (kv, objectstore, stream, vector) and event providers to demonstrate that the framework properly supports custom service overrides via the `createApp` configuration.

## Purpose

This app exists to verify that:

- Custom service implementations can be provided via `createApp({ services: {...} })`
- The app builds successfully with custom services
- Custom event providers work correctly

The successful build of this app validates that custom service implementations are properly integrated.
