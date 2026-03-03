import {
	type SessionEventProvider,
	type SessionStartEvent,
	type SessionCompleteEvent,
} from '@agentuity/core';
import { internal } from '../../logger/internal';

/**
 * An implementation of the SessionEventProvider which is no-op
 */
export class LocalSessionEventProvider implements SessionEventProvider {
	/**
	 * called when the session starts
	 *
	 * @param event SessionStartEvent
	 */
	async start(event: SessionStartEvent): Promise<void> {
		internal.info('[session-local] start event (no-op): %s', event.id);
	}

	/**
	 * called when the session completes
	 *
	 * @param event SessionCompleteEvent
	 */
	async complete(event: SessionCompleteEvent): Promise<void> {
		internal.info(
			'[session-local] complete event (no-op): %s, userData: %s',
			event.id,
			event.userData ? `${event.userData.length} bytes` : 'none'
		);
	}
}
