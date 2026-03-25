/**
 * OTel configuration wrapper - uses @agentuity/telemetry under the hood
 *
 * @deprecated Use `@agentuity/telemetry` directly instead:
 * ```typescript
 * import { register, tracer, logger, meter } from '@agentuity/telemetry';
 * ```
 */

import type { LogLevel } from '@agentuity/core';
import type { SpanProcessor } from '@opentelemetry/sdk-trace-base';
import {
	register as registerTelemetry,
	type TelemetryConfig,
	type TelemetryResponse,
} from '@agentuity/telemetry';

/**
 * Configuration for user provided OpenTelemetry
 * @deprecated Use TelemetryConfig from @agentuity/telemetry
 */
export interface CustomizedOtelConfig {
	endpoint: string;
	serviceName: string;
	resourceAttributes: Record<string, string>;
	headers: Record<string, string>;
}

interface OtelRegisterConfig {
	processors?: SpanProcessor[];
	logLevel?: LogLevel;
}

/**
 * Register and initialize telemetry/OTel
 *
 * @deprecated Use `register()` from `@agentuity/telemetry` directly
 */
export function register(registerConfig?: OtelRegisterConfig): TelemetryResponse {
	const config: Partial<TelemetryConfig> = {
		spanProcessors: registerConfig?.processors,
		logLevel: registerConfig?.logLevel,
	};

	return registerTelemetry(config);
}

// Re-export types for backwards compatibility
export type { TelemetryResponse as OtelResponse } from '@agentuity/telemetry';
