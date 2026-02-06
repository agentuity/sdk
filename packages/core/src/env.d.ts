/**
 * SDK Environment Variable Type Definitions
 *
 * This file augments NodeJS.ProcessEnv with all Agentuity SDK environment variables.
 * All variables are optional (may or may not be set at runtime).
 */

declare global {
	namespace NodeJS {
		interface ProcessEnv {
			// ============================================================================
			// Authentication & Secrets
			// ============================================================================

			/**
			 * SDK authentication key for Agentuity services.
			 * Used by the runtime to authenticate API requests.
			 */
			AGENTUITY_SDK_KEY?: string;

			/**
			 * Auth secret for session signing and encryption.
			 * Falls back to BETTER_AUTH_SECRET if not set.
			 */
			AGENTUITY_AUTH_SECRET?: string;

			/**
			 * Cloud base URL for authentication.
			 * Fallback chain: AGENTUITY_BASE_URL → BETTER_AUTH_URL
			 */
			AGENTUITY_CLOUD_BASE_URL?: string;

			/** Base URL fallback for cloud services */
			AGENTUITY_BASE_URL?: string;

			/** User ID for authentication context */
			AGENTUITY_USER_ID?: string;

			// ============================================================================
			// Service URLs & Endpoints
			// ============================================================================

			/**
			 * Region identifier for service URL construction.
			 * Values: 'usc' (US Central), 'local', etc.
			 */
			AGENTUITY_REGION?: string;

			/** Transport service URL for agent communication */
			AGENTUITY_TRANSPORT_URL?: string;

			/** Catalyst service URL for AI model access */
			AGENTUITY_CATALYST_URL?: string;

			/** Key-value storage service URL */
			AGENTUITY_KEYVALUE_URL?: string;

			/** Vector storage service URL */
			AGENTUITY_VECTOR_URL?: string;

			/** Sandbox execution service URL */
			AGENTUITY_SANDBOX_URL?: string;

			/** Stream storage service URL */
			AGENTUITY_STREAM_URL?: string;

			/** OpenTelemetry Protocol endpoint URL */
			AGENTUITY_OTLP_URL?: string;

			/** AI Gateway URL for model routing */
			AGENTUITY_AIGATEWAY_URL?: string;

			/** Main API URL for Agentuity services */
			AGENTUITY_API_URL?: string;

			/** App/dashboard URL */
			AGENTUITY_APP_URL?: string;

			// ============================================================================
			// Logging & Observability
			// ============================================================================

			/**
			 * Log level for application logging.
			 * Values: 'trace', 'debug', 'info', 'warn', 'error'
			 */
			AGENTUITY_LOG_LEVEL?: string;

			/**
			 * SDK-specific log level (overrides AGENTUITY_LOG_LEVEL for SDK internals).
			 * Values: 'trace', 'debug', 'info', 'warn', 'error'
			 */
			AGENTUITY_SDK_LOG_LEVEL?: string;

			/** Enable OpenTelemetry debug output to console */
			AGENTUITY_DEBUG_OTEL_CONSOLE?: string;

			/**
			 * Bearer token for OTLP authentication.
			 * Falls back to AGENTUITY_SDK_KEY if not set.
			 */
			AGENTUITY_OTLP_BEARER_TOKEN?: string;

			/** Directory for cloud telemetry export */
			AGENTUITY_CLOUD_EXPORT_DIR?: string;

			/** Log level for Gravity logging subsystem */
			AGENTUITY_GRAVITY_LOG_LEVEL?: string;

			/** File path for clean/structured log output */
			AGENTUITY_CLEAN_LOGS_FILE?: string;

			/** Internal session ID for request correlation */
			AGENTUITY_INTERNAL_SESSION_ID?: string;

			// ============================================================================
			// Build & Runtime Configuration
			// ============================================================================

			/**
			 * Environment name for the application.
			 * Falls back to NODE_ENV if not set.
			 */
			AGENTUITY_ENVIRONMENT?: string;

			/** Node.js environment (development, production, test) */
			NODE_ENV?: string;

			/** Enable SDK development mode with additional debugging */
			AGENTUITY_SDK_DEV_MODE?: string;

			/**
			 * Flag indicating code is running inside the Agentuity agent runtime.
			 * Set automatically by the runtime.
			 */
			AGENTUITY_RUNTIME?: string;

			/** Environment shorthand (dev, staging, prod) */
			AGENTUITY_ENV?: string;

			/** HTTP server port */
			PORT?: string;

			/** Agentuity-specific server port (overrides PORT) */
			AGENTUITY_PORT?: string;

			/** Vite development server port */
			VITE_PORT?: string;

			/** Development mode flag */
			DEV?: string;

			// ============================================================================
			// Cloud Deployment & Metadata
			// ============================================================================

			/** SDK version deployed to cloud */
			AGENTUITY_CLOUD_SDK_VERSION?: string;

			/** CLI version used for deployment */
			AGENTUITY_CLI_VERSION?: string;

			/** Organization ID in Agentuity Cloud */
			AGENTUITY_CLOUD_ORG_ID?: string;

			/** Project ID in Agentuity Cloud */
			AGENTUITY_CLOUD_PROJECT_ID?: string;

			/** Deployment ID in Agentuity Cloud */
			AGENTUITY_CLOUD_DEPLOYMENT_ID?: string;

			/**
			 * Cloud domains configuration.
			 * JSON array of domain strings.
			 */
			AGENTUITY_CLOUD_DOMAINS?: string;

			/** Local project directory path */
			AGENTUITY_PROJECT_DIR?: string;

			/** Configuration profile name */
			AGENTUITY_PROFILE?: string;

			/** Deployment name/identifier */
			AGENTUITY_DEPLOYMENT?: string;

			// ============================================================================
			// Database
			// ============================================================================

			/**
			 * Database connection URL.
			 * Standard connection string format: protocol://user:pass@host:port/db
			 */
			DATABASE_URL?: string;

			// ============================================================================
			// Development & Testing
			// ============================================================================

			/** CI environment flag (set in CI/CD pipelines) */
			CI?: string;

			/**
			 * Sandbox ID when running in an Agentuity sandbox environment.
			 * Set automatically by the sandbox runtime.
			 */
			AGENTUITY_SANDBOX_ID?: string;

			// ============================================================================
			// Third-Party & System
			// ============================================================================

			/** S3-compatible endpoint URL */
			S3_ENDPOINT?: string;

			/** AWS endpoint URL override */
			AWS_ENDPOINT?: string;

			/**
			 * Trusted domains for authentication.
			 * Comma-separated list of domain patterns.
			 */
			AUTH_TRUSTED_DOMAINS?: string;
		}
	}
}

export {};
