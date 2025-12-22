import {
	APIClient,
	APIResponseSchemaNoData,
	ValidationInputError,
	ValidationOutputError,
} from '@agentuity/server';
import {
	type EvalRunEventProvider,
	type EvalRunStartEvent,
	EvalRunStartEventDelayedSchema,
	EvalRunCompleteEventDelayedSchema,
	type EvalRunCompleteEvent,
	type Logger,
	StructuredError,
} from '@agentuity/core';
import { internal } from '../../logger/internal';

const EvalRunResponseError = StructuredError('EvalRunResponseError');

/**
 * An implementation of the EvalRunEventProvider which uses HTTP for delivery
 */
export class HTTPEvalRunEventProvider implements EvalRunEventProvider {
	private apiClient: APIClient;
	private logger: Logger;
	private baseUrl: string;

	constructor(client: APIClient, logger: Logger, baseUrl: string) {
		this.apiClient = client;
		this.logger = logger;
		this.baseUrl = baseUrl;
	}

	/**
	 * called when the eval run starts
	 *
	 * @param event EvalRunStartEvent
	 */
	async start(event: EvalRunStartEvent): Promise<void> {
		const endpoint = '/evalrun/2025-03-17';
		const fullUrl = `${this.baseUrl}${endpoint}`;

		const payload = { ...event, timestamp: Date.now() };

		// Log full payload using internal logger
		internal.info('[EVALRUN HTTP] ========== START PAYLOAD ==========');
		internal.info('[EVALRUN HTTP] id: %s', payload.id);
		internal.info('[EVALRUN HTTP] evalId: %s', payload.evalId);
		internal.info('[EVALRUN HTTP] evalIdentifier: %s', payload.evalIdentifier);
		internal.info('[EVALRUN HTTP] sessionId: %s', payload.sessionId);
		internal.info('[EVALRUN HTTP] orgId: %s', payload.orgId);
		internal.info('[EVALRUN HTTP] projectId: %s', payload.projectId);
		internal.info('[EVALRUN HTTP] devmode: %s', payload.devmode);
		internal.info('[EVALRUN HTTP] deploymentId: %s', payload.deploymentId);
		internal.info('[EVALRUN HTTP] spanId: %s', payload.spanId);
		internal.info('[EVALRUN HTTP] URL: POST %s', fullUrl);
		internal.info('[EVALRUN HTTP] ============================================');

		try {
			const resp = await this.apiClient.post(
				endpoint,
				payload,
				APIResponseSchemaNoData(),
				EvalRunStartEventDelayedSchema
			);
			if (resp.success) {
				this.logger.debug('[EVALRUN HTTP] Start event sent successfully: %s', event.id);
				return;
			}
			const errorMsg = resp.message || 'Unknown error';
			this.logger.error('[EVALRUN HTTP] Start event failed: %s, error: %s', event.id, errorMsg);
			throw new EvalRunResponseError({ message: errorMsg });
		} catch (error) {
			this.logger.error(
				'[EVALRUN HTTP] Start event exception: %s, error: %s',
				event.id,
				error instanceof Error ? error.message : String(error)
			);
			// Log validation errors if available
			if (
				(error instanceof ValidationInputError || error instanceof ValidationOutputError) &&
				error.issues?.length
			) {
				this.logger.error(
					'[EVALRUN HTTP] Validation issues: %s',
					JSON.stringify(error.issues, null, 2)
				);
			}
			throw error;
		}
	}

	/**
	 * called when the eval run completes
	 *
	 * @param event EvalRunCompleteEvent
	 */
	async complete(event: EvalRunCompleteEvent): Promise<void> {
		const endpoint = '/evalrun/2025-03-17';
		const fullUrl = `${this.baseUrl}${endpoint}`;
		this.logger.debug('[EVALRUN HTTP] Sending eval run complete event: %s', event.id);
		this.logger.debug('[EVALRUN HTTP] URL: %s %s', 'PUT', fullUrl);
		this.logger.debug('[EVALRUN HTTP] Base URL: %s', this.baseUrl);

		try {
			const resp = await this.apiClient.put(
				endpoint,
				{ ...event, timestamp: Date.now() },
				APIResponseSchemaNoData(),
				EvalRunCompleteEventDelayedSchema
			);
			if (resp.success) {
				this.logger.debug('[EVALRUN HTTP] Complete event sent successfully: %s', event.id);
				return;
			}
			const errorMsg = resp.message || 'Unknown error';
			this.logger.error(
				'[EVALRUN HTTP] Complete event failed: %s, error: %s',
				event.id,
				errorMsg
			);
			throw new EvalRunResponseError({ message: errorMsg });
		} catch (error) {
			this.logger.error(
				'[EVALRUN HTTP] Complete event exception: %s, error: %s',
				event.id,
				error instanceof Error ? error.message : String(error)
			);
			throw error;
		}
	}
}
