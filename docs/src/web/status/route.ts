import { Hono } from 'hono';
import type { ApiEnv } from '../../api/context';

const router = new Hono<ApiEnv>();

router.get('/', (c) => {
	return c.json({
		status: 'ok',
		timestamp: new Date().toISOString(),
		version: '1.0.0',
	});
});

export default router;
