/**
 * Integration tests for server lifecycle and basic HTTP functionality.
 */

import { test } from 'bun:test';

test.skip('CLI bundler works and produces app.js', async () => {
	// Skipped: auth-app was moved to legacy/ and is not actively built in CI
	// This test expects .agentuity/app.js to exist from a build step
});
