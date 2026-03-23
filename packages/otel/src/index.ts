/**
 * @agentuity/otel - OpenTelemetry configuration for Agentuity
 *
 * Provides a simple factory for setting up OTel with Agentuity defaults.
 */

export { registerOtel, createResource, type OtelConfig, type OtelResponse } from './otel';
export { injectTraceContextToHeaders, extractTraceContextFromRequest } from './http';
export type { Logger } from './logger';
