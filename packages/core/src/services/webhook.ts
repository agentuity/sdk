import { FetchAdapter } from './adapter.ts';
import { buildUrl, toServiceException } from './_util.ts';
import { StructuredError } from '../error.ts';

/**
 * Creates an {@link AbortSignal} that will abort after the specified timeout.
 *
 * @remarks
 * Falls back to a manual `AbortController` + `setTimeout` if `AbortSignal.timeout`
 * is not available in the runtime.
 *
 * @param ms - Timeout in milliseconds
 * @returns An abort signal that triggers after `ms` milliseconds
 *
 * @default 30000
 */
function createTimeoutSignal(ms = 30_000): AbortSignal {
	if (typeof AbortSignal.timeout === 'function') {
		return AbortSignal.timeout(ms);
	}
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), ms);
	controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
	return controller.signal;
}

/**
 * A webhook endpoint that can receive HTTP requests. Each webhook has a unique
 * ingest URL and can forward received payloads to configured destinations.
 */
export interface Webhook {
	/** Unique identifier for the webhook. */
	id: string;

	/** ISO 8601 timestamp when the webhook was created. */
	created_at: string;

	/** ISO 8601 timestamp when the webhook was last modified. */
	updated_at: string;

	/** ID of the user who created the webhook. */
	created_by: string;

	/** Human-readable name for the webhook. */
	name: string;

	/** Optional description of the webhook's purpose. */
	description: string | null;

	/**
	 * The fully-qualified ingest URL where HTTP requests should be sent.
	 *
	 * @remarks Format: `https://<catalyst-url>/webhook/<orgId>-<webhookId>`
	 */
	url: string;
}

/**
 * A delivery target for a webhook. When an HTTP request is received at the
 * webhook's ingest URL, the payload is forwarded to each of its destinations.
 */
export interface WebhookDestination {
	/** Unique identifier for the destination. */
	id: string;

	/** The ID of the parent webhook. */
	webhook_id: string;

	/** ISO 8601 timestamp when the destination was created. */
	created_at: string;

	/** ISO 8601 timestamp when the destination was last modified. */
	updated_at: string;

	/** ID of the user who created the destination. */
	created_by: string;

	/**
	 * The destination type.
	 *
	 * @remarks Currently only `'url'` is supported.
	 */
	type: string;

	/**
	 * Destination-specific configuration.
	 *
	 * @remarks For `'url'` type: `{ url: string, headers?: Record<string, string> }`.
	 * The URL must use http or https.
	 */
	config: Record<string, unknown>;
}

/**
 * A record of an HTTP request received at a webhook's ingest URL. Each receipt
 * captures the request headers and payload for auditing and replay.
 */
export interface WebhookReceipt {
	/** Unique identifier for the receipt. */
	id: string;

	/** ISO 8601 timestamp when the request was received. */
	date: string;

	/** The ID of the webhook that received the request. */
	webhook_id: string;

	/** HTTP headers from the incoming request. */
	headers: Record<string, string>;

	/** The request body/payload, preserved in its original form. */
	payload: unknown;
}

/**
 * A record of a delivery attempt from a webhook receipt to a destination.
 * Tracks the forwarding status and supports retries for failed deliveries.
 */
export interface WebhookDelivery {
	/** Unique identifier for the delivery attempt. */
	id: string;

	/** ISO 8601 timestamp when the delivery was attempted. */
	date: string;

	/** The ID of the parent webhook. */
	webhook_id: string;

	/** The ID of the destination this delivery was sent to. */
	webhook_destination_id: string;

	/** The ID of the receipt that triggered this delivery. */
	webhook_receipt_id: string;

	/**
	 * Delivery status.
	 *
	 * - `'pending'` — Queued for delivery.
	 * - `'success'` — Successfully delivered.
	 * - `'failed'` — Delivery error occurred.
	 */
	status: 'pending' | 'success' | 'failed';

	/** Number of retry attempts made. */
	retries: number;

	/** Error message if delivery failed, `null` on success. */
	error: string | null;

	/** The response received from the destination endpoint, or `null`. */
	response: Record<string, unknown> | null;
}

/**
 * Parameters for creating a new webhook.
 */
export interface CreateWebhookParams {
	/** Human-readable name for the webhook (required). */
	name: string;

	/** Optional description of the webhook's purpose. */
	description?: string;
}

/**
 * Parameters for updating a webhook. Only provided fields are modified.
 */
