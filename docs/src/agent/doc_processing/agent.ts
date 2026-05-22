import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
import { syncDocsFromPayload } from './docs-orchestrator';

const agent = createAgent('DocProcessing', {
	description: 'Documentation Sync Agent - Processes embedded MDX content from GitHub workflows',
	schema: {
		input: s.object({
			commit: s.optional(s.string()),
			repo: s.optional(s.string()),
			changed: s.optional(
				s.array(
					s.object({
						path: s.string(),
						content: s.string(), // base64-encoded
					})
				)
			),
			removed: s.optional(s.array(s.string())),
		}),
		output: s.object({
			status: s.string(),
			stats: s.object({
				processed: s.number(),
				deleted: s.number(),
				errors: s.number(),
				errorFiles: s.array(s.string()),
			}),
		}),
	},
	handler: async (ctx, input) => {
		if (
			(!input.changed || input.changed.length === 0) &&
			(!input.removed || input.removed.length === 0)
		) {
			throw new Error(
				'Invalid payload format. Must provide at least one of: changed files or removed files'
			);
		}

		ctx.logger.info(
			'Starting docs sync: %d changed, %d removed, commit: %s',
			input.changed?.length || 0,
			input.removed?.length || 0,
			input.commit || 'unknown'
		);

		const stats = await syncDocsFromPayload(ctx, {
			commit: input.commit,
			repo: input.repo,
			changed: input.changed || [],
			removed: input.removed || [],
		});

		return { status: 'ok', stats };
	},
});

agent.addEventListener('started', (_event, _agent, ctx) => {
	ctx.state.set('syncStartTime', Date.now());
	ctx.logger.info('DocProcessing agent started', { sessionId: ctx.sessionId });
});

agent.addEventListener('completed', (_event, _agent, ctx) => {
	const startTime = ctx.state.get('syncStartTime') as number | undefined;
	const durationMs = startTime !== undefined ? Date.now() - startTime : -1;
	ctx.logger.info('DocProcessing agent completed', { durationMs, sessionId: ctx.sessionId });
});

agent.addEventListener('errored', (_event, _agent, ctx, error) => {
	const startTime = ctx.state.get('syncStartTime') as number | undefined;
	const durationMs = startTime !== undefined ? Date.now() - startTime : -1;
	ctx.logger.error('DocProcessing agent failed', {
		error: error instanceof Error ? error.message : String(error),
		durationMs,
		sessionId: ctx.sessionId,
	});
});

export default agent;
