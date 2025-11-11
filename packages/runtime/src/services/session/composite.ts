import {
	type SessionCompleteEvent,
	type SessionEventProvider,
	type SessionStartEvent,
} from '@agentuity/core';

/**
 * A composite implementation of SessionEventProvider that forwards events to multiple providers
 */
export class CompositeSessionEventProvider implements SessionEventProvider {
	private providers: SessionEventProvider[];

	constructor(...providers: SessionEventProvider[]) {
		this.providers = providers;
	}
	/**
	 * called when the session starts
	 *
	 * @param event SessionStartEvent
	 */
	async start(event: SessionStartEvent): Promise<void> {
		await Promise.all(this.providers.map((p) => p.start(event)));
	}

	/**
	 * called when the session completes
	 *
	 * @param event SessionCompleteEvent
	 */
	async complete(event: SessionCompleteEvent): Promise<void> {
		await Promise.all(this.providers.map((p) => p.complete(event)));
	}
}