export interface UpdateWebhookParams {
	/** Updated name. */
	name?: string;

	/** Updated description. */
	description?: string;
}

/**
 * Parameters for creating a new webhook destination.
 */
export interface CreateWebhookDestinationParams {
	/**
	 * The destination type.
	 *
	 * @remarks Currently only `'url'` is supported.
	 */
	type: string;

	/**
	 * Type-specific configuration.
	 *
	 * @remarks For `'url'` type: `{ url: string, headers?: Record<string, string> }`.
	 */
	config: Record<string, unknown>;
}

/**
 * Paginated list of webhooks.
 */
export interface WebhookListResult {
	/** Array of webhooks. */
	webhooks: Webhook[];

	/** Total number of webhooks. */
	total: number;
}

/**
 * Result of fetching a single webhook, including its configured destinations.
 */
export interface WebhookGetResult {
	/** The requested webhook. */
	webhook: Webhook;

	/** Array of destinations configured for this webhook. */
	destinations: WebhookDestination[];
}

/**
 * Result of creating a webhook.
 */
export interface WebhookCreateResult {
	/** The newly created webhook. */
	webhook: Webhook;
}

/**
 * Result of updating a webhook.
 */
export interface UpdateWebhookResult {
	/** The updated webhook. */
	webhook: Webhook;
}

/**
 * Result of creating a webhook destination.
 */
export interface CreateDestinationResult {
	/** The newly created destination. */
	destination: WebhookDestination;
}

/**
 * List of destinations for a webhook.
 */
export interface ListDestinationsResult {
	/** Array of destinations. */
	destinations: WebhookDestination[];
}

/**
 * List of receipts (incoming requests) for a webhook.
 */
export interface WebhookReceiptListResult {
	/** Array of receipt records. */
	receipts: WebhookReceipt[];
}

/**
 * List of delivery attempts for a webhook.
 */
export interface WebhookDeliveryListResult {
	/** Array of delivery records. */
	deliveries: WebhookDelivery[];
}

/**
 * Internal API success response envelope for webhook operations.
 */
interface WebhookSuccessResponse<T> {
	success: true;
	data: T;
}

/**
 * Internal API error response envelope for webhook operations.
 */
interface WebhookErrorResponse {
	success: false;
	message: string;
}

/**
 * Discriminated union of API success and error responses for webhook operations.
 */
type WebhookResponse<T> = WebhookSuccessResponse<T> | WebhookErrorResponse;

/**
 * Thrown when the API returns a success HTTP status but the response body indicates failure.
 */
const WebhookResponseError = StructuredError('WebhookResponseError')<{
	status: number;
}>();

/**
 * Client for the Agentuity Webhook service.
 *
 * Provides methods for creating and managing webhook endpoints that can receive
 * HTTP requests and forward them to configured destinations. The service supports:
 *
 * - **Webhooks**: Named endpoints with unique ingest URLs
 * - **Destinations**: URL-based targets that receive forwarded payloads
 * - **Receipts**: Records of incoming HTTP requests for auditing
 * - **Deliveries**: Records of forwarding attempts with retry support
 *
 * When an HTTP request hits a webhook's ingest URL, it is recorded as a receipt
 * and then delivered to all configured destinations. Failed deliveries can be
 * retried via {@link WebhookService.retryDelivery}.
 *
 * All methods are instrumented with OpenTelemetry spans for observability.
 *
 * @example
 * ```typescript
 * const webhooks = new WebhookService(baseUrl, adapter);
 *
 * // Create a webhook
 * const { webhook } = await webhooks.create({ name: 'GitHub Events' });
 * console.log('Ingest URL:', webhook.url);
 *
 * // Add a destination
 * await webhooks.createDestination(webhook.id, {
 *   type: 'url',
 *   config: { url: 'https://example.com/handle-github' },
 * });
 *
 * // Check delivery history
 * const { deliveries } = await webhooks.listDeliveries(webhook.id);
 * ```
 */
export class WebhookService {
	#adapter: FetchAdapter;
	#baseUrl: string;

	/**
	 * Creates a new WebhookService instance.
	 *
	 * @param baseUrl - The base URL of the webhook API
	 * @param adapter - The HTTP fetch adapter used for making API requests
	 */
	constructor(baseUrl: string, adapter: FetchAdapter) {
		this.#adapter = adapter;
		this.#baseUrl = baseUrl;
	}

