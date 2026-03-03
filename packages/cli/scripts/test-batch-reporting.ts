#!/usr/bin/env bun
/**
 * Test batch operation reporting functionality
 */

import {
	createBatchResult,
	outputBatchResult,
	type BatchItemResult,
	type GlobalOptions,
} from '../src/output';

console.log('Testing Batch Operation Reporting\n');
console.log('==================================\n');

// Mock global options
const jsonOptions: GlobalOptions = {
	logLevel: 'info',
	json: true,
	quiet: false,
	noProgress: false,
	color: 'auto',
	errorFormat: 'text',
};

const textOptions: GlobalOptions = {
	logLevel: 'info',
	json: false,
	quiet: false,
	noProgress: false,
	color: 'auto',
	errorFormat: 'text',
};

// Test 1: All items succeed
console.log('Test 1: All items succeed');
console.log('--------------------------');
const allSuccessResults: BatchItemResult[] = [
	{ item: 'DATABASE_URL', success: true },
	{ item: 'API_KEY', success: true },
	{ item: 'SECRET_TOKEN', success: true },
];

const allSuccessBatch = createBatchResult(allSuccessResults);
console.log('Batch result:', JSON.stringify(allSuccessBatch, null, 2));
console.log('\nText output:');
outputBatchResult(allSuccessBatch, textOptions);
console.log();

// Test 2: Partial failure
console.log('\nTest 2: Partial failure (2 succeed, 1 fails)');
console.log('---------------------------------------------');
const partialResults: BatchItemResult[] = [
	{ item: 'DATABASE_URL', success: true, data: { updated: true } },
	{
		item: 'API_KEY',
		success: false,
		error: { code: 'INVALID_VALUE', message: 'API key format is invalid' },
	},
	{ item: 'SECRET_TOKEN', success: true, data: { updated: true } },
];

const partialBatch = createBatchResult(partialResults);
console.log('Text output:');
outputBatchResult(partialBatch, textOptions);
console.log('\nJSON output:');
outputBatchResult(partialBatch, jsonOptions);
console.log();

// Test 3: All items fail
console.log('\nTest 3: All items fail');
console.log('----------------------');
const allFailResults: BatchItemResult[] = [
	{
		item: 'secret1',
		success: false,
		error: { code: 'NOT_FOUND', message: 'Secret not found' },
	},
	{
		item: 'secret2',
		success: false,
		error: { code: 'PERMISSION_DENIED', message: 'Access denied' },
	},
	{
		item: 'secret3',
		success: false,
		error: { code: 'NETWORK_ERROR', message: 'Connection timeout' },
	},
];

const allFailBatch = createBatchResult(allFailResults);
console.log('Text output:');
outputBatchResult(allFailBatch, textOptions);
console.log();

console.log('All tests completed! ✓');
console.log('\nUsage in commands:');
console.log('------------------');
console.log('1. Process items and collect results into BatchItemResult[]');
console.log('2. Create batch result: createBatchResult(results)');
console.log('3. Output result: outputBatchResult(batchResult, ctx.options)');
console.log('4. Check batchResult.success to determine if any failures occurred');
console.log();
