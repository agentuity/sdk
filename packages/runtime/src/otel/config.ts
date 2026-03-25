/**
 * OTel configuration wrapper - uses @agentuity/analytics under the hood
 *
 * @deprecated Use `@agentuity/analytics` directly instead:
 * ```typescript
 * import { register, tracer, logger, meter } from '@agentuity/analytics';
 * ```
 */

import type { LogLevel } from '@agentuity/core';
import type { SpanProcessor } from '@opentelemetry/sdk-trace-base';
import {
	register as registerAnalytics,
	type AnalyticsConfig,
	type AnalyticsResponse,
} from '@agentuity/analytics';

/**
 * Configuration for user provided OpenTelemetry
 * @deprecated Use AnalyticsConfig from @agentuity/analytics
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
 * Register and initialize analytics/OTel
 *
 * @deprecated Use `register()` from `@agentuity/analytics` directly
 */
export function register(registerConfig?: OtelRegisterConfig): AnalyticsResponse {
	const config: Partial<AnalyticsConfig> = {
		spanProcessors: registerConfig?.processors,
		logLevel: registerConfig?.logLevel,
	};

	return registerAnalytics(config);
}

// Re-export types for backwards compatibility
export type { AnalyticsResponse as OtelResponse } from '@agentuity/analytics';
