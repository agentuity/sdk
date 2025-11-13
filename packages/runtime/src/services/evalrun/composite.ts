import {
	type EvalRunEventProvider,
	type EvalRunStartEvent,
	type EvalRunCompleteEvent,
} from '@agentuity/core';

/**
 * An implementation of the EvalRunEventProvider which wraps multiple providers
 */
export class CompositeEvalRunEventProvider implements EvalRunEventProvider {
	private providers: EvalRunEventProvider[];

	constructor(...providers: EvalRunEventProvider[]) {
		this.providers = providers;
	}

	/**
	 * called when the eval run starts
	 *
	 * @param event EvalRunStartEvent
	 */
	async start(event: EvalRunStartEvent): Promise<void> {
		await Promise.allSettled(this.providers.map((provider) => provider.start(event)));
	}

	/**
	 * called when the eval run completes
	 *
	 * @param event EvalRunCompleteEvent
	 */
	async complete(event: EvalRunCompleteEvent): Promise<void> {
		await Promise.allSettled(this.providers.map((provider) => provider.complete(event)));
	}
}
