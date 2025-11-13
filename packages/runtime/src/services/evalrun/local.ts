import {
	type EvalRunEventProvider,
	type EvalRunStartEvent,
	type EvalRunCompleteEvent,
} from '@agentuity/core';

/**
 * An implementation of the EvalRunEventProvider which just logs locally
 */
export class LocalEvalRunEventProvider implements EvalRunEventProvider {
	/**
	 * called when the eval run starts
	 *
	 * @param event EvalRunStartEvent
	 */
	async start(event: EvalRunStartEvent): Promise<void> {
		console.log('EvalRun started:', event);
	}

	/**
	 * called when the eval run completes
	 *
	 * @param event EvalRunCompleteEvent
	 */
	async complete(event: EvalRunCompleteEvent): Promise<void> {
		console.log('EvalRun completed:', event);
	}
}
