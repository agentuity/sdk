import {
	type EvalRunEventProvider,
	type EvalRunStartEvent,
	type EvalRunCompleteEvent,
} from '@agentuity/core';

/**
 * An implementation of the EvalRunEventProvider which writes to JSON files
 */
export class JSONEvalRunEventProvider implements EvalRunEventProvider {
	private exportDir: string;

	constructor(exportDir: string) {
		this.exportDir = exportDir;
	}

	/**
	 * called when the eval run starts
	 *
	 * @param event EvalRunStartEvent
	 */
	async start(event: EvalRunStartEvent): Promise<void> {
		const data = {
			type: 'evalrun_start',
			timestamp: Date.now(),
			...event,
		};
		const filename = `${this.exportDir}/evalrun-${event.id}-start.json`;
		await Bun.write(filename, JSON.stringify(data, null, 2));
	}

	/**
	 * called when the eval run completes
	 *
	 * @param event EvalRunCompleteEvent
	 */
	async complete(event: EvalRunCompleteEvent): Promise<void> {
		const data = {
			type: 'evalrun_complete',
			timestamp: Date.now(),
			...event,
		};
		const filename = `${this.exportDir}/evalrun-${event.id}-complete.json`;
		await Bun.write(filename, JSON.stringify(data, null, 2));
	}
}
