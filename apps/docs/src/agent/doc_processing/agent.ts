import { createAgent } from '@agentuity/runtime';
import { s } from '@agentuity/schema';
import { syncDocsFromPayload } from './docs-orchestrator.ts';

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
		// Validate that at least one operation is requested
		if (
			(!input.changed || input.changed.length === 0) &&
			(!input.removed || input.removed.length === 0)
		) {
			throw new Error(
				'Invalid payload format. Must provide at least one of: changed files or removed files'
			);
		}

		ctx.logger.info(
			'Processing payload: %d changed files, %d removed files',
			input.changed?.length || 0,
			input.removed?.length || 0
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

export default agent;
