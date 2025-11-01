import { createResource, createUserLoggerProvider, registerOtel } from './otel';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { OtelLogger } from '../otel/logger';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import type { LoggerProvider } from '@opentelemetry/sdk-logs';
import type { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import type { LogRecordProcessor } from '@opentelemetry/sdk-logs';
import type { OtelResponse, OtelConfig } from './otel';
import type { SpanProcessor } from '@opentelemetry/sdk-trace-base';
import * as runtimeConfig from '../_config';
import type { LogLevel } from '@agentuity/core';

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
		bearerToken,
		url,
	};
	let userOtelConf: CustomizedOtelConfig | undefined;
	if (process.env.AGENTUITY_USER_OTEL_CONF) {
		try {
			userOtelConf = JSON.parse(process.env.AGENTUITY_USER_OTEL_CONF);
		} catch (error) {
			console.warn(
				`[WARN] Failed to parse AGENTUITY_USER_OTEL_CONF: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	const otel = registerOtel(config);
	let userLoggerProvider:
		| {
				provider: LoggerProvider;
				exporter: OTLPLogExporter;
				processor: LogRecordProcessor;
		  }
		| undefined;
	if (userOtelConf) {
		const resource = resourceFromAttributes({
			...createResource(config).attributes,
			...userOtelConf.resourceAttributes,
			[ATTR_SERVICE_NAME]: userOtelConf.serviceName,
		});
		userLoggerProvider = createUserLoggerProvider({
			url: userOtelConf.endpoint,
			headers: userOtelConf.headers,
			resource,
		});
		if (otel.logger instanceof OtelLogger) {
			otel.logger.addDelegate(userLoggerProvider.provider.getLogger('default'));
		} else {
			console.warn('[WARN] user OTEL logger not attached: logger does not support addDelegate');
		}
	}
	return otel;
}
