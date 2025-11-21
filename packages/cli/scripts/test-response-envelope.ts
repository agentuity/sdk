#!/usr/bin/env bun
/**
 * Test standard response envelope functionality
 */

import { createSuccessResponse, createErrorResponse, createMetadata } from '../src/output';

console.log('Testing Standard Response Envelope\n');
console.log('===================================\n');

// Test 1: Simple success response
console.log('Test 1: Simple success response with data');
console.log('------------------------------------------');
const simpleSuccess = createSuccessResponse({ id: 'proj_123', name: 'My Project' });
console.log(JSON.stringify(simpleSuccess, null, 2));
console.log();

// Test 2: Success response with message and metadata
console.log('Test 2: Success with message and metadata');
console.log('------------------------------------------');
const startTime = Date.now();
await Bun.sleep(50); // Simulate work
const metadata = createMetadata(startTime);
const successWithMetadata = createSuccessResponse(
	{ deployments: ['dep_1', 'dep_2', 'dep_3'] },
	'Successfully listed deployments',
	metadata
);
console.log(JSON.stringify(successWithMetadata, null, 2));
console.log();

// Test 3: Success with pagination metadata
console.log('Test 3: Success with pagination metadata');
console.log('-----------------------------------------');
const paginatedResponse = createSuccessResponse(
	[
		{ id: '1', name: 'Item 1' },
		{ id: '2', name: 'Item 2' },
	],
	undefined,
	createMetadata(undefined, {
		pagination: {
			total: 100,
			limit: 10,
			offset: 0,
			hasMore: true,
		},
	})
);
console.log(JSON.stringify(paginatedResponse, null, 2));
console.log();

// Test 4: Error response with metadata
console.log('Test 4: Error response with metadata');
console.log('-------------------------------------');
const errorResponse = createErrorResponse(
	'AUTH_REQUIRED',
	'Authentication is required',
	{ resource: 'deployment' },
	createMetadata()
);
console.log(JSON.stringify(errorResponse, null, 2));
console.log();

// Test 5: Response with warnings
console.log('Test 5: Success with warnings in metadata');
console.log('------------------------------------------');
const responseWithWarnings = createSuccessResponse(
	{ updated: true },
	'Operation completed',
	createMetadata(undefined, {
		warnings: ['Deprecated API endpoint used', 'Rate limit approaching'],
	})
);
console.log(JSON.stringify(responseWithWarnings, null, 2));
console.log();

console.log('All tests completed! ✓');
console.log('\nUsage in commands:');
console.log('------------------');
console.log('1. Start timer: const start = Date.now()');
console.log('2. Execute command logic');
console.log('3. Create metadata: createMetadata(start, { pagination, warnings })');
console.log('4. Return response: createSuccessResponse(data, message, metadata)');
console.log('5. Output with: outputJSON(response) or console.log(JSON.stringify(response))');
console.log();
