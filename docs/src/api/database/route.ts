/**
 * Database Route - Query PostgreSQL with Drizzle ORM.
 *
 * POST / - Execute a database query
 */
import { Hono } from 'hono';
import type { Env } from '@agentuity/runtime';
import databaseAgent from '../../agent/database/agent';

const router = new Hono<Env>().post('/', databaseAgent.validator(), async (c) => {
	const data = c.req.valid('json');
	const result = await databaseAgent.run(data);
	return c.json(result);
});

export default router;
