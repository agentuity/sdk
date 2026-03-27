import { FetchAdapter } from '../adapter.ts';
import { buildUrl, toServiceException } from '../_util.ts';
import { z } from 'zod';

/**
 * A scheduled job that fires at intervals defined by a cron expression.
 *
 * Schedules are the top-level resource. Each schedule has one or more
 * {@link ScheduleDestination | destinations} that receive HTTP callbacks
 * when the schedule fires.
 */
export const ScheduleSchema = z.object({
	/**
	 * Unique identifier for the schedule.
	 *
	 * @remarks Prefixed with `sch_`.
	 */
	id: z.string().describe('Unique identifier for the schedule.'),

	/**
	 * ISO 8601 timestamp when the schedule was created.
	 */
	created_at: z.string().describe('ISO 8601 timestamp when the schedule was created.'),

	/**
	 * ISO 8601 timestamp when the schedule was last modified.
	 */
	updated_at: z.string().describe('ISO 8601 timestamp when the schedule was last modified.'),

	/**
	 * ID of the user who created the schedule.
	 */
	created_by: z.string().describe('ID of the user who created the schedule.'),

	/**
	 * Human-readable name for the schedule.
	 */
	name: z.string().describe('Human-readable name for the schedule.'),

	/**
	 * Optional description of the schedule's purpose.
	 */
	description: z.string().nullable().describe("Optional description of the schedule's purpose."),

	/**
	 * A cron expression defining the schedule's firing interval
	 * (e.g., `'0 9 * * 1-5'` for weekdays at 9 AM).
	 *
	 * @remarks Validated on creation and update by the server.
	 * Supports standard five-field cron syntax including step values (e.g., every 5 minutes).
	 */
	expression: z.string().describe("A cron expression defining the schedule's firing interval"),

	/**
	 * ISO 8601 timestamp of the next scheduled execution.
	 *
	 * @remarks Automatically computed from the cron expression. Updated each time
	 * the schedule fires or the expression is changed.
	 */
	due_date: z.string().describe('ISO 8601 timestamp of the next scheduled execution.'),

	/**
	 * Whether this is a system-managed schedule.
	 *
	 * @remarks Internal schedules are created by the system and cannot be modified
	 * or deleted by users.
	 */
	internal: z
		.boolean()
		.describe(
			'Whether this is a system-managed schedule. Internal schedules cannot be modified or deleted users.'
		),
});

export type Schedule = z.infer<typeof ScheduleSchema>;

/**
 * A delivery target for a scheduled job.
 *
 * When the schedule fires, an HTTP request is sent to each of its destinations.
 */
export const ScheduleDestinationSchema = z.object({
	/**
	 * Unique identifier for the destination.
	 *
	 * @remarks Prefixed with `sdst_`.
	 */
	id: z.string().describe('Unique identifier for the destination.'),

	/**
	 * The ID of the parent schedule.
	 */
	schedule_id: z.string().describe('The ID of the parent schedule.'),

	/**
	 * ISO 8601 timestamp when the destination was created.
	 */
	created_at: z.string().describe('ISO 8601 timestamp when the destination was created.'),

	/**
	 * ISO 8601 timestamp when the destination was last updated.
	 */
	updated_at: z.string().describe('ISO 8601 timestamp when the destination was last updated.'),

	/**
	 * ID of the user who created the destination.
	 */
	created_by: z.string().describe('ID of the user who created the destination.'),

	/**
	 * The destination type: `'url'` for HTTP endpoints or `'sandbox'` for Agentuity sandbox execution.
	 */
	type: z
		.enum(['url', 'sandbox'])
		.describe(
			"The destination type: `'url'` for HTTP endpoints or `'sandbox'` for Agentuity sandbox execution."
		),

	/**
	 * Type-specific destination configuration.
	 *
	 * @remarks
	 * For `'url'` type:
	 * ```typescript
	 * { url: string; headers?: Record<string, string>; method?: string }
	 * ```
	 * For `'sandbox'` type: sandbox-specific configuration.
	 */
	config: z.record(z.string(), z.unknown()).describe('Type-specific destination configuration.'),
});

export type ScheduleDestination = z.infer<typeof ScheduleDestinationSchema>;

