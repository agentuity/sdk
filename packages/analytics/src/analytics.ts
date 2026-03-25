import type { SpanProcessor } from '@opentelemetry/sdk-trace-base';
import { BatchSpanProcessor, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import opentelemetry, { type Meter, metrics, propagation, type Tracer } from '@opentelemetry/api';
import * as LogsAPI from '@opentelemetry/api-logs';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import {
	CompositePropagator,
	W3CBaggagePropagator,
	W3CTraceContextPropagator,
} from '@opentelemetry/core';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HostMetrics } from '@opentelemetry/host-metrics';
import { CompressionAlgorithm } from '@opentelemetry/otlp-exporter-base';
import { resourceFromAttributes } from '@opentelemetry/resources';
import type { Resource } from '@opentelemetry/resources';
import {
	BatchLogRecordProcessor,
	LoggerProvider,
	type LogRecordProcessor,
	SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import type { Logger } from './logger';
import { ConsoleLogRecordExporter, DebugSpanExporter } from './console';
import { instrumentFetch } from './fetch';
import { createLogger, patchConsole } from './logger';
import type { LogLevel } from '@agentuity/core';
import { JSONLLogExporter, JSONLTraceExporter, JSONLMetricExporter } from './exporters';
import { analytics as analyticsGlobal } from './globals';
import { getServiceUrls } from '@agentuity/server';

/**
 * Configuration for Analytics/OTel initialization
 */
export interface AnalyticsConfig {
	/** Service name (default: AGENTUITY_APP_NAME env) */
	name?: string;
	/** Service version (default: AGENTUITY_APP_VERSION env) */
	version?: string;
	/** OTel collector URL (default: derived from AGENTUITY_REGION) */
	url?: string;
	/** Bearer token for auth (default: AGENTUITY_SDK_KEY) */
	bearerToken?: string;
	/** Organization ID (default: AGENTUITY_CLOUD_ORG_ID) */
	orgId?: string;
	/** Project ID (default: AGENTUITY_CLOUD_PROJECT_ID) */
	projectId?: string;
	/** Deployment ID (default: AGENTUITY_CLOUD_DEPLOYMENT_ID) */
	deploymentId?: string;
	/** Environment (default: AGENTUITY_ENVIRONMENT or NODE_ENV) */
	environment?: string;
	/** CLI version (default: AGENTUITY_CLI_VERSION) */
	cliVersion?: string;
	/** SDK version */
	sdkVersion?: string;
	/** Development mode (default: AGENTUITY_SDK_DEV_MODE) */
	devmode?: boolean;
	/** Custom span processors */
	spanProcessors?: Array<SpanProcessor>;
	/** Log level (default: 'warn') */
	logLevel?: LogLevel;
	/** JSONL export base path (default: AGENTUITY_CLOUD_EXPORT_DIR) */
	jsonlBasePath?: string;
}

/**
 * Response from Analytics initialization
 */
export interface AnalyticsResponse {
	tracer: Tracer;
	meter: Meter;
	logger: Logger;
	shutdown: () => Promise<void>;
}

const devmodeExportInterval = 1_000; // 1 second
const productionExportInterval = 10_000; // 10 seconds

export const createResource = (config: Required<AnalyticsConfig>): Resource => {
	const {
		name,
		version,
		orgId,
		projectId,
		deploymentId,
		environment,
		devmode,
		cliVersion,
		sdkVersion,
	} = config;

	return resourceFromAttributes({
		[ATTR_SERVICE_NAME]: name,
		[ATTR_SERVICE_VERSION]: version,
		'@agentuity/orgId': orgId,
		'@agentuity/projectId': projectId,
		'@agentuity/deploymentId': deploymentId,
		'@agentuity/env': environment,
		'@agentuity/devmode': devmode,
		'@agentuity/sdkVersion': sdkVersion,
		'@agentuity/cliVersion': cliVersion,
	});
};

const createLoggerProvider = ({
	url,
	headers,
	resource,
	jsonlBasePath,
	useConsoleExporters,
	logLevel: _logLevel,
}: {
	url?: string;
	headers?: Record<string, string>;
	resource: Resource;
	logLevel: LogLevel;
	jsonlBasePath?: string;
	useConsoleExporters: boolean;
}) => {
	let processor: LogRecordProcessor;
	let exporter: OTLPLogExporter | JSONLLogExporter | undefined;

	if (useConsoleExporters) {
		processor = new SimpleLogRecordProcessor(new ConsoleLogRecordExporter(true));
	} else if (jsonlBasePath) {
		exporter = new JSONLLogExporter(jsonlBasePath);
		processor = new BatchLogRecordProcessor(exporter);
	} else if (url) {
		const otlpExporter = new OTLPLogExporter({
			url: `${url}/v1/logs`,
			headers,
			compression: CompressionAlgorithm.GZIP,
			timeoutMillis: 10_000,
		});
		exporter = otlpExporter;
		processor = new BatchLogRecordProcessor(otlpExporter);
	} else {
		processor = new SimpleLogRecordProcessor(new ConsoleLogRecordExporter(false));
	}
	const provider = new LoggerProvider({
		resource,
		processors: [processor],
	});
	LogsAPI.logs.setGlobalLoggerProvider(provider);

	return { processor, provider, exporter };
};

/**
 * Get configuration from environment variables
 */
function getConfigFromEnv(): Required<AnalyticsConfig> {
	const region = process.env.AGENTUITY_REGION ?? 'usc';
	const serviceUrls = getServiceUrls(region);

	return {
		name: process.env.AGENTUITY_APP_NAME ?? 'agentuity-app',
		version: process.env.AGENTUITY_APP_VERSION ?? '1.0.0',
		url: serviceUrls.otel,
		bearerToken: process.env.AGENTUITY_OTLP_BEARER_TOKEN ?? process.env.AGENTUITY_SDK_KEY ?? '',
		orgId: process.env.AGENTUITY_CLOUD_ORG_ID ?? 'unknown',
		projectId: process.env.AGENTUITY_CLOUD_PROJECT_ID ?? 'unknown',
		deploymentId: process.env.AGENTUITY_CLOUD_DEPLOYMENT_ID ?? 'unknown',
		environment: process.env.AGENTUITY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
		cliVersion: process.env.AGENTUITY_CLI_VERSION ?? 'unknown',
		sdkVersion: process.env.AGENTUITY_CLOUD_SDK_VERSION ?? 'unknown',
		devmode: process.env.AGENTUITY_SDK_DEV_MODE === 'true',
		logLevel: 'warn' as LogLevel,
		jsonlBasePath: process.env.AGENTUITY_CLOUD_EXPORT_DIR ?? '',
		spanProcessors: [],
	};
}

/**
 * Registers and initializes Analytics with the specified configuration.
 *
 * Idempotent: if called again (e.g. during bun --hot reload), the previous
 * instance is shut down before creating a new one.
 *
 * @param config - Optional configuration overrides (defaults from env vars)
 * @returns An object containing the tracer, logger, and shutdown function
 */
export function registerAnalytics(config?: AnalyticsConfig): AnalyticsResponse {
	// Shut down previous instance if this is a hot reload
	const previous = analyticsGlobal.get();
	if (previous) {
		previous.shutdown().catch(() => {});
	}

	// Merge provided config with env defaults
	const envConfig = getConfigFromEnv();
	const mergedConfig: Required<AnalyticsConfig> = {
		name: config?.name ?? envConfig.name,
		version: config?.version ?? envConfig.version,
		url: config?.url ?? envConfig.url,
		bearerToken: config?.bearerToken ?? envConfig.bearerToken,
		orgId: config?.orgId ?? envConfig.orgId,
		projectId: config?.projectId ?? envConfig.projectId,
		deploymentId: config?.deploymentId ?? envConfig.deploymentId,
		environment: config?.environment ?? envConfig.environment,
		cliVersion: config?.cliVersion ?? envConfig.cliVersion,
		sdkVersion: config?.sdkVersion ?? envConfig.sdkVersion,
		devmode: config?.devmode ?? envConfig.devmode,
		logLevel: config?.logLevel ?? envConfig.logLevel,
		jsonlBasePath: config?.jsonlBasePath ?? envConfig.jsonlBasePath,
		spanProcessors: config?.spanProcessors ?? envConfig.spanProcessors,
	};

	const {
		url,
		name,
		version,
		bearerToken,
		environment,
		orgId,
		projectId,
		deploymentId,
		devmode,
		logLevel,
		jsonlBasePath,
		spanProcessors,
	} = mergedConfig;

	let headers: Record<string, string> | undefined;
	if (bearerToken) {
		headers = { Authorization: `Bearer ${bearerToken}` };
	}

	// Use console debug exporters for local debugging
	const useConsoleExporters = process.env.AGENTUITY_DEBUG_OTEL_CONSOLE === 'true';

	const resource = createResource(mergedConfig);
	const loggerProvider = createLoggerProvider({
		url,
		headers,
		resource,
		logLevel,
		jsonlBasePath: jsonlBasePath || undefined,
		useConsoleExporters,
	});

	const attrs = {
		'@agentuity/orgId': orgId,
		'@agentuity/projectId': projectId,
		'@agentuity/deploymentId': deploymentId,
		'@agentuity/env': environment,
		'@agentuity/devmode': devmode,
		'@agentuity/language': 'javascript',
	};
	const logger = createLogger(!!url, attrs, logLevel);

	// Don't patch console if using console exporters (avoid double logging)
	if (!useConsoleExporters) {
		patchConsole(!!url, attrs, logLevel);
	}

	// Build trace exporter (OTLP or JSONL)
	const traceExporter = jsonlBasePath
		? new JSONLTraceExporter(jsonlBasePath)
		: url
			? new OTLPTraceExporter({
					url: `${url}/v1/traces`,
					headers,
					keepAlive: true,
					compression: CompressionAlgorithm.GZIP,
				})
			: undefined;

	// Build metric exporter (OTLP or JSONL)
	const metricExporter = jsonlBasePath
		? new JSONLMetricExporter(jsonlBasePath)
		: url
			? new OTLPMetricExporter({
					url: `${url}/v1/metrics`,
					headers,
					keepAlive: true,
					compression: CompressionAlgorithm.GZIP,
				})
			: undefined;

	// Create span processors
	const allSpanProcessors: SpanProcessor[] = [];

	if (traceExporter) {
		allSpanProcessors.push(new BatchSpanProcessor(traceExporter));
	}

	if (useConsoleExporters) {
		allSpanProcessors.push(new SimpleSpanProcessor(new DebugSpanExporter()));
	}

	// Add custom span processors
	allSpanProcessors.push(...spanProcessors);

	// Create metric readers
	const sdkMetricReader = metricExporter
		? new PeriodicExportingMetricReader({
				exporter: metricExporter,
				exportTimeoutMillis: devmode ? devmodeExportInterval : productionExportInterval,
				exportIntervalMillis: devmode ? devmodeExportInterval : productionExportInterval,
			})
		: undefined;

	const hostMetricReader = metricExporter
		? new PeriodicExportingMetricReader({
				exporter: metricExporter,
				exportTimeoutMillis: devmode ? devmodeExportInterval : productionExportInterval,
				exportIntervalMillis: devmode ? devmodeExportInterval : productionExportInterval,
			})
		: undefined;

	const meterProvider = hostMetricReader
		? new MeterProvider({ resource, readers: [hostMetricReader] })
		: undefined;

	if (meterProvider) {
		metrics.setGlobalMeterProvider(meterProvider);
	}

	const hostMetrics = meterProvider ? new HostMetrics({ meterProvider }) : undefined;

	let running = false;
	let instrumentationSDK: NodeSDK | undefined;

	if (url || useConsoleExporters) {
		const propagator = new CompositePropagator({
			propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
		});
		propagation.setGlobalPropagator(propagator);

		instrumentFetch();

		instrumentationSDK = new NodeSDK({
			logRecordProcessor: loggerProvider.processor,
			metricReader: sdkMetricReader,
			instrumentations: [getNodeAutoInstrumentations()],
			resource,
			textMapPropagator: propagator,
			spanProcessors: allSpanProcessors,
		});
		instrumentationSDK.start();
		hostMetrics?.start();

		logger.debug('Telemetry configured successfully');
		logger.debug('Sending telemetry data to %s', url);
		running = true;
	}

	const tracer = opentelemetry.trace.getTracer(name, version);
	const meter = metrics.getMeter(name, version);

	const shutdown = async () => {
		if (running) {
			running = false;
			logger.debug('shutting down OpenTelemetry');
			await loggerProvider.provider
				.forceFlush()
				.catch((e) => logger.warn('error in forceFlush. %s', e));
			await loggerProvider.exporter
				?.shutdown()
				.catch((e) => !devmode && logger.warn('error in shutdown of exporter. %s', e));
			await instrumentationSDK
				?.shutdown()
				.catch((e) => !devmode && logger.warn('error in shutdown of instrumentation. %s', e));
			logger.debug('shut down OpenTelemetry');
		}
	};

	if (url && bearerToken) {
		logger.info('connected to Agentuity Agent Cloud');
	}

	const instance: AnalyticsResponse = { tracer, meter, logger, shutdown };
	analyticsGlobal.set(instance);
	return instance;
}

/**
 * Alias for registerAnalytics (shorter name)
 */
export const register = registerAnalytics;

/**
 * Get the current analytics instance (or undefined if not initialized)
 */
export function getAnalytics(): AnalyticsResponse | undefined {
	return analyticsGlobal.get();
}

/**
 * Ensure analytics is initialized (auto-init from env vars if needed)
 */
export function ensureInitialized(): AnalyticsResponse {
	let instance = analyticsGlobal.get();
	if (!instance) {
		instance = registerAnalytics();
	}
	return instance;
}
