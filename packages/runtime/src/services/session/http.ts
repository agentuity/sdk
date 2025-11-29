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
		this.logger.debug('Sending session start event: %s', event.id);
		const resp = await this.apiClient.request(
			'POST',
			'/session/2025-03-17',
			APIResponseSchemaNoData(),
			{ ...event, timestamp: Date.now() },
			SessionStartEventDelayedSchema
		);
		if (resp.success) {
			this.logger.debug('Session start event sent successfully: %s', event.id);
			return;
		}
		throw new SessionResponseError({ message: resp.message });
	}

	/**
	 * called when the session completes
	 *
	 * @param event SessionCompleteEvent
	 */
	async complete(event: SessionCompleteEvent): Promise<void> {
		this.logger.debug('Sending session complete event: %s', event.id);
		const resp = await this.apiClient.request(
			'PUT',
			'/session/2025-03-17',
			APIResponseSchemaNoData(),
			{ ...event, timestamp: Date.now() },
			SessionCompleteEventDelayedSchema
		);
		if (resp.success) {
			this.logger.debug('Session complete event sent successfully: %s', event.id);
			return;
		}
		throw new SessionResponseError({ message: resp.message });
	}
}
