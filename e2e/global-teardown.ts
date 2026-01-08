/**
 * Global teardown for Playwright E2E tests.
 *
 * This runs once after all tests and ensures any modified files are restored.
 * Critical for the HMR test which modifies App.tsx.
 */

import { execSync } from 'node:child_process';
import { join } from 'node:path';

async function globalTeardown(): Promise<void> {
	console.log('[Global Teardown] Restoring any modified test files...');

	const appTsxPath = join(process.cwd(), 'apps/testing/e2e-web/src/web/App.tsx');

	try {
		// Use git checkout to restore the file to its original state
		execSync(`git checkout "${appTsxPath}"`, {
			cwd: process.cwd(),
			stdio: 'pipe',
		});
		console.log('[Global Teardown] ✓ App.tsx restored');
	} catch (err) {
		// File might not have been modified, which is fine
		console.log('[Global Teardown] App.tsx was not modified or already clean');
	}
}

export default globalTeardown;
