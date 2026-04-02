import { Hono } from 'hono';
import type { Env } from '@agentuity/runtime';
import api from './index';
import echoRouter from './echo/route';
import eventsRouter from './events/route';

const router = new Hono<Env>()
	.route('/', api)
	.route('/echo', echoRouter)
	.route('/events', eventsRouter);

export type AppRouter = typeof router;

export default router;
