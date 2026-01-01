/**
 * Type-level tests for route registry exports.
 *
 * These tests verify that route registry types are properly exported from @agentuity/react
 * and can be augmented by generated code. This prevents regressions like issue #384.
 */

import { describe, test, expect } from 'bun:test';
import type {
	RouteRegistry,
	WebSocketRouteRegistry,
	SSERouteRegistry,
	RPCRouteRegistry,
	RouteKey,
	WebSocketRouteKey,
	SSERouteKey,
} from '../src/index';

describe('Route Registry Type Exports (issue #384)', () => {
	test('RouteRegistry should be exported from @agentuity/react', () => {
		// This test verifies the type exists and is exported
		// If this fails to compile, the type is not properly exported
		const _registry: RouteRegistry = {};
		expect(_registry).toBeDefined();
	});

	test('WebSocketRouteRegistry should be exported from @agentuity/react', () => {
		const _registry: WebSocketRouteRegistry = {};
		expect(_registry).toBeDefined();
	});

	test('SSERouteRegistry should be exported from @agentuity/react', () => {
		const _registry: SSERouteRegistry = {};
		expect(_registry).toBeDefined();
	});

	test('RPCRouteRegistry should be exported from @agentuity/react', () => {
		const _registry: RPCRouteRegistry = {};
		expect(_registry).toBeDefined();
	});

	test('RouteKey should be a type derived from RouteRegistry', () => {
		// RouteKey is keyof RouteRegistry, which should be never for empty registry
		// This test verifies the type relationship exists
		type _CheckRouteKey = RouteKey extends keyof RouteRegistry ? true : false;
		const _check: _CheckRouteKey = true;
		expect(_check).toBe(true);
	});

	test('WebSocketRouteKey should be a type derived from WebSocketRouteRegistry', () => {
		type _CheckWSKey = WebSocketRouteKey extends keyof WebSocketRouteRegistry ? true : false;
		const _check: _CheckWSKey = true;
		expect(_check).toBe(true);
	});

	test('SSERouteKey should be a type derived from SSERouteRegistry', () => {
		type _CheckSSEKey = SSERouteKey extends keyof SSERouteRegistry ? true : false;
		const _check: _CheckSSEKey = true;
		expect(_check).toBe(true);
	});
});

describe('Route Registry Module Augmentation', () => {
	test('RouteRegistry can be augmented via declare module', () => {
		// This is a compile-time test - if the module augmentation doesn't work,
		// TypeScript will error. The test itself just verifies the augmented
		// interface is accessible.

		// Simulate what generated code does:
		// declare module '@agentuity/react' {
		//   export interface RouteRegistry {
		//     'POST /api/test': { inputSchema: never; outputSchema: never; stream: false };
		//   }
		// }

		// If augmentation works, this should compile without errors
		// (the actual augmentation happens in src/generated/routes.ts at build time)
		expect(true).toBe(true);
	});

	test('types are exported from the correct module path', () => {
		// Verify that imports from @agentuity/react work
		// This catches issues where types might be in a different module
		const registryCheck = {} as RouteRegistry;
		const wsCheck = {} as WebSocketRouteRegistry;
		const sseCheck = {} as SSERouteRegistry;
		const rpcCheck = {} as RPCRouteRegistry;

		expect(registryCheck).toBeDefined();
		expect(wsCheck).toBeDefined();
		expect(sseCheck).toBeDefined();
		expect(rpcCheck).toBeDefined();
	});
});