/**
 * A record of a single delivery attempt for a scheduled execution.
 *
 * Each time a schedule fires, one delivery record is created per destination.
 * Failed deliveries may be retried automatically.
 */
export const ScheduleDeliverySchema = z.object({
	/**
	 * Unique identifier for the delivery attempt.
	 */
	id: z.string().describe('Unique identifier for the delivery attempt.'),

	/**
	 * ISO 8601 timestamp when the delivery was attempted.
	 */
	date: z.string().describe('ISO 8601 timestamp when the delivery was attempted.'),

	/**
	 * The ID of the schedule that triggered this delivery.
	 */
	schedule_id: z.string().describe('The ID of the schedule that triggered this delivery.'),

	/**
	 * The ID of the destination this delivery was sent to.
	 */
	schedule_destination_id: z
		.string()
		.describe('The ID of the destination this delivery was sent to.'),

	/**
	 * Delivery status: `'pending'` (queued), `'success'` (delivered), or `'failed'` (delivery error).
	 */
	status: z
		.enum(['pending', 'success', 'failed'])
		.describe(
			"Delivery status: `'pending'` (queued), `'success'` (delivered), or `'failed'` (delivery error)."
		),

	/**
	 * Number of retry attempts made for this delivery.
	 */
	retries: z.number().describe('Number of retry attempts made for this delivery.'),

	/**
	 * Error message if the delivery failed, `null` on success.
	 */
	error: z
		.string()
		.nullable()
		.describe('Error message if the delivery failed, `null` on success.'),

	/**
	 * The response received from the destination, or `null` if no response.
	 */
	response: z
		.record(z.string(), z.unknown())
		.nullable()
		.describe('The response received from the destination, or `null` if no response.'),
});

export type ScheduleDelivery = z.infer<typeof ScheduleDeliverySchema>;

/**
 * Parameters for creating a new schedule.
 */
export const CreateScheduleParamsSchema = z.object({
	/**
	 * Human-readable name for the schedule.
	 */
	name: z.string().describe('Human-readable name for the schedule.'),

	/**
	 * Optional description of the schedule's purpose.
	 */
	description: z.string().optional().describe("Optional description of the schedule's purpose."),

	/**
	 * Cron expression defining when the schedule fires
	 * (e.g., `'0 * * * *'` for every hour).
	 *
	 * @remarks Must be a valid cron expression. Validated by the server on creation.
	 * Supports standard five-field cron syntax including step values.
	 */
	expression: z.string().describe('Cron expression defining when the schedule fires'),

	/**
	 * Whether this is a system-managed schedule.
	 *
	 * @remarks Internal schedules are created by the system for workflows and cannot
	 * be modified or deleted directly by users.
	 */
	internal: z.boolean().optional().describe('Whether this is a system-managed schedule.'),

	/**
	 * Optional array of destinations to create alongside the schedule.
	 *
	 * @remarks Destinations are created atomically with the schedule — if any destination
	 * fails validation, the entire creation is rolled back.
	 */
	destinations: z
		.array(z.lazy(() => CreateScheduleDestinationParamsSchema))
		.optional()
		.describe('Optional array of destinations to create alongside the schedule.'),
});

export type CreateScheduleParams = z.infer<typeof CreateScheduleParamsSchema>;

/**
 * Parameters for creating a new destination on a schedule.
 */
export const CreateScheduleDestinationParamsSchema = z.object({
	/**
	 * The destination type: `'url'` for HTTP endpoints or `'sandbox'` for Agentuity sandbox execution.
	 */
	type: z
		.enum(['url', 'sandbox'])
		.describe(
			"The destination type: `'url'` for HTTP endpoints or `'sandbox'` for Agentuity sandbox execution."
		),

	/**
	 * Type-specific destination configuration.
	 *
	 * @remarks
	 * For `'url'` type:
	 * ```typescript
	 * { url: string; headers?: Record<string, string>; method?: string }
	 * ```
	 * For `'sandbox'` type: sandbox-specific configuration.
	 */
	config: z.record(z.string(), z.unknown()).describe('Type-specific destination configuration.'),
});

export type CreateScheduleDestinationParams = z.infer<typeof CreateScheduleDestinationParamsSchema>;

