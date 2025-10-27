import { context, SpanStatusCode, type Tracer, trace } from '@opentelemetry/api';
import type { Logger } from './logger';
import { internal } from './logger/internal';

let running = 0;

/**
 * returns true if wait until is pending
 * @returns boolean
 */
export function hasWaitUntilPending(): boolean {
	internal.debug('hasWaitUntilPending called: %d', running);
	return running > 0;
}

export default class WaitUntilHandler {
	private promises: Promise<void>[];
	private tracer: Tracer;
	private started: number | undefined;
	private hasCalledWaitUntilAll = false;
	private setHeader: (k: string, v: string) => void;

	public constructor(setHeader: (k: string, v: string) => void, tracer: Tracer) {
		this.tracer = tracer;
		this.promises = [];
		this.setHeader = setHeader;
		this.hasCalledWaitUntilAll = false;
	}

	public waitUntil(promise: Promise<void> | (() => void | Promise<void>)): void {
		if (this.hasCalledWaitUntilAll) {
			throw new Error('Cannot call waitUntil after waitUntilAll has been called');
		}
		this.setHeader('x-agentuity-session-pending', 'true');
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

	private async markSessionCompleted(sessionId: string, duration: number) {
		// TODO:
		internal.debug('markSessionCompleted sessionId: %s, duration: %dms', sessionId, duration);
	}

	public async waitUntilAll(logger: Logger, sessionId: string): Promise<void> {
		internal.debug(`🔍 waitUntilAll() called for session ${sessionId} (count: %d)`, running);

		if (this.hasCalledWaitUntilAll) {
			throw new Error('waitUntilAll can only be called once per instance');
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
			internal.debug('✅ All promises completed, marking session completed');
			await this.markSessionCompleted(sessionId, duration);

			// // Execute evals after session completion
			// internal.debug('🚀 Starting eval execution after session completion');
			// await this.executeEvalsForSession(logger, sessionId);
		} catch (ex) {
			logger.error('error sending session completed', ex);
		} finally {
			running -= this.promises.length;
			this.promises.length = 0;
		}
	}

	// /**
	//  * Execute evals for the completed session
	//  */
	// private async executeEvalsForSession(
	// 	logger: Logger,
	// 	sessionId: string
	// ): Promise<void> {
	// 	try {
	// 		internal.debug(`🔍 Starting eval execution for session ${sessionId}`);

	// 		// Get pending eval jobs for this session
	// 		internal.debug('🔍 Getting EvalJobScheduler instance...');
	// 		const evalJobScheduler = await EvalJobScheduler.getInstance();
	// 		internal.debug('✅ EvalJobScheduler instance obtained');

	// 		internal.debug(`🔍 Querying jobs for session ${sessionId}...`);
	// 		const jobs = evalJobScheduler.getJobs({ sessionId });

	// 		if (jobs.length === 0) {
	// 			internal.debug(`📭 No eval jobs found for session ${sessionId}`);
	// 			return;
	// 		}

	// 		internal.debug(
	// 			`📋 Found ${jobs.length} eval jobs for session ${sessionId}`
	// 		);

	// 		// Load eval metadata map
	// 		internal.debug('🔧 Loading eval metadata map...');
	// 		const evalAPI = new EvalAPI();
	// 		const evalMetadataMap = await evalAPI.loadEvalMetadataMap();
	// 		internal.debug(`📚 Loaded ${evalMetadataMap.size} eval mappings`);

	// 		// Execute evals for each job
	// 		let totalEvalsExecuted = 0;
	// 		for (let i = 0; i < jobs.length; i++) {
	// 			const job = jobs[i];
	// 			internal.debug(
	// 				`🎯 Processing job ${i + 1}/${jobs.length} (spanId: ${job.spanId})`
	// 			);
	// 			const evalsInJob = await this.executeEvalsForJob(
	// 				logger,
	// 				job,
	// 				evalAPI,
	// 				evalMetadataMap
	// 			);
	// 			totalEvalsExecuted += evalsInJob;
	// 			internal.debug(
	// 				`✅ Completed job ${i + 1}/${jobs.length}: ${evalsInJob} evals executed`
	// 			);
	// 		}

	// 		internal.debug(
	// 			`✅ Completed eval execution for session ${sessionId}: ${totalEvalsExecuted} evals executed`
	// 		);

	// 		// Clean up completed jobs
	// 		internal.debug(`🧹 Cleaning up ${jobs.length} completed jobs...`);
	// 		for (const job of jobs) {
	// 			evalJobScheduler.removeJob(job.spanId);
	// 		}
	// 		internal.debug(`✅ Cleaned up ${jobs.length} completed jobs`);
	// 	} catch (error) {
	// 		logger.error('❌ Error executing evals for session:', error);
	// 	}
	// }

	// /**
	//  * Execute evals for a specific job
	//  */
	// private async executeEvalsForJob(
	// 	logger: Logger,
	// 	job: {
	// 		spanId: string;
	// 		sessionId: string;
	// 		promptMetadata: PromptAttributes[];
	// 		input?: string;
	// 		output?: string;
	// 	},
	// 	evalAPI: EvalAPI,
	// 	evalMetadataMap: Map<string, string>
	// ): Promise<number> {
	// 	let evalsExecuted = 0;

	// 	internal.debug(
	// 		`🎯 Processing job ${job.spanId} with ${job.promptMetadata.length} prompt metadata entries`
	// 	);

	// 	for (const promptMeta of job.promptMetadata || []) {
	// 		if (!promptMeta.evals || promptMeta.evals.length === 0) {
	// 			logger.debug('⏭️  Skipping prompt metadata with no evals');
	// 			continue;
	// 		}

	// 		internal.debug(
	// 			`📝 Found ${promptMeta.evals.length} evals for prompt: ${promptMeta.evals.join(', ')}`
	// 		);

	// 		for (const evalSlug of promptMeta.evals) {
	// 			try {
	// 				internal.debug(
	// 					`🚀 Running eval '${evalSlug}' for session ${job.sessionId}`
	// 				);

	// 				internal.debug(`🔑 Template hash: ${promptMeta.templateHash}`);
	// 				internal.debug(`🔑 Compiled hash: ${promptMeta.compiledHash}`);

	// 				const result = await evalAPI.runEval(
	// 					evalSlug,
	// 					job.input || '',
	// 					job.output || '',
	// 					job.sessionId,
	// 					job.spanId,
	// 					promptMeta.templateHash
	// 				);

	// 				if (result.success) {
	// 					internal.debug(`✅ Successfully executed eval '${evalSlug}'`);
	// 					evalsExecuted++;
	// 				} else {
	// 					logger.warn(
	// 						`⚠️  Eval '${evalSlug}' completed but returned error: ${result.message}`
	// 					);
	// 				}
	// 			} catch (error) {
	// 				logger.error(`❌ Failed to execute eval '${evalSlug}':`, error);
	// 				// Continue with other evals even if one fails
	// 			}
	// 		}
	// 	}

	// 	internal.debug(
	// 		`📊 Job ${job.spanId} completed: ${evalsExecuted} evals executed`
	// 	);
	// 	return evalsExecuted;
	// }
}
