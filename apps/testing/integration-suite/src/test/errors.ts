/**
 * Error Handling Tests
 *
 * Tests error handling, validation errors, StructuredError patterns, and error propagation
 */

import { test } from './suite';
import { assert, assertEqual, assertDefined, assertThrows } from './helpers';

import errorValidationAgent from '@agents/errors/validation';
import errorStructuredAgent from '@agents/errors/structured';
import errorPropagationAgent from '@agents/errors/propagation';

// Test: Valid input passes validation
test('errors', 'validation-success', async () => {
	const result = await errorValidationAgent.run({
		name: 'John Doe',
		age: 30,
		email: 'john@example.com',
	});

	assertEqual(result.success, true);
	assertEqual(result.data.name, 'John Doe');
	assertEqual(result.data.age, 30);
});

// Test: Missing required field throws error
test('errors', 'validation-missing-field', async () => {
	await assertThrows(
		async () => {
			await errorValidationAgent.run({
				name: 'John Doe',
				age: 30,
			} as any);
		},
		'Should throw error for missing required field'
	);
});

// Test: Wrong type throws error
test('errors', 'validation-wrong-type', async () => {
	await assertThrows(
		async () => {
			await errorValidationAgent.run({
				name: 'John Doe',
				age: 'thirty' as any,
				email: 'john@example.com',
			});
		},
		'Should throw error for wrong type'
	);
});

// Test: Optional field with default
test('errors', 'validation-optional-field', async () => {
	const result = await errorValidationAgent.run({
		name: 'Jane Doe',
		age: 25,
		email: 'jane@example.com',
	});

	assertEqual(result.success, true);
	assertEqual(result.data.active, true, 'Should use default value for optional field');
});

// Test: StructuredError with custom data
test('errors', 'structured-error-validation', async () => {
	await assertThrows(
		async () => {
			await errorStructuredAgent.run({
				operation: 'throw-validation-error',
				field: 'email',
			});
		},
		'Should throw CustomValidationError'
	);
});

// Test: StructuredError not found pattern
test('errors', 'structured-error-not-found', async () => {
	await assertThrows(
		async () => {
			await errorStructuredAgent.run({
				operation: 'throw-not-found-error',
				resource: 'user',
				id: '123',
			});
		},
		'Should throw CustomNotFoundError'
	);
});

// Test: Generic error
test('errors', 'generic-error', async () => {
	await assertThrows(
		async () => {
			await errorStructuredAgent.run({
				operation: 'throw-generic-error',
			});
		},
		'Should throw generic Error'
	);
});

// Test: Try-catch in agent handler
test('errors', 'try-catch-handling', async () => {
	const result = await errorStructuredAgent.run({
		operation: 'try-catch-handling',
	});

	assertEqual(result.success, false);
	assertEqual(result.message, 'Error caught and handled');
});

// Test: Success case (no error)
test('errors', 'no-error', async () => {
	const result = await errorStructuredAgent.run({
		operation: 'success',
	});

	assertEqual(result.success, true);
	assertEqual(result.message, 'No errors');
});

// Test: Nested error propagation
test('errors', 'nested-error-propagation', async () => {
	const result = await errorPropagationAgent.run({
		operation: 'nested-error',
		shouldFail: true,
	});

	assertEqual(result.success, false);
	assertDefined(result.message);
	assertEqual(result.errorHandled, true);
});

// Test: Nested success (no error)
test('errors', 'nested-success', async () => {
	const result = await errorPropagationAgent.run({
		operation: 'nested-error',
		shouldFail: false,
	});

	assertEqual(result.success, true);
	assertEqual(result.errorHandled, false);
});

// Test: Async error propagation
test('errors', 'async-error-propagation', async () => {
	const result = await errorPropagationAgent.run({
		operation: 'async-error',
		shouldFail: true,
	});

	assertEqual(result.success, false);
	assertEqual(result.message, 'Async operation failed');
	assertEqual(result.errorHandled, true);
});

// Test: Async success
test('errors', 'async-success', async () => {
	const result = await errorPropagationAgent.run({
		operation: 'async-error',
		shouldFail: false,
	});

	assertEqual(result.success, true);
	assertEqual(result.errorHandled, false);
});

// Test: Error chain handling
test('errors', 'chain-error', async () => {
	const result = await errorPropagationAgent.run({
		operation: 'chain-errors',
		shouldFail: true,
	});

	assertEqual(result.success, false);
	assert(
		result.message === 'Step 1 failed' || result.message === 'Step 2 failed',
		'Should catch error from chain'
	);
	assertEqual(result.errorHandled, true);
});

// Test: Error chain success
test('errors', 'chain-success', async () => {
	const result = await errorPropagationAgent.run({
		operation: 'chain-errors',
		shouldFail: false,
	});

	assertEqual(result.success, true);
	assertEqual(result.message, 'All steps completed');
});
