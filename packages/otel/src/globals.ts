/**
 * Global state for OTel instance (survives hot reloads)
 */

import type { OtelResponse } from './otel';

const otelInstanceKey = Symbol.for('@agentuity/otel:instance');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

export const otel = {
	get: (): OtelResponse | undefined => g[otelInstanceKey] as OtelResponse | undefined,
	set: (v: OtelResponse): void => {
		g[otelInstanceKey] = v;
	},
};
