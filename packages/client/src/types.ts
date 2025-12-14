// export type ApiCaller = {}

export type Route<I, O> = {
	input: I;
	output: O;
};

type InferRoute<T extends Route<unknown, unknown>> =
	T extends Route<infer I, infer O> ? { input: I; output: O } : never;

export type RouteRegistry = Record<string, Route<unknown, unknown>>;

export type DecoratedRouteRegistry<R extends RouteRegistry> = {
	[K in keyof R]: InferRoute<R[K]>;
};

export type RouteCaller<I, O> = (input: I) => Promise<O>;
