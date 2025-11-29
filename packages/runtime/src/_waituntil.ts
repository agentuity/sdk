import { context, SpanStatusCode, type Tracer, trace } from '@opentelemetry/api';
import type { Logger } from './logger';
import { internal } from './logger/internal';
import { StructuredError } from '@agentuity/core';

let running = 0;

/**
 * returns true if wait until is pending
 * @returns boolean
 */
export function hasWaitUntilPending(): boolean {
	internal.debug('hasWaitUntilPending called: %d', running);
	return running > 0;
}

const WaitUntilInvalidStateError = StructuredError(
	'WaitUntilInvalidStateError',
	'waitUntil cannot be called after waitUntilAll has been called'
);

const WaitUntilAllInvalidStateError = StructuredError(
	'WaitUntilAllInvalidStateError',
	'waitUntilAll can only be called once per instance'
);

export default class WaitUntilHandler {
	private promises: Promise<void>[];
	private tracer: Tracer;
	private started: number | undefined;
	private hasCalledWaitUntilAll = false;

	public constructor(tracer: Tracer) {
		this.tracer = tracer;
		this.promises = [];
	}

	public waitUntil(promise: Promise<void> | (() => void | Promise<void>)): void {
		if (this.hasCalledWaitUntilAll) {
			throw new WaitUntilInvalidStateError();
		}
		running++;
		internal.debug('wait until called, running: %d', running);
		const currentContext = context.active();

		// Start execution immediately, don't defer it
		const executingPromise = (async () => {
			if (this.started === undefined) {
				this.started = Date.now(); /// this first execution marks the start time
			}
			const span = this.tracer.startSpan('waitUntil', {}, currentContext);
			const spanContext = trace.setSpan(currentContext, span);
			try {
				internal.debug('starting waituntil');
				await context.with(spanContext, async () => {
					const resolvedPromise = typeof promise === 'function' ? promise() : promise;
					return await Promise.resolve(resolvedPromise);
				});
				internal.debug('completed waituntil');
				span.setStatus({ code: SpanStatusCode.OK });
			} catch (ex: unknown) {
				span.recordException(ex as Error);
				span.setStatus({ code: SpanStatusCode.ERROR });
				throw ex;
			} finally {
				span.end();
			}
			// NOTE: we only decrement when the promise is removed from the array in waitUntilAll
		})();

		// Store the executing promise for cleanup tracking
		this.promises.push(executingPromise);
	}

	public hasPending(): boolean {
		return this.promises.length > 0;
	}

	public async waitUntilAll(logger: Logger, sessionId: string): Promise<void> {
		internal.debug(`🔍 waitUntilAll() called for session ${sessionId} (count: %d)`, running);

		if (this.hasCalledWaitUntilAll) {
			throw new WaitUntilAllInvalidStateError();
		}
		this.hasCalledWaitUntilAll = true;

		if (this.promises.length === 0) {
			internal.debug('No promises to wait for, executing evals directly');
			// await this.executeEvalsForSession(logger, sessionId);
			return;
		}

		internal.debug(`⏳ Waiting for ${this.promises.length} promises to complete...`);
		try {
			// Promises are already executing, just wait for them to complete
			await Promise.all(this.promises);
			const duration = Date.now() - (this.started as number);
			internal.debug(
				'✅ All promises completed, marking session completed (duration %dms)',
				duration
			);
		} catch (ex) {
			logger.error('error sending session completed', ex);
		} finally {
			running -= this.promises.length;
			this.promises.length = 0;
		}
	}
}
