/**
 * Schedule Route - Schedule lifecycle operations for the Explorer demo.
 *
 * POST /create       - Create a schedule with optional destinations
 * POST /destination  - Add a destination to an existing schedule
 * GET  /list         - List schedules
 * GET  /:id          - Get schedule with destinations
 * DELETE /:id        - Delete a schedule
 */
import { Hono } from 'hono';
import type { Env } from '@agentuity/runtime';

const router = new Hono<Env>()

	.post('/create', async (c) => {
		try {
			const body = await c.req.json();
			const result = await c.var.schedule.create({
				name: body.name,
				expression: body.expression ?? '0 * * * *',
				destinations: body.destinations,
			});
			return c.json({ success: true, data: result });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return c.json({ success: false, message }, 500);
		}
	})

	.post('/destination', async (c) => {
		try {
			const body = await c.req.json();
			const result = await c.var.schedule.createDestination(body.scheduleId, {
				type: body.type ?? 'url',
				config: body.config ?? { url: 'https://api.example.com/trigger' },
			});
			return c.json({ success: true, data: result });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return c.json({ success: false, message }, 500);
		}
	})

	.get('/list', async (c) => {
		try {
			const result = await c.var.schedule.list({ limit: 10 });
			return c.json({ success: true, data: result });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return c.json({ success: false, message }, 500);
		}
	})

	.get('/:id', async (c) => {
		try {
			const id = c.req.param('id');
			const result = await c.var.schedule.get(id);
			return c.json({ success: true, data: result });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return c.json({ success: false, message }, 500);
		}
	})

	.delete('/:id', async (c) => {
		try {
			const id = c.req.param('id');
			await c.var.schedule.delete(id);
			return c.json({ success: true, message: `Deleted ${id}` });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return c.json({ success: false, message }, 500);
		}
	});

export default router;
