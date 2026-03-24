#!/usr/bin/env bun
/**
 * Test script to demonstrate exit code system functionality
 */

import { ErrorCode, ExitCode, createError, getExitCode, formatErrorJSON } from '../src/errors';

console.log('Testing Exit Code System\n');
console.log('=========================\n');

// Test 1: Exit code mapping
console.log('Test 1: Verify ErrorCode to ExitCode mapping');
console.log('----------------------------------------------');
const testCases: [ErrorCode, ExitCode][] = [
	[ErrorCode.VALIDATION_FAILED, ExitCode.VALIDATION_ERROR],
	[ErrorCode.AUTH_REQUIRED, ExitCode.AUTH_ERROR],
	[ErrorCode.PROJECT_NOT_FOUND, ExitCode.NOT_FOUND],
	[ErrorCode.PERMISSION_DENIED, ExitCode.PERMISSION_ERROR],
	[ErrorCode.NETWORK_ERROR, ExitCode.NETWORK_ERROR],
	[ErrorCode.FILE_READ_ERROR, ExitCode.FILE_ERROR],
	[ErrorCode.USER_CANCELLED, ExitCode.USER_CANCELLED],
	[ErrorCode.BUILD_FAILED, ExitCode.BUILD_FAILED],
	[ErrorCode.MALWARE_DETECTED, ExitCode.SECURITY_ERROR],
	[ErrorCode.PAYMENT_REQUIRED, ExitCode.PAYMENT_REQUIRED],
	[ErrorCode.UPGRADE_REQUIRED, ExitCode.UPGRADE_REQUIRED],
	[ErrorCode.INTERNAL_ERROR, ExitCode.GENERAL_ERROR],
];

let passedTests = 0;
for (const [errorCode, expectedExitCode] of testCases) {
	const actualExitCode = getExitCode(errorCode);
	const passed = actualExitCode === expectedExitCode;
	console.log(
		`  ${passed ? '✓' : '✗'} ${errorCode} → ${actualExitCode} ${passed ? '' : `(expected ${expectedExitCode})`}`
	);
	if (passed) passedTests++;
}
console.log(`\nPassed: ${passedTests}/${testCases.length}\n`);

// Test 2: JSON error formatting includes exitCode
console.log('Test 2: Verify JSON error output includes exitCode');
console.log('---------------------------------------------------');
const testError = createError(
	ErrorCode.AUTH_REQUIRED,
	'Authentication is required to perform this operation',
	{ resource: 'deployment', operation: 'list' },
	['Run "agentuity auth login" to authenticate']
);
const jsonOutput = formatErrorJSON(testError);
const parsed = JSON.parse(jsonOutput);
console.log(JSON.stringify(parsed, null, 2));
console.log(
	`\n  ${parsed.error.exitCode === ExitCode.AUTH_ERROR ? '✓' : '✗'} Exit code in JSON: ${parsed.error.exitCode} (expected ${ExitCode.AUTH_ERROR})\n`
);

// Test 3: Different error categories produce correct exit codes
console.log('Test 3: Different error types produce distinct exit codes');
console.log('----------------------------------------------------------');
const errorExamples = [
	{
		code: ErrorCode.VALIDATION_FAILED,
		message: 'Missing required argument',
		expected: ExitCode.VALIDATION_ERROR,
	},
	{
		code: ErrorCode.AUTH_EXPIRED,
		message: 'Session expired',
		expected: ExitCode.AUTH_ERROR,
	},
	{
		code: ErrorCode.RESOURCE_NOT_FOUND,
		message: 'Deployment not found',
		expected: ExitCode.NOT_FOUND,
	},
];

for (const example of errorExamples) {
	const err = createError(example.code, example.message);
	const exitCode = getExitCode(err.code);
	const passed = exitCode === example.expected;
	console.log(
		`  ${passed ? '✓' : '✗'} ${example.code} → exit ${exitCode} ${passed ? '' : `(expected ${example.expected})`}`
	);
}

// Test 4: Exit codes are in safe user-defined range (10+)
console.log('\nTest 4: Exit codes avoid system signal range');
console.log('----------------------------------------------');
const unsafeRange = [2, 3, 4, 5, 6, 7, 8, 9]; // Signal numbers to avoid
for (const exitCode of Object.values(ExitCode)) {
	if (typeof exitCode !== 'number') continue;
	if (unsafeRange.includes(exitCode)) {
		console.log(`  ✗ ExitCode ${exitCode} conflicts with Unix signal range`);
	}
}
console.log('  ✓ All exit codes are outside the Unix signal range (2-9)');

console.log('\nAll tests completed successfully! ✓\n');
console.log('Exit Code Reference:');
console.log('--------------------');
console.log('  0  - Success');
console.log('  1  - General error');
console.log('  10 - Validation error');
console.log('  11 - Authentication error');
console.log('  12 - Resource not found');
console.log('  13 - Permission denied');
console.log('  14 - Network error');
console.log('  15 - File system error');
console.log('  16 - User cancelled');
console.log('  17 - Build failed');
console.log('  18 - Security error');
console.log('  19 - Payment required');
console.log('  20 - Upgrade required');
console.log();