/**
 * Parameters for updating an existing schedule.
 *
 * All fields are optional; only provided fields are updated.
 */
export const UpdateScheduleParamsSchema = z.object({
	/**
	 * Updated human-readable name for the schedule.
	 */
	name: z.string().optional().describe('Updated human-readable name for the schedule.'),

	/**
	 * Updated description.
	 */
	description: z.string().optional().describe('Updated description.'),

	/**
	 * Updated cron expression. If changed, the `due_date` is automatically recomputed.
	 *
	 * @remarks Must be a valid cron expression. Validated by the server on update.
	 */
	expression: z
		.string()
		.optional()
		.describe('Updated cron expression. If changed, the `due_date` is automatically recomputed.'),
});

export type UpdateScheduleParams = z.infer<typeof UpdateScheduleParamsSchema>;

/**
 * Paginated list of schedules.
 */
export const ScheduleListResultSchema = z.object({
	/**
	 * Array of schedule records for the current page.
	 */
	schedules: z.array(ScheduleSchema).describe('Array of schedule records for the current page.'),

	/**
	 * Total number of schedules across all pages.
	 */
	total: z.number().describe('Total number of schedules across all pages.'),
});

export type ScheduleListResult = z.infer<typeof ScheduleListResultSchema>;

/**
 * A schedule with its associated destinations.
 */
export const ScheduleGetResultSchema = z.object({
	/**
	 * The schedule record.
	 */
	schedule: ScheduleSchema.describe('The schedule record.'),

	/**
	 * Array of destinations configured for this schedule.
	 */
	destinations: z
		.array(ScheduleDestinationSchema)
		.describe('Array of destinations configured for this schedule.'),
});

export type ScheduleGetResult = z.infer<typeof ScheduleGetResultSchema>;

/**
 * Result of creating a schedule, including any destinations created atomically.
 */
export const ScheduleCreateResultSchema = z.object({
	/**
	 * The newly created schedule record.
	 */
	schedule: ScheduleSchema.describe('The newly created schedule record.'),

	/**
	 * Array of destinations that were created alongside the schedule.
	 */
	destinations: z
		.array(ScheduleDestinationSchema)
		.describe('Array of destinations that were created alongside the schedule.'),
});

export type ScheduleCreateResult = z.infer<typeof ScheduleCreateResultSchema>;

/**
 * List of delivery attempts for a schedule.
 */
export const ScheduleDeliveryListResultSchema = z.object({
	/**
	 * Array of delivery attempt records.
	 */
	deliveries: z.array(ScheduleDeliverySchema).describe('Array of delivery attempt records.'),
});

export type ScheduleDeliveryListResult = z.infer<typeof ScheduleDeliveryListResultSchema>;

/**
 * Client for the Agentuity Schedule service.
 *
 * Provides methods for creating, managing, and monitoring cron-based scheduled jobs.
 * Schedules fire at intervals defined by cron expressions and deliver HTTP requests
 * to configured destinations (URLs or sandboxes).
 *
 * The service supports:
 * - CRUD operations on schedules and their destinations
 * - Cron expression validation
 * - Delivery history and monitoring
 * - Automatic due date computation from cron expressions
 *
 * All methods are instrumented with OpenTelemetry spans for observability.
 *
 * @example
 * ```typescript
 * const schedules = new ScheduleService(baseUrl, adapter);
 *
 * // Create a schedule that fires every hour
 * const result = await schedules.create({
 *   name: 'Hourly Sync',
 *   expression: '0 * * * *',
 *   destinations: [{ type: 'url', config: { url: 'https://example.com/sync' } }],
 * });
 *
 * // List all schedules
 * const { schedules: list, total } = await schedules.list();
 * ```
 */
export class ScheduleService {
	#adapter: FetchAdapter;
	#baseUrl: string;

	/**
	 * Create a new ScheduleService instance.
	 *
	 * @param baseUrl - The base URL for the Agentuity Schedule API (e.g., `https://api.agentuity.com`)
	 * @param adapter - The HTTP fetch adapter used for making API requests
	 */
	constructor(baseUrl: string, adapter: FetchAdapter) {
		this.#adapter = adapter;
		this.#baseUrl = baseUrl;
	}

