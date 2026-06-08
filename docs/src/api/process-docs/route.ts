import type { ApiEnv } from '../context';
import { s } from '@agentuity/schema';
import { bearerTokenAuth } from '../../middleware/auth';
import { syncDocsFromPayload } from '../../services/docs-sync/docs-orchestrator';
import { Hono } from 'hono';

const SyncPayloadSchema = s.object({
	mode: s.optional(s.enum(['incremental', 'full'])),
	commit: s.optional(s.string()),
	repo: s.optional(s.string()),
	changed: s.optional(
		s.array(
			s.object({
				path: s.string(),
				content: s.string(),
			})
		)
	),
	removed: s.optional(s.array(s.string())),
});

const router = new Hono<ApiEnv>()
	// POST /api/process-docs
	// Processes docs synchronously and returns stats.
	// Callers should batch large payloads (~10 files per request).
	.post('/', bearerTokenAuth, async (c) => {
		let body: unknown;
		try {
			body = await c.req.json();
		} catch {
			return c.json({ error: 'Invalid JSON body' }, 400);
		}

		const parsed = SyncPayloadSchema.safeParse(body);
		if (!parsed.success) {
			return c.json(
				{
					error: 'Invalid request body',
					issues: parsed.error.issues,
				},
				400
			);
		}

		const data = parsed.data;
		if (
			(!data.changed || data.changed.length === 0) &&
			(!data.removed || data.removed.length === 0)
		) {
			return c.json(
				{
					error: 'Invalid payload format. Must provide at least one of: changed files or removed files',
				},
				400
			);
		}

		c.var.logger.info('Starting docs sync', {
			mode: data.mode ?? 'incremental',
			changed: data.changed?.length ?? 0,
			removed: data.removed?.length ?? 0,
			commit: data.commit,
		});

		try {
			const stats = await syncDocsFromPayload(c.var, data);
			return c.json({ status: 'ok', stats });
		} catch (err) {
			c.var.logger.error('Docs sync failed', { error: err, commit: data.commit });
			return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
		}
	});

export default router;
