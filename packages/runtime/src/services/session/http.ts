import { APIClient, APIResponseSchemaNoData } from '@agentuity/server';
import {
	type SessionEventProvider,
	type SessionStartEvent,
	SessionStartEventDelayedSchema,
	SessionCompleteEventDelayedSchema,
	type SessionCompleteEvent,
} from '@agentuity/core';

/**
 * An implementation of the SessionEventProvider which uses HTTP for delivery
 */
export class HTTPSessionEventProvider implements SessionEventProvider {
	private apiClient: APIClient;

	constructor(client: APIClient) {
		this.apiClient = client;
	}

	/**
	 * called when the session starts
	 *
	 * @param event SessionStartEvent
	 */
	async start(event: SessionStartEvent): Promise<void> {
		const resp = await this.apiClient.request(
			'POST',
			'/session/2025-03-17',
			APIResponseSchemaNoData(),
			{ ...event, timestamp: Date.now() },
			SessionStartEventDelayedSchema
		);
		if (resp.success) {
			return;
		}
		throw new Error(resp.message);
	}

	/**
	 * called when the session completes
	 *
	 * @param event SessionCompleteEvent
	 */
	async complete(event: SessionCompleteEvent): Promise<void> {
		const resp = await this.apiClient.request(
			'PUT',
			'/session/2025-03-17',
			APIResponseSchemaNoData(),
			{ ...event, timestamp: Date.now() },
			SessionCompleteEventDelayedSchema
		);
		if (resp.success) {
			return;
		}
		throw new Error(resp.message);
	}
}