	/**
	 * Create a new schedule with optional destinations.
	 *
	 * The schedule and its destinations are created atomically — if any validation
	 * fails, the entire operation is rolled back.
	 *
	 * @param params - The schedule creation parameters including name, cron expression, and optional destinations
	 * @returns The created schedule and its destinations
	 * @throws ServiceException on API errors (e.g., invalid cron expression, invalid destination URL)
	 *
	 * @example
	 * ```typescript
	 * const result = await schedules.create({
	 *   name: 'Daily Report',
	 *   description: 'Generate and send daily reports',
	 *   expression: '0 9 * * *',
	 *   destinations: [
	 *     { type: 'url', config: { url: 'https://example.com/reports' } },
	 *   ],
	 * });
	 * console.log('Created schedule:', result.schedule.id);
	 * console.log('Next run:', result.schedule.due_date);
	 * ```
	 */
	async create(params: CreateScheduleParams): Promise<ScheduleCreateResult> {
		const url = buildUrl(this.#baseUrl, '/schedule/create');
		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke<ScheduleCreateResult>(url, {
			method: 'POST',
			signal,
			body: JSON.stringify(params),
			contentType: 'application/json',
			telemetry: {
				name: 'agentuity.schedule.create',
				attributes: {
					destinationCount: String(params.destinations?.length ?? 0),
					name: params.name,
				},
			},
		});

		if (res.ok) {
			return res.data;
		}

		throw await toServiceException('POST', url, res.response);
	}

	/**
	 * List all schedules with optional pagination.
	 *
	 * @param params - Optional pagination parameters
	 * @param params.limit - Maximum number of schedules to return (max 500)
	 * @param params.offset - Number of schedules to skip for pagination
	 * @returns A paginated list of schedules with the total count
	 * @throws ServiceException on API errors
	 *
	 * @example
	 * ```typescript
	 * // List first page
	 * const { schedules, total } = await service.list({ limit: 20 });
	 * console.log(`Showing ${schedules.length} of ${total} schedules`);
	 *
	 * // Paginate through all schedules
	 * const page2 = await service.list({ limit: 20, offset: 20 });
	 * ```
	 */
	async list(params?: { limit?: number; offset?: number }): Promise<ScheduleListResult> {
		const qs = new URLSearchParams();
		if (params?.limit !== undefined) {
			qs.set('limit', String(params.limit));
		}
		if (params?.offset !== undefined) {
			qs.set('offset', String(params.offset));
		}

		const path = qs.toString() ? `/schedule/list?${qs.toString()}` : '/schedule/list';
		const url = buildUrl(this.#baseUrl, path);
		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke<ScheduleListResult>(url, {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.schedule.list',
				attributes: {
					limit: String(params?.limit ?? ''),
					offset: String(params?.offset ?? ''),
				},
			},
		});

		if (res.ok) {
			return res.data;
		}

		throw await toServiceException('GET', url, res.response);
	}

	/**
	 * Get a schedule by its ID, including all configured destinations.
	 *
	 * @param scheduleId - The schedule ID (prefixed with `sch_`)
	 * @returns The schedule record and its array of destinations
	 * @throws ServiceException on API errors (including 404 if not found)
	 *
	 * @example
	 * ```typescript
	 * const { schedule, destinations } = await service.get('sch_abc123');
	 * console.log('Schedule:', schedule.name);
	 * console.log('Next run:', schedule.due_date);
	 * console.log('Destinations:', destinations.length);
	 * ```
	 */
	async get(scheduleId: string): Promise<ScheduleGetResult> {
		const url = buildUrl(this.#baseUrl, `/schedule/get/${encodeURIComponent(scheduleId)}`);
		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke<ScheduleGetResult>(url, {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.schedule.get',
				attributes: {
					scheduleId,
				},
			},
		});

		if (res.ok) {
			return res.data;
		}

		if (res.response.status === 404) {
			throw await toServiceException('GET', url, res.response);
		}

		throw await toServiceException('GET', url, res.response);
	}

	/**
	 * Update an existing schedule. Only the provided fields are modified.
	 *
	 * @remarks If the `expression` field is changed, the `due_date` is automatically
	 * recomputed based on the new cron expression.
	 *
	 * @param scheduleId - The schedule ID (prefixed with `sch_`)
	 * @param params - The fields to update (all optional)
	 * @returns The updated schedule record
	 * @throws ServiceException on API errors (e.g., invalid cron expression, schedule not found)
	 *
	 * @example
	 * ```typescript
	 * // Update the name and expression
	 * const { schedule } = await service.update('sch_abc123', {
	 *   name: 'Daily Midnight Sync',
	 *   expression: '0 0 * * *',
	 * });
	 * console.log('Updated. Next run:', schedule.due_date);
	 * ```
	 */
	async update(scheduleId: string, params: UpdateScheduleParams): Promise<{ schedule: Schedule }> {
		const url = buildUrl(this.#baseUrl, `/schedule/update/${encodeURIComponent(scheduleId)}`);
		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke<{ schedule: Schedule }>(url, {
			method: 'PUT',
			signal,
			body: JSON.stringify(params),
			contentType: 'application/json',
			telemetry: {
				name: 'agentuity.schedule.update',
				attributes: {
					scheduleId,
				},
			},
		});

		if (res.ok) {
			return res.data;
		}

		throw await toServiceException('PUT', url, res.response);
	}

	/**
	 * Delete a schedule and all of its destinations and delivery history.
	 *
	 * @param scheduleId - The schedule ID (prefixed with `sch_`)
	 * @throws ServiceException on API errors (e.g., schedule not found)
	 *
	 * @example
	 * ```typescript
	 * await service.delete('sch_abc123');
	 * console.log('Schedule deleted');
	 * ```
	 */
	async delete(scheduleId: string): Promise<void> {
		const url = buildUrl(this.#baseUrl, `/schedule/delete/${encodeURIComponent(scheduleId)}`);
		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke<void>(url, {
			method: 'DELETE',
			signal,
			telemetry: {
				name: 'agentuity.schedule.delete',
				attributes: {
					scheduleId,
				},
			},
		});

		if (res.ok) {
			return;
		}

		throw await toServiceException('DELETE', url, res.response);
	}

	/**
	 * Create a new destination on an existing schedule.
	 *
	 * @param scheduleId - The schedule ID (prefixed with `sch_`)
	 * @param params - The destination configuration including type and type-specific config
	 * @returns The newly created destination record
	 * @throws ServiceException on API errors (e.g., invalid URL, schedule not found)
	 *
	 * @example
	 * ```typescript
	 * const { destination } = await service.createDestination('sch_abc123', {
	 *   type: 'url',
	 *   config: {
	 *     url: 'https://example.com/webhook',
	 *     headers: { 'Authorization': 'Bearer token' },
	 *   },
	 * });
	 * console.log('Destination created:', destination.id);
	 * ```
	 */
	async createDestination(
		scheduleId: string,
		params: CreateScheduleDestinationParams
	): Promise<{ destination: ScheduleDestination }> {
		const url = buildUrl(
			this.#baseUrl,
			`/schedule/destinations/create/${encodeURIComponent(scheduleId)}`
		);
		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke<{ destination: ScheduleDestination }>(url, {
			method: 'POST',
			signal,
			body: JSON.stringify(params),
			contentType: 'application/json',
			telemetry: {
				name: 'agentuity.schedule.createDestination',
				attributes: {
					scheduleId,
					type: params.type,
				},
			},
		});

		if (res.ok) {
			return res.data;
		}

		throw await toServiceException('POST', url, res.response);
	}

	/**
	 * Delete a destination from a schedule.
	 *
	 * @param destinationId - The destination ID (prefixed with `sdst_`)
	 * @throws ServiceException on API errors (e.g., destination not found)
	 *
	 * @example
	 * ```typescript
	 * await service.deleteDestination('sdst_xyz789');
	 * console.log('Destination removed');
	 * ```
	 */
	async deleteDestination(destinationId: string): Promise<void> {
		const url = buildUrl(
			this.#baseUrl,
			`/schedule/destinations/delete/${encodeURIComponent(destinationId)}`
		);
		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke<void>(url, {
			method: 'DELETE',
			signal,
			telemetry: {
				name: 'agentuity.schedule.deleteDestination',
				attributes: {
					destinationId,
				},
			},
		});

		if (res.ok) {
			return;
		}

		throw await toServiceException('DELETE', url, res.response);
	}

	/**
	 * List delivery attempts for a schedule with optional pagination.
	 *
	 * @param scheduleId - The schedule ID (prefixed with `sch_`)
	 * @param params - Optional pagination parameters
	 * @param params.limit - Maximum number of deliveries to return
	 * @param params.offset - Number of deliveries to skip for pagination
	 * @returns A list of delivery attempt records
	 * @throws ServiceException on API errors (including 404 if schedule not found)
	 *
	 * @example
	 * ```typescript
	 * const { deliveries } = await service.listDeliveries('sch_abc123');
	 * for (const d of deliveries) {
	 *   console.log(`${d.date}: ${d.status} (retries: ${d.retries})`);
	 *   if (d.error) {
	 *     console.error('  Error:', d.error);
	 *   }
	 * }
	 * ```
	 */
	async listDeliveries(
		scheduleId: string,
		params?: { limit?: number; offset?: number }
	): Promise<ScheduleDeliveryListResult> {
		const qs = new URLSearchParams();
		if (params?.limit !== undefined) {
			qs.set('limit', String(params.limit));
		}
		if (params?.offset !== undefined) {
			qs.set('offset', String(params.offset));
		}

		const basePath = `/schedule/deliveries/${encodeURIComponent(scheduleId)}`;
		const path = qs.toString() ? `${basePath}?${qs.toString()}` : basePath;
		const url = buildUrl(this.#baseUrl, path);
		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke<ScheduleDeliveryListResult>(url, {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.schedule.listDeliveries',
				attributes: {
					scheduleId,
					limit: String(params?.limit ?? ''),
					offset: String(params?.offset ?? ''),
				},
			},
		});

		if (res.ok) {
			return res.data;
		}

		if (res.response.status === 404) {
			throw await toServiceException('GET', url, res.response);
		}

		throw await toServiceException('GET', url, res.response);
	}

	/**
	 * Get a specific destination for a schedule by its ID.
	 *
	 * @remarks This is a convenience method that fetches the schedule and filters
	 * its destinations client-side. For large destination lists, prefer using
	 * {@link get} directly.
	 *
	 * @param scheduleId - The schedule ID (prefixed with `sch_`)
	 * @param destinationId - The destination ID (prefixed with `sdst_`)
	 * @returns The matching destination record
	 * @throws Error if the destination is not found within the schedule
	 * @throws ServiceException on API errors when fetching the schedule
	 *
	 * @example
	 * ```typescript
	 * const dest = await service.getDestination('sch_abc123', 'sdst_xyz789');
	 * console.log('Destination type:', dest.type);
	 * console.log('Config:', dest.config);
	 * ```
	 */
	async getDestination(scheduleId: string, destinationId: string): Promise<ScheduleDestination> {
		const result = await this.get(scheduleId);
		const destination = result.destinations.find((d) => d.id === destinationId);
		if (!destination) {
			throw new Error(`Destination not found: ${destinationId}`);
		}
		return destination;
	}

	/**
	 * Get a specific delivery record by its ID.
	 *
	 * @remarks This is a convenience method that lists deliveries and filters
	 * client-side. Use the optional `params` to control the search window if
	 * the delivery may not be in the first page of results.
	 *
	 * @param scheduleId - The schedule ID (prefixed with `sch_`)
	 * @param deliveryId - The delivery ID to find
	 * @param params - Optional pagination parameters to control the search window
	 * @returns The matching delivery record
	 * @throws Error if the delivery is not found in the result set
	 * @throws ServiceException on API errors when listing deliveries
	 *
	 * @example
	 * ```typescript
	 * const delivery = await service.getDelivery('sch_abc123', 'del_xyz789');
	 * console.log('Status:', delivery.status);
	 * console.log('Retries:', delivery.retries);
	 * ```
	 */
	async getDelivery(
		scheduleId: string,
		deliveryId: string,
		params?: { limit?: number; offset?: number }
	): Promise<ScheduleDelivery> {
		const result = await this.listDeliveries(scheduleId, params);
		const delivery = result.deliveries.find((d) => d.id === deliveryId);
		if (!delivery) {
			throw new Error(`Delivery not found: ${deliveryId}`);
		}
		return delivery;
	}
}
