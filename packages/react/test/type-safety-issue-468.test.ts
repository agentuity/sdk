/**
 * Type-level tests for GitHub Issue #468: Output schemas not properly generated
 *
 * This file contains compile-time type assertions that verify:
 * 1. RouteFromMethodPath correctly reconstructs route keys from method + path
 * 2. Both string form and {method, path} form infer identical route types
 * 3. RouteOutput and RouteInput work correctly for both forms
 *
 * These are COMPILE-TIME checks - if the types are wrong, this file won't compile.
 * The test runner simply verifies the file compiled successfully.
 */

import { describe, test, expect } from 'bun:test';
import { s } from '@agentuity/schema';
import type {
	RouteInput,
	RouteOutput,
	RouteFromMethodPath,
	ExtractPath,
	ExtractMethod,
	UseAPIResult,
} from '../src/api';

// ============================================================================
// Schema definitions for type testing
// ============================================================================

const _userListOutput = s.object({
	users: s.array(s.object({ id: s.string(), name: s.string() })),
});

const _userOutput = s.object({
	id: s.string(),
	name: s.string(),
	email: s.string(),
});

const _createUserInput = s.object({
	name: s.string(),
	email: s.string(),
});

// ============================================================================
// Augment RouteRegistry for testing
// ============================================================================

declare module '../src/types' {
	interface RouteRegistry {
		'GET /test/users': {
			inputSchema: never;
			outputSchema: typeof _userListOutput;
			stream: false;
		};
		'POST /test/users': {
			inputSchema: typeof _createUserInput;
			outputSchema: typeof _userOutput;
			stream: false;
		};
		'GET /test/users/:id': {
			inputSchema: never;
			outputSchema: typeof _userOutput;
			stream: false;
			params: { id: string };
		};
		'DELETE /test/users/:id': {
			inputSchema: never;
			outputSchema: never;
			stream: false;
			params: { id: string };
		};
	}
}

// ============================================================================
// Type assertion utilities
// ============================================================================

type Equals<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

// ============================================================================
// Compile-time type assertions
// ============================================================================

// Test 1: RouteFromMethodPath reconstructs route key correctly
type _Test1_GetUsers = Assert<Equals<RouteFromMethodPath<'GET', '/test/users'>, 'GET /test/users'>>;
type _Test1_PostUsers = Assert<
	Equals<RouteFromMethodPath<'POST', '/test/users'>, 'POST /test/users'>
>;
type _Test1_GetUserById = Assert<
	Equals<RouteFromMethodPath<'GET', '/test/users/:id'>, 'GET /test/users/:id'>
>;
type _Test1_Invalid = Assert<Equals<RouteFromMethodPath<'PUT', '/nonexistent'>, never>>;

// Test 2: ExtractMethod extracts method correctly
type _Test2_Get = Assert<Equals<ExtractMethod<'GET /test/users'>, 'GET'>>;
type _Test2_Post = Assert<Equals<ExtractMethod<'POST /test/users'>, 'POST'>>;
type _Test2_Delete = Assert<Equals<ExtractMethod<'DELETE /test/users/:id'>, 'DELETE'>>;

// Test 3: ExtractPath extracts path correctly
type _Test3_Users = Assert<Equals<ExtractPath<'GET /test/users', 'GET'>, '/test/users'>>;
type _Test3_UsersPost = Assert<Equals<ExtractPath<'POST /test/users', 'POST'>, '/test/users'>>;

// Test 4: RouteOutput is identical for string form vs method/path form
type StringFormRoute = 'GET /test/users';
type MethodPathFormRoute = RouteFromMethodPath<'GET', '/test/users'>;
type _Test4_SameRoute = Assert<Equals<StringFormRoute, MethodPathFormRoute>>;
type _Test4_SameOutput = Assert<
	Equals<RouteOutput<StringFormRoute>, RouteOutput<MethodPathFormRoute>>
>;

// Test 5: RouteInput is identical for string form vs method/path form
type StringFormPost = 'POST /test/users';
type MethodPathFormPost = RouteFromMethodPath<'POST', '/test/users'>;
type _Test5_SameRoute = Assert<Equals<StringFormPost, MethodPathFormPost>>;
type _Test5_SameInput = Assert<Equals<RouteInput<StringFormPost>, RouteInput<MethodPathFormPost>>>;

// Test 6: UseAPIResult has correct structure for GET (refetch) vs POST (invoke)
type GetResult = UseAPIResult<'GET /test/users'>;
type PostResult = UseAPIResult<'POST /test/users'>;

