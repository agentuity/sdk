import type { Database } from 'bun:sqlite';
import { createRouter } from '../../router';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createLocalStorageRouter(db: Database, projectPath: string): any {
	const router = createRouter();

	// so we can detect if we're running in local mode easily
	router.get('/_agentuity/local/health', (c) => c.text('OK'));

	// Serve objects: GET /_agentuity/local/object/:bucket/:key
	router.get('/_agentuity/local/object/:bucket/:key', async (c) => {
		const bucket = c.req.param('bucket');
		const key = c.req.param('key');

		const query = db.query(`
			SELECT data, content_type, content_encoding, cache_control, 
						 content_disposition, content_language 
			FROM object_storage 
			WHERE project_path = ? AND bucket = ? AND key = ?
		`);

		const row = query.get(projectPath, bucket, key) as {
			data: Buffer;
			content_type: string;
			content_encoding: string | null;
			cache_control: string | null;
			content_disposition: string | null;
			content_language: string | null;
		} | null;

		if (!row) {
			return c.notFound();
		}

		// Set headers
		const headers: Record<string, string> = {
			'Content-Type': row.content_type,
		};

		if (row.content_encoding) {
			headers['Content-Encoding'] = row.content_encoding;
		}
		if (row.cache_control) {
			headers['Cache-Control'] = row.cache_control;
		}
		if (row.content_disposition) {
			headers['Content-Disposition'] = row.content_disposition;
		}
		if (row.content_language) {
			headers['Content-Language'] = row.content_language;
		}

		return c.body(new Uint8Array(row.data), 200, headers);
	});

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
