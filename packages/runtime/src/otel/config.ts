import type { LogLevel } from '@agentuity/core';
import type { SpanProcessor } from '@opentelemetry/sdk-trace-base';
import * as runtimeConfig from '../_config';
import type { OtelConfig, OtelResponse } from './otel';
import { registerOtel } from './otel';

/**
 * Configuration for user provided OpenTelemetry
 */
export interface CustomizedOtelConfig {
	endpoint: string;
	// only supports http/json for now
	// protocol: 'grpc' | 'http/protobuf' | 'http/json';
	serviceName: string;
	resourceAttributes: Record<string, string>;
	headers: Record<string, string>;
}

interface OtelRegisterConfig {
	processors?: SpanProcessor[];
	logLevel?: LogLevel;
}

export function register(registerConfig: OtelRegisterConfig): OtelResponse {
	const url = process.env.AGENTUITY_OTLP_URL ?? 'https://otel.agentuity.cloud';
	const bearerToken = process.env.AGENTUITY_OTLP_BEARER_TOKEN;
	const config: OtelConfig = {
		spanProcessors: registerConfig.processors,
		name: runtimeConfig.getAppName(),
		version: runtimeConfig.getAppVersion(),
		cliVersion: runtimeConfig.getCLIVersion(),
		devmode: runtimeConfig.isDevMode(),
		orgId: runtimeConfig.getOrganizationId(),
		projectId: runtimeConfig.getProjectId(),
		deploymentId: runtimeConfig.getDeploymentId(),
		environment: runtimeConfig.getEnvironment(),
		logLevel: registerConfig.logLevel,
		jsonlBasePath: process.env.AGENTUITY_CLOUD_EXPORT_DIR,
		bearerToken,
		url,
	};

	return registerOtel(config);
}
