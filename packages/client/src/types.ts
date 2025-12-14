import type { InferInput, InferOutput } from '@agentuity/core';

/**
 * What a route leaf looks like in the generated registry.
 * This is the shape of the innermost object in the nested structure.
 */
export type RouteLeaf = {
	inputSchema: unknown;
	outputSchema: unknown;
	stream: boolean;
};

/**
 * Check if T is a route leaf (has the required schema properties)
 */
export type IsRouteLeaf<T> = T extends RouteLeaf ? true : false;

/**
 * Transform a route leaf into callable methods.
 * - call(): executes the API request
 * - stream(): placeholder for streaming (no-op for now)
 */
export type LeafToCaller<T extends RouteLeaf> = {
	call: T['inputSchema'] extends never
		? () => Promise<InferOutput<T['outputSchema']>>
		: (input: InferInput<T['inputSchema']>) => Promise<InferOutput<T['outputSchema']>>;
	stream: () => void;
};

/**
 * Recursively transform the registry into a callable structure.
 * Leaf nodes become LeafToCaller, branch nodes recurse.
 */
export type TransformRegistry<T> = {
	[K in keyof T]: T[K] extends RouteLeaf ? LeafToCaller<T[K]> : TransformRegistry<T[K]>;
};

/**
 * The fully-typed client type.
 * Usage: Client<RouteRegistry> gives you client.post.api.hello.call(input)
 */
export type Client<R> = TransformRegistry<R>;

/**
 * Options for creating a client
 */
export type ClientOptions = {
	/** Base URL for API requests. Defaults to defaultBaseUrl from environment. */
	baseUrl?: string;
	/** Additional headers to include in all requests */
	headers?: Record<string, string>;
};
