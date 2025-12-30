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
 * An implementation of the SessionEventProvider which uses HTTP for delivery.
 *
 * This provider checks that the event has required fields (orgId, projectId for start events)
 * before sending to the backend. If required fields are missing, the event is silently skipped.
 */
export class HTTPSessionEventProvider implements SessionEventProvider {
	private apiClient: APIClient;
	private logger: Logger;

	constructor(client: APIClient, logger: Logger) {
		this.apiClient = client;
		this.logger = logger;
	}

	/**
	 * Check if a start event has all required fields for HTTP delivery
	 */
	private canSendStartEvent(event: SessionStartEvent): boolean {
		// orgId and projectId are required for the backend
		if (!event.orgId || !event.projectId) {
			internal.info(
				'[session-http] skipping start event - missing required fields: orgId=%s, projectId=%s',
				event.orgId ?? 'missing',
				event.projectId ?? 'missing'
			);
			return false;
		}
		return true;
	}

	/**
	 * called when the session starts
	 *
	 * @param event SessionStartEvent
	 */
	async start(event: SessionStartEvent): Promise<void> {
		// Check required fields before sending
		if (!this.canSendStartEvent(event)) {
			return;
		}

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
			this.startedSessions.add(event.id);
			return;
		}
		internal.info('[session-http] start event failed: %s - %s', event.id, resp.message);
		throw new SessionResponseError({ message: resp.message });
	}

	/**
	 * Track session IDs that have been started (to know if we should send complete)
	 */
	private startedSessions = new Set<string>();

	/**
	 * called when the session completes
	 *
	 * @param event SessionCompleteEvent
	 */
	async complete(event: SessionCompleteEvent): Promise<void> {
		// Only send complete if we successfully sent a start event
		// This prevents sending orphaned complete events when start was skipped
		if (!this.startedSessions.has(event.id)) {
			internal.info('[session-http] skipping complete event - no matching start: %s', event.id);
			return;
		}
		this.startedSessions.delete(event.id);

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
