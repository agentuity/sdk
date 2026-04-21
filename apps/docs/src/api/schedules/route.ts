import { Hono } from 'hono';
import { ServiceException } from '@agentuity/core/exception';
import type { Env } from '@agentuity/runtime';
import type {
	CreateScheduleParams,
	Schedule,
	ScheduleDelivery,
	ScheduleDestination,
	ScheduleGetResult,
	ScheduleDeliveryListResult,
} from '@agentuity/schedule';
import { z } from 'zod';
import { cookieAuth } from '../../middleware/auth';

type ScheduleApiService = Env['Variables']['schedule'];

const CreateScheduleRequestSchema = z.object({
	expression: z.string().trim().min(1).optional(),
});

const DEFAULT_EXPRESSION = '* * * * *';
const DELIVERY_PAGE_LIMIT = 5;
const HELLO_DESTINATION_PATH = '/api/hello';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const CREATE_RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_CREATES_PER_WINDOW = 1;
const createAttemptsByUser = new Map<string, number[]>();

function isLoopbackHost(hostname: string): boolean {
	const normalizedHost = hostname.toLowerCase().replace(/^\[|\]$/g, '');
	return LOOPBACK_HOSTS.has(normalizedHost);
}

function parseBaseUrl(candidate: string | undefined): URL | null {
	const trimmed = candidate?.trim();
	if (!trimmed) {
		return null;
	}

	try {
		return new URL(trimmed);
	} catch {
		return null;
	}
}

function resolvePublicBaseUrl(requestUrl: string): URL | null {
	const candidates = [
		process.env.AGENTUITY_PUBLIC_URL,
		process.env.PUBLIC_BASE_URL,
		process.env.AGENTUITY_CLOUD_BASE_URL,
		process.env.AGENTUITY_DEVMODE_URL,
		process.env.AGENTUITY_BASE_URL,
		requestUrl,
	];

	for (const candidate of candidates) {
		const baseUrl = parseBaseUrl(candidate);
		if (baseUrl && !isLoopbackHost(baseUrl.hostname)) {
			return baseUrl;
		}
	}

	return null;
}

function buildDestinationUrl(requestUrl: string): string | null {
	const publicBaseUrl = resolvePublicBaseUrl(requestUrl);
	if (!publicBaseUrl) {
		return null;
	}

	return new URL(HELLO_DESTINATION_PATH, publicBaseUrl).toString();
}

function sortDeliveries(deliveries: ReadonlyArray<ScheduleDelivery>): ScheduleDelivery[] {
	return [...deliveries].sort((left, right) => Date.parse(right.date) - Date.parse(left.date));
}

function isMissingScheduleError(error: unknown): boolean {
	return error instanceof ServiceException && error.statusCode === 404;
}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

async function readScheduleState(
	scheduleService: ScheduleApiService,
	scheduleId: string
): Promise<{
	schedule: Schedule;
	destinations: ScheduleDestination[];
	deliveries: ScheduleDelivery[];
}> {
	const { schedule, destinations } = (await scheduleService.get(scheduleId)) as ScheduleGetResult;
	const { deliveries } = (await scheduleService.listDeliveries(scheduleId, {
		limit: DELIVERY_PAGE_LIMIT,
		offset: 0,
	})) as ScheduleDeliveryListResult;

	return {
		schedule,
		destinations,
		deliveries: sortDeliveries(deliveries),
	};
}

function createExplorerScheduleName(): string {
	return `[Explorer] Hello World ${new Date().toISOString()} ${Math.random()
		.toString(36)
		.slice(2, 8)}`;
}

function createScheduleParams(expression: string, destinationUrl: string): CreateScheduleParams {
	return {
		name: createExplorerScheduleName(),
		description: 'SDK Explorer schedules demo',
		expression,
		destinations: [
			{
				type: 'url',
				config: {
					url: destinationUrl,
					method: 'GET',
				},
			},
		],
	};
}

const router = new Hono<Env>()
	.post('/', cookieAuth, async (c) => {
		try {
			const userId = (c.get as (key: string) => string)('userId');
			let body: unknown;
			try {
				body = await c.req.json<unknown>();
			} catch {
				return c.json({ success: false, message: 'Invalid JSON payload.' }, 400);
			}

			const parsed = CreateScheduleRequestSchema.safeParse(body);
			if (!parsed.success) {
				return c.json(
					{
						success: false,
						message: 'Invalid schedules demo request.',
					},
					400
				);
			}

			const destinationUrl = buildDestinationUrl(c.req.url);
			if (!destinationUrl) {
				return c.json(
					{
						success: false,
						message:
							'Schedules demo needs a public callback URL in local dev. Start `agentuity dev` with the public URL enabled, or set AGENTUITY_PUBLIC_URL.',
					},
					400
				);
			}
			const expression = parsed.data.expression ?? DEFAULT_EXPRESSION;
			const createParams = createScheduleParams(expression, destinationUrl);

			const now = Date.now();
			const recentAttempts = (createAttemptsByUser.get(userId) ?? []).filter(
				(timestamp) => timestamp > now - CREATE_RATE_LIMIT_WINDOW_MS
			);

			if (recentAttempts.length >= MAX_CREATES_PER_WINDOW) {
				createAttemptsByUser.set(userId, recentAttempts);
				return c.json(
					{
						success: false,
						message: 'Wait a minute before creating another Explorer schedule.',
					},
					429
				);
			}

			createAttemptsByUser.set(userId, [...recentAttempts, now]);
			const result = await c.var.schedule.create(createParams);

			return c.json({
				success: true,
				data: {
					schedule: result.schedule,
					destinations: result.destinations,
					deliveries: [],
					destinationUrl,
				},
			});
		} catch (error) {
			const message = getErrorMessage(error);
			c.var.logger?.error('Schedules demo create failed', { message });
			return c.json({ success: false, message }, 500);
		}
	})
	.get('/:id', async (c) => {
		try {
			const scheduleId = c.req.param('id');
			const destinationUrl = buildDestinationUrl(c.req.url) ?? HELLO_DESTINATION_PATH;
			const state = await readScheduleState(c.var.schedule, scheduleId);

			return c.json({
				success: true,
				data: {
					...state,
					destinationUrl,
				},
			});
		} catch (error) {
			if (isMissingScheduleError(error)) {
				return c.json({ success: false, message: 'Schedule not found.' }, 404);
			}

			const message = getErrorMessage(error);
			c.var.logger?.error('Schedules demo get failed', {
				scheduleId: c.req.param('id'),
				message,
			});
			return c.json({ success: false, message }, 500);
		}
	})
	.delete('/:id', async (c) => {
		try {
			const scheduleId = c.req.param('id');
			await c.var.schedule.delete(scheduleId);
			return c.json({ success: true, message: 'Schedule deleted.' });
		} catch (error) {
			if (isMissingScheduleError(error)) {
				return c.json({ success: true, message: 'Schedule already deleted.' });
			}

			const message = getErrorMessage(error);
			c.var.logger?.error('Schedules demo delete failed', {
				scheduleId: c.req.param('id'),
				message,
			});
			return c.json({ success: false, message }, 500);
		}
	});

export default router;
