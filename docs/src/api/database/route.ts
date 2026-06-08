/**
 * Database Route - Query PostgreSQL with Drizzle ORM.
 *
 * POST / - Execute a database query
 */
import { Hono } from 'hono';
import type { ApiEnv } from '../context';
import databaseAgent from '../../agent/database/agent';

const router = new Hono<ApiEnv>().post('/', async (c) => {
	const data = await c.req.json();
	const result = await databaseAgent.run(data);
	return c.json(result);
});

export default router;
