import { APIClient, APIResponseSchemaNoData } from '@agentuity/server';
import {
	type SessionEventProvider,
	type SessionStartEvent,
	SessionStartEventDelayedSchema,
	SessionCompleteEventDelayedSchema,
	type SessionCompleteEvent,
	type Logger,
	StructuredError,
} from '@agentuity/core';
import { internal } from '../../logger/internal';

const SessionResponseError = StructuredError('SessionResponseError');

/**
 * An implementation of the SessionEventProvider which uses HTTP for delivery
 */
export class HTTPSessionEventProvider implements SessionEventProvider {
	private apiClient: APIClient;
	private logger: Logger;

	constructor(client: APIClient, logger: Logger) {
		this.apiClient = client;
		this.logger = logger;
	}

	/**
	 * called when the session starts
	 *
	 * @param event SessionStartEvent
	 */
	async start(event: SessionStartEvent): Promise<void> {
		internal.info('[session-http] sending start event: %s', event.id);
		this.logger.debug('Sending session start event: %s', event.id);
		const resp = await this.apiClient.post(
			'/session/2025-03-17',
			{ ...event, timestamp: Date.now() },
			APIResponseSchemaNoData(),
			SessionStartEventDelayedSchema
		);
		if (resp.success) {
			internal.info('[session-http] start event sent successfully: %s', event.id);
			this.logger.debug('Session start event sent successfully: %s', event.id);
			return;
		}
		internal.info('[session-http] start event failed: %s - %s', event.id, resp.message);
		throw new SessionResponseError({ message: resp.message });
	}

	/**
	 * called when the session completes
	 *
	 * @param event SessionCompleteEvent
	 */
	async complete(event: SessionCompleteEvent): Promise<void> {
		internal.info(
			'[session-http] sending complete event: %s, userData: %s',
			event.id,
			event.userData ? `${event.userData.length} bytes` : 'none'
		);
		this.logger.debug('Sending session complete event: %s', event.id);
		const resp = await this.apiClient.put(
			'/session/2025-03-17',
			{ ...event, timestamp: Date.now() },
			APIResponseSchemaNoData(),
			SessionCompleteEventDelayedSchema
		);
		if (resp.success) {
			internal.info('[session-http] complete event sent successfully: %s', event.id);
			this.logger.debug('Session complete event sent successfully: %s', event.id);
			return;
		}
		internal.info('[session-http] complete event failed: %s - %s', event.id, resp.message);
		throw new SessionResponseError({ message: resp.message });
	}
}
