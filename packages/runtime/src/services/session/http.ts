import { type APIClient, APIResponseSchemaNoData } from '@agentuity/server';
import {
	type SessionEventProvider,
	type SessionStartEvent,
	SessionStartEventDelayedSchema,
	SessionCompleteEventDelayedSchema,
	type SessionCompleteEvent,
	type Logger,
	StructuredError,
} from '@agentuity/core';
import { context, trace, SpanStatusCode } from '@opentelemetry/api';
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

		const tracer = trace.getTracer('session');
		const currentContext = context.active();
		const span = tracer.startSpan('Session Start', {}, currentContext);

		try {
			internal.info('[session-http] sending start event: %s', event.id);
			this.logger.debug('Sending session start event: %s', event.id);

			const spanContext = trace.setSpan(currentContext, span);
			const resp = await context.with(spanContext, () =>
				this.apiClient.post(
					'/session',
					{ ...event, timestamp: Date.now() },
					APIResponseSchemaNoData(),
					SessionStartEventDelayedSchema
				)
			);

			if (resp.success) {
				internal.info('[session-http] start event sent successfully: %s', event.id);
				this.logger.debug('Session start event sent successfully: %s', event.id);
				this.startedSessions.add(event.id);
				span.setStatus({ code: SpanStatusCode.OK });
				return;
			}
			internal.info('[session-http] start event failed: %s - %s', event.id, resp.message);
			span.setStatus({ code: SpanStatusCode.ERROR, message: resp.message });
			throw new SessionResponseError({ message: resp.message });
		} catch (error) {
			span.recordException(error as Error);
			span.setStatus({
				code: SpanStatusCode.ERROR,
				message: error instanceof Error ? error.message : String(error),
			});
			throw error;
		} finally {
			span.end();
		}
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
		// Always create the "Session End" span for telemetry purposes.
		// This span is used by Catalyst to detect when a session has completed,
		// so it must always be emitted even if we don't send the HTTP event.
		const tracer = trace.getTracer('session');
		const currentContext = context.active();
		const span = tracer.startSpan('Session End', {}, currentContext);

		try {
			// Only send HTTP complete event if we successfully sent a start event.
			// This prevents sending orphaned complete events when start was skipped.
			// However, we still create the span above for telemetry.
			if (!this.startedSessions.has(event.id)) {
				internal.info(
					'[session-http] skipping HTTP complete event (no matching start), but emitting Session End span: %s',
					event.id
				);
				span.setStatus({ code: SpanStatusCode.OK });
				return;
			}

			internal.info(
				'[session-http] sending complete event: %s, userData: %s',
				event.id,
				event.userData ? `${event.userData.length} bytes` : 'none'
			);
			this.logger.debug('Sending session complete event: %s', event.id);

			const spanContext = trace.setSpan(currentContext, span);
			const resp = await context.with(spanContext, () =>
				this.apiClient.put(
					'/session',
					{ ...event, timestamp: Date.now() },
					APIResponseSchemaNoData(),
					SessionCompleteEventDelayedSchema
				)
			);

			if (resp.success) {
				this.startedSessions.delete(event.id);
				internal.info('[session-http] complete event sent successfully: %s', event.id);
				this.logger.debug('Session complete event sent successfully: %s', event.id);
				span.setStatus({ code: SpanStatusCode.OK });
				return;
			}
			internal.info('[session-http] complete event failed: %s - %s', event.id, resp.message);
			span.setStatus({ code: SpanStatusCode.ERROR, message: resp.message });
			throw new SessionResponseError({ message: resp.message });
		} catch (error) {
			span.recordException(error as Error);
			span.setStatus({
				code: SpanStatusCode.ERROR,
				message: error instanceof Error ? error.message : String(error),
			});
			throw error;
		} finally {
			span.end();
		}
	}
}
