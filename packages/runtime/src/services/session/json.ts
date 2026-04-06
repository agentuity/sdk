import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
	type SessionEventProvider,
	type SessionStartEvent,
	type SessionCompleteEvent,
} from '@agentuity/core';

/**
 * An implementation of the SessionEventProvider which uses JSON logs for delivery
 */
export class JSONSessionEventProvider implements SessionEventProvider {
	private directory: string;

	constructor(directory: string) {
		this.directory = directory;
	}
	private makeFilename(type: 'start' | 'complete'): string {
		return join(this.directory, `session-${type}.${Date.now()}${randomUUID()}.json`);
	}
	/**
	 * called when the session starts
	 *
	 * @param event SessionStartEvent
	 */
	async start(event: SessionStartEvent): Promise<void> {
		const filename = this.makeFilename('start');
		const payload = JSON.stringify({ ...event, timestamp: new Date() }) + '\n';
		await Bun.file(filename).write(payload);
	}

	/**
	 * called when the session completes
	 *
	 * @param event SessionCompleteEvent
	 */
	async complete(event: SessionCompleteEvent): Promise<void> {
		const filename = this.makeFilename('complete');
		const payload = JSON.stringify({ ...event, timestamp: new Date() }) + '\n';
		await Bun.file(filename).write(payload);
	}
}