type _Test6_GetHasRefetch = GetResult extends { refetch: () => Promise<void> } ? true : false;
type _Test6_GetNoInvoke = GetResult extends { invoke: unknown } ? false : true;
type _Test6_PostHasInvoke = PostResult extends { invoke: unknown } ? true : false;
type _Test6_PostNoRefetch = PostResult extends { refetch: unknown } ? false : true;

// Verify the assertions (these will cause compile errors if wrong)
const _verify6a: _Test6_GetHasRefetch = true;
const _verify6b: _Test6_GetNoInvoke = true;
const _verify6c: _Test6_PostHasInvoke = true;
const _verify6d: _Test6_PostNoRefetch = true;

// Test 7: RouteOutput correctly infers output types
type _Test7_ListOutput = RouteOutput<'GET /test/users'>;
type _Test7_UserOutput = RouteOutput<'GET /test/users/:id'>;
type _Test7_DeleteOutput = RouteOutput<'DELETE /test/users/:id'>;

// List output should include 'users' property
type _Test7_HasUsers = _Test7_ListOutput extends { users: unknown[] } ? true : false;
const _verify7a: _Test7_HasUsers = true;

// User output should include 'id', 'name', 'email'
type _Test7_HasId = _Test7_UserOutput extends { id: string } ? true : false;
type _Test7_HasName = _Test7_UserOutput extends { name: string } ? true : false;
type _Test7_HasEmail = _Test7_UserOutput extends { email: string } ? true : false;
const _verify7b: _Test7_HasId = true;
const _verify7c: _Test7_HasName = true;
const _verify7d: _Test7_HasEmail = true;

// Delete output should be void (no outputSchema)
type _Test7_DeleteIsVoid = Equals<_Test7_DeleteOutput, void>;
const _verify7e: _Test7_DeleteIsVoid = true;

// Test 8: RouteInput correctly infers input types
type _Test8_GetInput = RouteInput<'GET /test/users'>;
type _Test8_PostInput = RouteInput<'POST /test/users'>;

// GET should have never input
type _Test8_GetIsNever = Equals<_Test8_GetInput, never>;
const _verify8a: _Test8_GetIsNever = true;

// POST should have name and email
type _Test8_PostHasName = _Test8_PostInput extends { name: string } ? true : false;
type _Test8_PostHasEmail = _Test8_PostInput extends { email: string } ? true : false;
const _verify8b: _Test8_PostHasName = true;
const _verify8c: _Test8_PostHasEmail = true;

// ============================================================================
// Runtime tests (verify the file compiles and types are usable)
// ============================================================================

describe('Issue #468: Type Safety for RouteFromMethodPath', () => {
	test('RouteFromMethodPath produces correct route keys (compile-time verified)', () => {
		// These type assignments verify the types at compile time
		const getRoute: RouteFromMethodPath<'GET', '/test/users'> = 'GET /test/users';
		const postRoute: RouteFromMethodPath<'POST', '/test/users'> = 'POST /test/users';

		expect(getRoute).toBe('GET /test/users');
		expect(postRoute).toBe('POST /test/users');
	});

	test('string form and method/path form produce identical route types', () => {
		const stringForm = 'GET /test/users' as const;
		const methodPathForm: RouteFromMethodPath<'GET', '/test/users'> = 'GET /test/users';

		// Both should be assignable to each other (same type)
		const a: typeof stringForm = methodPathForm;
		const b: typeof methodPathForm = stringForm;

		expect(a).toBe(b);
	});

	test('invalid method/path combinations result in never type', () => {
		type InvalidRoute = RouteFromMethodPath<'PUT', '/nonexistent'>;

		// This verifies InvalidRoute is never - we can't assign any string to never
		// If this compiles, the type system correctly identifies invalid routes
		const checkNever: InvalidRoute extends never ? true : false = true;
		expect(checkNever).toBe(true);
	});

	test('UseAPIResult has refetch for GET and invoke for POST', () => {
		// Type-level checks verified at compile time via the assertions above
		// Runtime verification that the test file compiled successfully
		expect(_verify6a).toBe(true);
		expect(_verify6b).toBe(true);
		expect(_verify6c).toBe(true);
		expect(_verify6d).toBe(true);
	});

	test('RouteOutput correctly infers schema output types', () => {
		expect(_verify7a).toBe(true); // List has users array
		expect(_verify7b).toBe(true); // User has id
		expect(_verify7c).toBe(true); // User has name
		expect(_verify7d).toBe(true); // User has email
		expect(_verify7e).toBe(true); // Delete returns void
	});

	test('RouteInput correctly infers schema input types', () => {
		expect(_verify8a).toBe(true); // GET has never input
		expect(_verify8b).toBe(true); // POST has name
		expect(_verify8c).toBe(true); // POST has email
	});
});
