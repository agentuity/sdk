import {
	type SessionEventProvider,
	type SessionStartEvent,
	type SessionCompleteEvent,
} from '@agentuity/core';

/**
 * An implementation of the SessionEventProvider which is no-op
 */
export class LocalSessionEventProvider implements SessionEventProvider {
	/**
	 * called when the session starts
	 *
	 * @param event SessionStartEvent
	 */
	async start(_event: SessionStartEvent): Promise<void> {
		// no op
	}

	/**
	 * called when the session completes
	 *
	 * @param event SessionCompleteEvent
	 */
	async complete(_event: SessionCompleteEvent): Promise<void> {
		// no op
	}
}
