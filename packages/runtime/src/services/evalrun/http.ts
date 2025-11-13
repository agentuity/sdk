import { APIClient, APIResponseSchemaNoData, ValidationError } from '@agentuity/server';
import {
	type EvalRunEventProvider,
	type EvalRunStartEvent,
	EvalRunStartEventDelayedSchema,
	EvalRunCompleteEventDelayedSchema,
	type EvalRunCompleteEvent,
	type Logger,
} from '@agentuity/core';

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
		this.logger.debug('[EVALRUN HTTP] Sending eval run start event: %s', event.id);
		this.logger.debug('[EVALRUN HTTP] URL: %s %s', 'POST', fullUrl);
		this.logger.debug('[EVALRUN HTTP] Base URL: %s', this.baseUrl);

		const payload = { ...event, timestamp: Date.now() };
		this.logger.debug('[EVALRUN HTTP] Start event payload: %s', JSON.stringify(payload, null, 2));

		try {
			const resp = await this.apiClient.request(
				'POST',
				endpoint,
				APIResponseSchemaNoData(),
				payload,
				EvalRunStartEventDelayedSchema
			);
			if (resp.success) {
				this.logger.debug('[EVALRUN HTTP] Start event sent successfully: %s', event.id);
				return;
			}
			const errorMsg = resp.message || 'Unknown error';
			this.logger.error('[EVALRUN HTTP] Start event failed: %s, error: %s', event.id, errorMsg);
			throw new Error(errorMsg);
		} catch (error) {
			this.logger.error(
				'[EVALRUN HTTP] Start event exception: %s, error: %s',
				event.id,
				error instanceof Error ? error.message : String(error)
			);
			// Log validation errors if available
			if (error instanceof ValidationError) {
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
			const resp = await this.apiClient.request(
				'PUT',
				endpoint,
				APIResponseSchemaNoData(),
				{ ...event, timestamp: Date.now() },
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
			throw new Error(errorMsg);
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
