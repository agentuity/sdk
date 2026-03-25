/**
 * Global state for Telemetry instance (survives hot reloads)
 */

import type { TelemetryResponse } from './telemetry';

const telemetryInstanceKey = Symbol.for('@agentuity/telemetry:instance');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

export const telemetry = {
	get: (): TelemetryResponse | undefined =>
		g[telemetryInstanceKey] as TelemetryResponse | undefined,
	set: (v: TelemetryResponse): void => {
		g[telemetryInstanceKey] = v;
	},
};