	/**
	 * Unwrap a potentially nested response envelope. Some API responses wrap the data
	 * in an additional `{ data: T }` layer; this method normalizes both shapes.
	 *
	 * @param raw - The raw response data to unwrap
	 * @returns The unwrapped data of type `T`
	 */
	#unwrap<T>(raw: unknown): T {
		if (raw !== null && typeof raw === 'object' && 'data' in raw) {
			return (raw as Record<string, unknown>).data as T;
		}
		return raw as T;
	}

	/**
	 * Create a new webhook endpoint.
	 *
	 * @param params - The webhook creation parameters including name and optional description
	 * @returns The newly created webhook with its unique ingest URL
	 * @throws {@link ServiceException} if the API request fails
	 *
	 * @example
	 * ```typescript
	 * const { webhook } = await webhooks.create({
	 *   name: 'Stripe Events',
	 *   description: 'Receives payment webhooks from Stripe',
	 * });
	 * console.log('Ingest URL:', webhook.url);
	 * ```
	 */
	async create(params: CreateWebhookParams): Promise<WebhookCreateResult> {
		const url = buildUrl(this.#baseUrl, '/webhook/create');
		const signal = createTimeoutSignal();
		const res = await this.#adapter.invoke<WebhookResponse<Webhook>>(url, {
			method: 'POST',
			signal,
			body: JSON.stringify(params),
			contentType: 'application/json',
			telemetry: {
				name: 'agentuity.webhook.create',
				attributes: {
					name: params.name,
				},
			},
		});

		if (res.ok) {
			if (res.data.success) {
				return { webhook: res.data.data };
			}
			throw new WebhookResponseError({ status: res.response.status, message: res.data.message });
		}

		throw await toServiceException('POST', url, res.response);
	}

	/**
	 * List all webhooks with optional pagination.
	 *
	 * @param params - Optional pagination parameters
	 * @returns Paginated list of webhooks with total count
	 * @throws {@link ServiceException} if the API request fails
	 *
	 * @example
	 * ```typescript
	 * const { webhooks, total } = await webhooks.list({ limit: 10, offset: 0 });
	 * console.log(`Showing ${webhooks.length} of ${total} webhooks`);
	 * for (const wh of webhooks) {
	 *   console.log(`${wh.name}: ${wh.url}`);
	 * }
	 * ```
	 */
	async list(params?: { limit?: number; offset?: number }): Promise<WebhookListResult> {
		const qs = new URLSearchParams();
		if (params?.limit !== undefined) {
			qs.set('limit', String(params.limit));
		}
		if (params?.offset !== undefined) {
			qs.set('offset', String(params.offset));
		}

		const path = qs.toString()
			? `/webhook/list?${qs.toString()}`
			: '/webhook/list';
		const url = buildUrl(this.#baseUrl, path);
		const signal = createTimeoutSignal();
		const res = await this.#adapter.invoke<WebhookResponse<Webhook[]>>(url, {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.webhook.list',
				attributes: {
					limit: String(params?.limit ?? ''),
					offset: String(params?.offset ?? ''),
				},
			},
		});

		if (res.ok) {
			if (res.data.success) {
				const unwrapped = this.#unwrap<Webhook[] | { data: Webhook[]; total: number }>(
					res.data.data
				);
				if (Array.isArray(unwrapped)) {
					return { webhooks: unwrapped, total: unwrapped.length };
				}
				const arr = Array.isArray(unwrapped.data) ? unwrapped.data : [];
				return { webhooks: arr, total: unwrapped.total ?? arr.length };
			}
			throw new WebhookResponseError({ status: res.response.status, message: res.data.message });
		}

		throw await toServiceException('GET', url, res.response);
	}

	/**
	 * Get a webhook by its ID, including its configured destinations.
	 *
	 * @param webhookId - The unique webhook identifier
	 * @returns The webhook and its list of destinations
	 * @throws {@link ServiceException} if the API request fails
	 *
	 * @example
	 * ```typescript
	 * const { webhook, destinations } = await webhooks.get('wh_abc123');
	 * console.log(`${webhook.name} has ${destinations.length} destination(s)`);
	 * ```
	 */
	async get(webhookId: string): Promise<WebhookGetResult> {
		const url = buildUrl(
			this.#baseUrl,
			`/webhook/get/${encodeURIComponent(webhookId)}`
		);
		const signal = createTimeoutSignal();
		const res = await this.#adapter.invoke<WebhookResponse<Webhook>>(url, {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.webhook.get',
				attributes: {
					webhookId,
				},
			},
		});

		if (res.ok) {
			if (res.data.success) {
				const { destinations } = await this.listDestinations(webhookId);
				return { webhook: res.data.data, destinations };
			}
			throw new WebhookResponseError({ status: res.response.status, message: res.data.message });
		}

		throw await toServiceException('GET', url, res.response);
	}

	/**
	 * Update a webhook's name and/or description.
	 *
	 * @param webhookId - The unique webhook identifier
	 * @param params - Fields to update; only provided fields are changed
	 * @returns The updated webhook
	 * @throws {@link ServiceException} if the API request fails
	 *
	 * @example
	 * ```typescript
	 * const { webhook } = await webhooks.update('wh_abc123', {
	 *   name: 'GitHub Events (Production)',
	 *   description: 'Production webhook for GitHub push events',
	 * });
	 * console.log('Updated:', webhook.name);
	 * ```
	 */
	async update(webhookId: string, params: UpdateWebhookParams): Promise<UpdateWebhookResult> {
		const url = buildUrl(
			this.#baseUrl,
			`/webhook/update/${encodeURIComponent(webhookId)}`
		);
		const signal = createTimeoutSignal();
		const res = await this.#adapter.invoke<WebhookResponse<Webhook>>(url, {
			method: 'PUT',
			signal,
			body: JSON.stringify(params),
			contentType: 'application/json',
			telemetry: {
				name: 'agentuity.webhook.update',
				attributes: {
					webhookId,
				},
			},
		});

		if (res.ok) {
			if (res.data.success) {
				return { webhook: res.data.data };
			}
			throw new WebhookResponseError({ status: res.response.status, message: res.data.message });
		}

		throw await toServiceException('PUT', url, res.response);
	}

	/**
	 * Delete a webhook and all its associated destinations, receipts, and deliveries.
	 *
	 * @param webhookId - The unique webhook identifier
	 * @throws {@link ServiceException} if the API request fails
	 *
	 * @example
	 * ```typescript
	 * await webhooks.delete('wh_abc123');
	 * console.log('Webhook deleted');
	 * ```
	 */
	async delete(webhookId: string): Promise<void> {
		const url = buildUrl(
			this.#baseUrl,
			`/webhook/delete/${encodeURIComponent(webhookId)}`
		);
		const signal = createTimeoutSignal();
		const res = await this.#adapter.invoke<WebhookResponse<null>>(url, {
			method: 'DELETE',
			signal,
			telemetry: {
				name: 'agentuity.webhook.delete',
				attributes: {
					webhookId,
				},
			},
		});

		if (res.ok) {
			if (res.data?.success !== false) {
				return;
			}
			throw new WebhookResponseError({
				status: res.response.status,
				message: res.data?.message ?? 'Delete failed',
			});
		}

		throw await toServiceException('DELETE', url, res.response);
	}

	/**
	 * Create a new destination for a webhook. When the webhook receives a request,
	 * the payload will be forwarded to this destination.
	 *
	 * @param webhookId - The ID of the parent webhook
	 * @param params - Destination configuration including type and type-specific config
	 * @returns The newly created destination
	 * @throws {@link ServiceException} if the API request fails
	 *
	 * @example
	 * ```typescript
	 * const { destination } = await webhooks.createDestination('wh_abc123', {
	 *   type: 'url',
	 *   config: {
	 *     url: 'https://example.com/webhook-handler',
	 *     headers: { 'X-Custom-Header': 'my-value' },
	 *   },
	 * });
	 * console.log('Destination created:', destination.id);
	 * ```
	 */
	async createDestination(
		webhookId: string,
		params: CreateWebhookDestinationParams
	): Promise<CreateDestinationResult> {
		const url = buildUrl(
			this.#baseUrl,
			`/webhook/destination-create/${encodeURIComponent(webhookId)}`
		);
		const signal = createTimeoutSignal();
		const res = await this.#adapter.invoke<WebhookResponse<WebhookDestination>>(url, {
			method: 'POST',
			signal,
			body: JSON.stringify(params),
			contentType: 'application/json',
			telemetry: {
				name: 'agentuity.webhook.createDestination',
				attributes: {
					webhookId,
					type: params.type,
				},
			},
		});

		if (res.ok) {
			if (res.data.success) {
				return { destination: res.data.data };
			}
			throw new WebhookResponseError({ status: res.response.status, message: res.data.message });
		}

		throw await toServiceException('POST', url, res.response);
	}

	/**
	 * List all destinations configured for a webhook.
	 *
	 * @param webhookId - The ID of the webhook
	 * @returns List of destinations
	 * @throws {@link ServiceException} if the API request fails
	 *
	 * @example
	 * ```typescript
	 * const { destinations } = await webhooks.listDestinations('wh_abc123');
	 * for (const dest of destinations) {
	 *   console.log(`${dest.type}: ${JSON.stringify(dest.config)}`);
	 * }
	 * ```
	 */
	async listDestinations(webhookId: string): Promise<ListDestinationsResult> {
		const url = buildUrl(
			this.#baseUrl,
			`/webhook/destination-list/${encodeURIComponent(webhookId)}`
		);
		const signal = createTimeoutSignal();
		const res = await this.#adapter.invoke<WebhookResponse<WebhookDestination[]>>(url, {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.webhook.listDestinations',
				attributes: {
					webhookId,
				},
			},
		});

		if (res.ok) {
			if (res.data.success) {
				return { destinations: Array.isArray(res.data.data) ? res.data.data : [] };
			}
			throw new WebhookResponseError({ status: res.response.status, message: res.data.message });
		}

		throw await toServiceException('GET', url, res.response);
	}

	/**
	 * Delete a destination from a webhook.
	 *
	 * @param webhookId - The ID of the parent webhook
	 * @param destinationId - The ID of the destination to delete
	 * @throws {@link ServiceException} if the API request fails
	 *
	 * @example
	 * ```typescript
	 * await webhooks.deleteDestination('wh_abc123', 'dest_xyz789');
	 * console.log('Destination deleted');
	 * ```
	 */
	async deleteDestination(webhookId: string, destinationId: string): Promise<void> {
		const url = buildUrl(
			this.#baseUrl,
			`/webhook/destination-delete/${encodeURIComponent(webhookId)}/${encodeURIComponent(destinationId)}`
		);
		const signal = createTimeoutSignal();
		const res = await this.#adapter.invoke<WebhookResponse<null>>(url, {
			method: 'DELETE',
			signal,
			telemetry: {
				name: 'agentuity.webhook.deleteDestination',
				attributes: {
					webhookId,
					destinationId,
				},
			},
		});

		if (res.ok) {
			if (res.data?.success !== false) {
				return;
			}
			throw new WebhookResponseError({
				status: res.response.status,
				message: res.data?.message ?? 'Delete destination failed',
			});
		}

		throw await toServiceException('DELETE', url, res.response);
	}

	/**
	 * List receipts (records of incoming HTTP requests) for a webhook.
	 *
	 * @param webhookId - The ID of the webhook
	 * @param params - Optional pagination parameters
	 * @returns List of receipt records
	 * @throws {@link ServiceException} if the API request fails
	 *
	 * @example
	 * ```typescript
	 * const { receipts } = await webhooks.listReceipts('wh_abc123', {
	 *   limit: 50,
	 * });
	 * for (const receipt of receipts) {
	 *   console.log(`${receipt.date}: ${JSON.stringify(receipt.headers)}`);
	 * }
	 * ```
	 */
	async listReceipts(
		webhookId: string,
		params?: { limit?: number; offset?: number }
	): Promise<WebhookReceiptListResult> {
		const qs = new URLSearchParams();
		if (params?.limit !== undefined) {
			qs.set('limit', String(params.limit));
		}
		if (params?.offset !== undefined) {
			qs.set('offset', String(params.offset));
		}

		const basePath = `/webhook/receipt-list/${encodeURIComponent(webhookId)}`;
		const path = qs.toString() ? `${basePath}?${qs.toString()}` : basePath;
		const url = buildUrl(this.#baseUrl, path);
		const signal = createTimeoutSignal();
		const res = await this.#adapter.invoke<WebhookResponse<WebhookReceipt[]>>(url, {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.webhook.listReceipts',
				attributes: {
					webhookId,
					limit: String(params?.limit ?? ''),
					offset: String(params?.offset ?? ''),
				},
			},
		});

		if (res.ok) {
			if (res.data.success) {
				return { receipts: Array.isArray(res.data.data) ? res.data.data : [] };
			}
			throw new WebhookResponseError({ status: res.response.status, message: res.data.message });
		}

		throw await toServiceException('GET', url, res.response);
	}

	/**
	 * Get a single receipt by its ID, including the full payload.
	 *
	 * @param webhookId - The ID of the webhook
	 * @param receiptId - The unique receipt identifier
	 * @returns The receipt record with headers and payload
	 * @throws {@link ServiceException} if the API request fails
	 *
	 * @example
	 * ```typescript
	 * const receipt = await webhooks.getReceipt('wh_abc123', 'rcpt_def456');
	 * console.log('Payload:', receipt.payload);
	 * console.log('Headers:', receipt.headers);
	 * ```
	 */
	async getReceipt(webhookId: string, receiptId: string): Promise<WebhookReceipt> {
		const url = buildUrl(
			this.#baseUrl,
			`/webhook/receipt-get/${encodeURIComponent(webhookId)}/${encodeURIComponent(receiptId)}`
		);
		const signal = createTimeoutSignal();
		const res = await this.#adapter.invoke<WebhookResponse<WebhookReceipt>>(url, {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.webhook.getReceipt',
				attributes: {
					webhookId,
					receiptId,
				},
			},
		});

		if (res.ok) {
			if (res.data.success) {
				return res.data.data;
			}
			throw new WebhookResponseError({ status: res.response.status, message: res.data.message });
		}

		throw await toServiceException('GET', url, res.response);
	}

	/**
	 * List delivery attempts for a webhook with optional pagination.
	 *
	 * @param webhookId - The ID of the webhook
	 * @param params - Optional pagination parameters
	 * @returns List of delivery records showing forwarding status
	 * @throws {@link ServiceException} if the API request fails
	 *
	 * @example
	 * ```typescript
	 * const { deliveries } = await webhooks.listDeliveries('wh_abc123');
	 * for (const d of deliveries) {
	 *   console.log(`${d.status} → dest ${d.webhook_destination_id} (retries: ${d.retries})`);
	 * }
	 * ```
	 */
	async listDeliveries(
		webhookId: string,
		params?: { limit?: number; offset?: number }
	): Promise<WebhookDeliveryListResult> {
		const qs = new URLSearchParams();
		if (params?.limit !== undefined) {
			qs.set('limit', String(params.limit));
		}
		if (params?.offset !== undefined) {
			qs.set('offset', String(params.offset));
		}

		const basePath = `/webhook/delivery-list/${encodeURIComponent(webhookId)}`;
		const path = qs.toString() ? `${basePath}?${qs.toString()}` : basePath;
		const url = buildUrl(this.#baseUrl, path);
		const signal = createTimeoutSignal();
		const res = await this.#adapter.invoke<WebhookResponse<WebhookDelivery[]>>(url, {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.webhook.listDeliveries',
				attributes: {
					webhookId,
					limit: String(params?.limit ?? ''),
					offset: String(params?.offset ?? ''),
				},
			},
		});

		if (res.ok) {
			if (res.data.success) {
				return { deliveries: Array.isArray(res.data.data) ? res.data.data : [] };
			}
			throw new WebhookResponseError({ status: res.response.status, message: res.data.message });
		}

		throw await toServiceException('GET', url, res.response);
	}

	/**
	 * Retry a failed delivery attempt. Only deliveries with `'failed'` status can be retried.
	 *
	 * @param webhookId - The ID of the parent webhook
	 * @param deliveryId - The ID of the failed delivery to retry
	 * @throws {@link ServiceException} if the API request fails
	 *
	 * @example
	 * ```typescript
	 * // Find and retry failed deliveries
	 * const { deliveries } = await webhooks.listDeliveries('wh_abc123');
	 * for (const d of deliveries) {
	 *   if (d.status === 'failed') {
	 *     await webhooks.retryDelivery('wh_abc123', d.id);
	 *     console.log('Retrying delivery:', d.id);
	 *   }
	 * }
	 * ```
	 */
	async retryDelivery(webhookId: string, deliveryId: string): Promise<void> {
		const url = buildUrl(
			this.#baseUrl,
			`/webhook/delivery-retry/${encodeURIComponent(webhookId)}/${encodeURIComponent(deliveryId)}`
		);
		const signal = createTimeoutSignal();
		const res = await this.#adapter.invoke<WebhookResponse<null>>(url, {
			method: 'POST',
			signal,
			telemetry: {
				name: 'agentuity.webhook.retryDelivery',
				attributes: {
					webhookId,
					deliveryId,
				},
			},
		});

		if (res.ok) {
			if (res.data?.success !== false) {
				return;
			}
			throw new WebhookResponseError({
				status: res.response.status,
				message: res.data?.message ?? 'Retry delivery failed',
			});
		}

		throw await toServiceException('POST', url, res.response);
	}
}
