import { createResource, createUserLoggerProvider, registerOtel } from './otel';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { OtelLogger } from '../otel/logger';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import type { LoggerProvider } from '@opentelemetry/sdk-logs';
import type { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import type { LogRecordProcessor } from '@opentelemetry/sdk-logs';
import type { OtelResponse } from './otel';

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

/**
 * Configuration for auto-starting the Agentuity SDK
 */
export interface OtelConfig {
	basedir: string;
	distdir?: string;
	orgId?: string;
	projectId?: string;
	deploymentId?: string;
	port?: number;
	devmode?: boolean;
	environment?: string;
	cliVersion?: string;
	otlp?: {
		url?: string;
		bearerToken?: string;
	};
	userOtelConf?: CustomizedOtelConfig;
}

// let userOtelConf: UserOpenTelemetryConfig | undefined;
// if (process.env.AGENTUITY_USER_OTEL_CONF) {
// 	try {
// 		userOtelConf = JSON.parse(process.env.AGENTUITY_USER_OTEL_CONF);
// 	} catch (error) {
// 		console.warn(
// 			`[WARN] Failed to parse AGENTUITY_USER_OTEL_CONF: ${error instanceof Error ? error.message : String(error)}`
// 		);
// 	}
// }
// await run({
// 	basedir: dir,
// 	orgId: process.env.AGENTUITY_CLOUD_ORG_ID,
// 	projectId: process.env.AGENTUITY_CLOUD_PROJECT_ID,
// 	deploymentId: process.env.AGENTUITY_CLOUD_DEPLOYMENT_ID,
// 	port: process.env.AGENTUITY_CLOUD_PORT
// 		? Number.parseInt(process.env.AGENTUITY_CLOUD_PORT)
// 		: process.env.PORT
// 			? Number.parseInt(process.env.PORT)
// 			: undefined,
// 	devmode: process.env.AGENTUITY_SDK_DEV_MODE === 'true',
// 	cliVersion: process.env.AGENTUITY_CLI_VERSION,
// 	environment:
// 		process.env.AGENTUITY_ENVIRONMENT ??
// 		process.env.NODE_ENV ??
// 		'development',
// 	otlp: {
// 		url: process.env.AGENTUITY_OTLP_URL,
// 		bearerToken: process.env.AGENTUITY_OTLP_BEARER_TOKEN,
// 	},
// 	userOtelConf,
// 	agents,
// });

export function register(): OtelResponse {
	const name = process.env.AGENTUITY_SDK_APP_NAME ?? 'unknown';
	const version = process.env.AGENTUITY_SDK_APP_VERSION ?? 'unknown';
	const sdkVersion = process.env.AGENTUITY_SDK_VERSION ?? 'unknown';
	const orgId = process.env.AGENTUITY_CLOUD_ORG_ID;
	const projectId = process.env.AGENTUITY_CLOUD_PROJECT_ID;
	const deploymentId = process.env.AGENTUITY_CLOUD_DEPLOYMENT_ID;
	const devmode = process.env.AGENTUITY_SDK_DEV_MODE === 'true';
	const cliVersion = process.env.AGENTUITY_CLI_VERSION;
	const url = process.env.AGENTUITY_OTLP_URL;
	const bearerToken = process.env.AGENTUITY_OTLP_BEARER_TOKEN;
	const environment = process.env.AGENTUITY_ENVIRONMENT || process.env.NODE_ENV || 'development';
	const config = {
		name,
		version,
		sdkVersion,
		cliVersion,
		devmode,
		orgId,
		projectId,
		deploymentId,
		bearerToken,
		url,
		environment,
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
