import type { Database } from 'bun:sqlite';
import { createRouter } from '../../router';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createLocalStorageRouter(db: Database, projectPath: string): any {
	const router = createRouter();

	// so we can detect if we're running in local mode easily
	router.get('/_agentuity/local/health', (c) => c.text('OK'));

	// Serve streams: GET /_agentuity/local/stream/:id
	router.get('/_agentuity/local/stream/:id', async (c) => {
		const id = c.req.param('id');

		const query = db.query(`
			SELECT data, content_type 
			FROM stream_storage 
			WHERE project_path = ? AND id = ?
		`);

		const row = query.get(projectPath, id) as {
			data: Buffer | null;
			content_type: string;
		} | null;

		if (!row) {
			return c.notFound();
		}

		if (!row.data) {
			return c.json({ error: 'Stream not finalized' }, 400);
		}

		return c.body(new Uint8Array(row.data), 200, {
			'Content-Type': row.content_type,
		});
	});

	return router;
}
