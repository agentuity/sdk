/**
 * Context Route - Demonstrates the public Hono route model.
 *
 * GET /session    - Request data from c.req
 * GET /services   - Services injected on c.var.*
 * GET /agents     - Plain-function composition from a route
 * GET /state      - App-owned state using a cookie and local store
 * GET /full       - Combined request + services snapshot
 * GET /logger     - Structured logging levels
 * GET /background - waitUntil() style background work
 */
import type { ApiEnv } from '../context';
import { waitUntil } from '../http';
import { type Context, Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';

const STATE_COOKIE = 'agentuity_context_demo';
const COOKIE_TTL_SECONDS = 60 * 60 * 24 * 7;

interface DemoState {
	readonly lastSeenAt: string;
	readonly visits: number;
}

const demoStateByVisitorId = new Map<string, DemoState>();

function getRequestData(c: Context<ApiEnv>) {
	return {
		accept: c.req.header('accept') ?? 'unknown',
		method: c.req.method,
		path: c.req.path,
		url: c.req.url,
		userAgent: c.req.header('user-agent') ?? 'unknown',
	};
}

function getAvailableServices(c: Context<ApiEnv>) {
	return {
		email: typeof c.var.email !== 'undefined',
		keyValue: typeof c.var.kv !== 'undefined',
		logger: typeof c.var.logger !== 'undefined',
		meter: typeof c.var.meter !== 'undefined',
		queue: typeof c.var.queue !== 'undefined',
		sandbox: typeof c.var.sandbox !== 'undefined',
		schedule: typeof c.var.schedule !== 'undefined',
		stream: typeof c.var.stream !== 'undefined',
		task: typeof c.var.task !== 'undefined',
		tracer: typeof c.var.tracer !== 'undefined',
		vector: typeof c.var.vector !== 'undefined',
	};
}

function getOrCreateVisitorId(c: Context<ApiEnv>): string {
	const existing = getCookie(c, STATE_COOKIE);
	if (existing) return existing;

	const visitorId = `demo_${crypto.randomUUID()}`;
	setCookie(c, STATE_COOKIE, visitorId, {
		httpOnly: true,
		maxAge: COOKIE_TTL_SECONDS,
		path: '/',
		sameSite: 'Lax',
	});
	return visitorId;
}

function incrementState(visitorId: string): {
	readonly current: DemoState;
	readonly previousVisits: number;
} {
	const previous = demoStateByVisitorId.get(visitorId);
	const current = {
		lastSeenAt: new Date().toISOString(),
		visits: (previous?.visits ?? 0) + 1,
	} satisfies DemoState;
	demoStateByVisitorId.set(visitorId, current);

	return {
		current,
		previousVisits: previous?.visits ?? 0,
	};
}

const router = new Hono<ApiEnv>()
	.get('/session', async (c) => {
		return c.json({
			note: 'The framework owns the request boundary. Read request data from c.req and decide what app state to derive from it.',
			request: getRequestData(c),
			requestId: crypto.randomUUID(),
		});
	})

	.get('/services', async (c) => {
		return c.json({
			available: getAvailableServices(c),
			note: 'Hono routes can read injected services from c.var.*. Other frameworks usually create the same clients directly in server-only files.',
		});
	})

	.get('/agents', async (c) => {
		const visitorId = getOrCreateVisitorId(c);
		return c.json({
			helpers: ['getRequestData()', 'getAvailableServices()', 'getOrCreateVisitorId()'],
			note: 'Keep reusable model-backed work in plain functions, then call those functions from routes, queues, schedules, or scripts.',
			request: getRequestData(c),
			services: getAvailableServices(c),
			visitorId,
		});
	})

	.get('/state', async (c) => {
		const visitorId = getOrCreateVisitorId(c);
		const { current, previousVisits } = incrementState(visitorId);

		return c.json({
			lastSeenAt: current.lastSeenAt,
			note: 'This docs demo uses a cookie plus an in-memory Map to stay self-contained. Real apps usually keep the same boundary in Key-Value Storage or a database.',
			previousVisits,
			storageBoundary: 'cookie + app-owned store',
			visitorId,
			visits: current.visits,
		});
	})

	.get('/full', async (c) => {
		return c.json({
			hasBackgroundHelper: true,
			note: 'Framework routes can combine request data, injected services, and app-owned state explicitly. Keep state in the store your app controls.',
			request: getRequestData(c),
			services: getAvailableServices(c),
		});
	})

	.get('/logger', async (c) => {
		const requestId = crypto.randomUUID();
		c.var.logger?.trace('Trace message from route', { requestId });
		c.var.logger?.info('Info message from route', { requestId });
		c.var.logger?.warn('Warning message from route', { requestId });
		c.var.logger?.error('Error message from route (demo only)', { requestId });

		return c.json({
			levels: ['trace', 'info', 'warn', 'error'],
			note: 'Check console output. Trace logs depend on the configured log level.',
			requestId,
		});
	})

	.get('/background', async (c) => {
		const taskId = crypto.randomUUID();
		waitUntil(
			c,
			(async () => {
				await new Promise((resolve) => setTimeout(resolve, 5000));
				c.var.logger?.info('Background task completed after 5 seconds!', { taskId });
			})()
		);

		return c.json({
			message: 'Background task started',
			note: 'The response returns immediately. The background task finishes later and logs with the same route-level logger.',
			taskId,
		});
	});

export default router;
