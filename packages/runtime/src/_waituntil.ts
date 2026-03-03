import { context, SpanStatusCode, type Tracer, trace } from '@opentelemetry/api';
import type { Logger } from './logger/index.ts';
import { internal } from './logger/internal.ts';
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

	public waitUntil(
		promise: Promise<void> | (() => void | Promise<void>),
		options?: { noSpan?: boolean }
	): void {
		if (this.hasCalledWaitUntilAll) {
			throw new WaitUntilInvalidStateError();
		}
		running++;
		internal.debug('wait until called, running: %d', running);
		const currentContext = context.active();
		const skipSpan = options?.noSpan === true;

		// Start execution immediately, don't defer it
		const executingPromise = (async () => {
			if (this.started === undefined) {
				this.started = Date.now(); /// this first execution marks the start time
			}

			try {
				if (skipSpan) {
					// Execute without creating a span (used for coordination tasks)
					// Still propagate context so downstream async operations inherit the original context
					try {
						internal.debug('starting waituntil (no span)');
						await context.with(currentContext, async () => {
							const resolvedPromise = typeof promise === 'function' ? promise() : promise;
							return await Promise.resolve(resolvedPromise);
						});
						internal.debug('completed waituntil (no span)');
					} catch (ex: unknown) {
						// Log the error but don't re-throw - background tasks should never crash the server
						internal.error('Background task error: %s', ex);
					}
				} else {
					// Execute with a span (default behavior)
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
						// Log the error but don't re-throw - background tasks should never crash the server
						internal.error('Background task error: %s', ex);
					} finally {
						span.end();
					}
				}
			} finally {
				// Decrement running counter when promise completes (success or failure)
				running--;
				internal.debug('waituntil completed, running: %d', running);
			}
		})();

		// Store the executing promise for cleanup tracking
		this.promises.push(executingPromise);
	}

	public hasPending(): boolean {
		return this.promises.length > 0;
	}

	/**
	 * Returns a snapshot of currently pending promises.
	 * This allows waiting for specific promises without including promises added later.
	 * Useful to avoid deadlock when the caller will add their own promise via waitUntil.
	 */
	public getPendingSnapshot(): Promise<void>[] {
		return [...this.promises];
	}

	/**
	 * Wait for a specific set of promises to complete.
	 * Unlike waitUntilAll, this doesn't mark the handler as "all called" and
	 * allows additional waitUntil calls afterward.
	 */
	public async waitForPromises(
		promises: Promise<void>[],
		logger: Logger,
		sessionId: string
	): Promise<void> {
		if (promises.length === 0) {
			internal.debug('No promises to wait for in snapshot');
			return;
		}

		internal.debug(
			`⏳ Waiting for ${promises.length} snapshot promises to complete (session: ${sessionId})...`
		);
		try {
			const results = await Promise.allSettled(promises);

			// Log any failures
			const failures = results.filter((r) => r.status === 'rejected');
			if (failures.length > 0) {
				logger.error('%d background task(s) failed during execution', failures.length);
			}

			internal.debug('✅ Snapshot promises completed (session: %s)', sessionId);
		} catch (ex) {
			logger.error('error waiting for snapshot promises', ex);
		}
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
			// Use allSettled so one failing promise doesn't stop others
			const results = await Promise.allSettled(this.promises);
			const duration = Date.now() - (this.started as number);

			// Log any failures
			const failures = results.filter((r) => r.status === 'rejected');
			if (failures.length > 0) {
				logger.error('%d background task(s) failed during execution', failures.length);
			}

			internal.debug(
				'✅ All promises completed, marking session completed (duration %dms)',
				duration
			);
		} catch (ex) {
			logger.error('error sending session completed', ex);
		} finally {
			// Note: running counter is decremented by each promise when it completes,
			// so we don't decrement here. Just clear the array.
			this.promises.length = 0;
		}
	}
}
