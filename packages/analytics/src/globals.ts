/**
 * Global state for Analytics instance (survives hot reloads)
 */

import type { AnalyticsResponse } from './analytics';

const analyticsInstanceKey = Symbol.for('@agentuity/analytics:instance');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

export const analytics = {
	get: (): AnalyticsResponse | undefined =>
		g[analyticsInstanceKey] as AnalyticsResponse | undefined,
	set: (v: AnalyticsResponse): void => {
		g[analyticsInstanceKey] = v;
	},
};
