#!/usr/bin/env bun
/**
 * Storage S3 Patch Integration Test - Orchestrator
 *
 * This script:
 * 1. Creates a storage bucket via the Catalyst API
 * 2. Spawns a subprocess with the environment variables set (so Bun reads them at init time)
 * 3. The subprocess runs the actual S3 tests
 * 4. Cleans up the bucket (always, even on failure)
 *
 * Usage:
 *   bun scripts/test-storage.ts
 *
 * Requirements:
 *   - AGENTUITY_API_KEY environment variable (from `agentuity auth login`)
 *   - AGENTUITY_ORG_ID environment variable
 *   - AGENTUITY_REGION environment variable (default: usc)
 */

import { $ } from 'bun';
import { join, dirname } from 'path';
import {
	APIClient,
	createResources,
	deleteResources,
	getServiceUrls,
	ConsoleLogger,
} from '@agentuity/server';

const logger = new ConsoleLogger('info');

async function main() {
	console.log('╔════════════════════════════════════════════════╗');
	console.log('║  Storage S3 Patch Integration Test             ║');
	console.log('╚════════════════════════════════════════════════╝');
	console.log('');

	// Get required environment variables
	const apiKey = process.env.AGENTUITY_CLI_API_KEY || process.env.AGENTUITY_SDK_KEY;
	if (!apiKey) {
		console.error(
			'Error: AGENTUITY_CLI_API_KEY or AGENTUITY_SDK_KEY environment variable is required'
		);
		console.error('Run `agentuity auth login` to authenticate');
		process.exit(1);
	}

	const orgId = process.env.AGENTUITY_CLOUD_ORG_ID;
	if (!orgId) {
		console.error('Error: AGENTUITY_CLOUD_ORG_ID environment variable is required');
		process.exit(1);
	}

	const region = process.env.AGENTUITY_REGION || 'usc';

	console.log(`Organization: ${orgId}`);
	console.log(`Region: ${region}`);
	console.log('');

	// Create API client
	const serviceUrls = getServiceUrls(region);
	const client = new APIClient(serviceUrls.catalyst, logger, apiKey);

	let bucketName: string | undefined;
	let testEnv: Record<string, string> = {};

	try {
		// Step 1: Create storage bucket
		console.log('Step 1: Creating storage bucket...');
		const created = await createResources(client, orgId, region, [{ type: 's3' }]);

		if (created.length === 0) {
			throw new Error('Failed to create storage bucket');
		}

		const resource = created[0];
		bucketName = resource.name;
		console.log(`  Created bucket: ${bucketName}`);

		// Step 2: Collect environment variables and fix endpoint for virtualHostedStyle
		console.log('');
		console.log('Step 2: Setting up environment variables...');
		testEnv = { ...resource.env };

		// For virtualHostedStyle, the endpoint must include the bucket in the hostname
		// e.g., https://ag-xxx.t3.storage.dev instead of https://t3.storage.dev
		const baseEndpoint = testEnv.AWS_ENDPOINT || testEnv.S3_ENDPOINT;
		const bucket = testEnv.AWS_BUCKET || testEnv.S3_BUCKET;
		if (baseEndpoint && bucket) {
			// Construct bucket-specific endpoint for virtualHostedStyle
			const fullEndpoint = `https://${bucket}.${baseEndpoint.replace(/^https?:\/\//, '')}`;
			testEnv.AWS_ENDPOINT = fullEndpoint;
			testEnv.S3_ENDPOINT = fullEndpoint;
			// Remove bucket from env since it's now in the endpoint
			delete testEnv.AWS_BUCKET;
			delete testEnv.S3_BUCKET;
		}

		for (const [key, value] of Object.entries(testEnv)) {
			console.log(`  ${key}=${key.toLowerCase().includes('secret') ? '***' : value}`);
		}

		// Step 3: Spawn subprocess with env vars set at init time
		console.log('');
		console.log('Step 3: Running S3 tests in subprocess...');
		console.log('');

		const scriptDir = dirname(import.meta.path);
		const testRunnerPath = join(scriptDir, 'test-storage-runner.ts');

		// Merge current env with the S3 credentials
		const subprocessEnv = {
			...process.env,
			...testEnv,
		};

		// Run the test runner as a subprocess
		const result = await $`bun ${testRunnerPath}`.env(subprocessEnv).nothrow();

		if (result.exitCode !== 0) {
			console.log('');
			console.log('Tests failed with exit code:', result.exitCode);
			process.exitCode = result.exitCode;
		}
	} finally {
		// Step 4: Cleanup - always delete the bucket
		console.log('');
		console.log('Step 4: Cleaning up...');

		if (bucketName) {
			try {
				const deleted = await deleteResources(client, orgId, region, [
					{ type: 's3', name: bucketName },
				]);
				if (deleted.length > 0) {
					console.log(`  Deleted bucket: ${bucketName}`);
				} else {
					console.log(`  Warning: Failed to delete bucket ${bucketName}`);
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.log(`  Warning: Cleanup error: ${message}`);
			}
		}
	}
}

main().catch((error) => {
	console.error('Fatal error:', error);
	process.exit(1);
});
