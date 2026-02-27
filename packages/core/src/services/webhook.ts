import { FetchAdapter } from './adapter.ts';
import { buildUrl, toServiceException } from './_util.ts';

export interface Webhook {
	id: string;
	created_at: string;
	updated_at: string;
	created_by: string;
	name: string;
	description: string | null;
	url: string;
}

export interface WebhookDestination {
	id: string;
	webhook_id: string;
	created_at: string;
	updated_at: string;
	created_by: string;
	type: string;
	config: Record<string, unknown>;
}

export interface WebhookReceipt {
	id: string;
	date: string;
	webhook_id: string;
	headers: Record<string, string>;
	payload: unknown;
}

export interface WebhookDelivery {
	id: string;
	date: string;
	webhook_id: string;
	webhook_destination_id: string;
	webhook_receipt_id: string;
	status: 'pending' | 'success' | 'failed';
	retries: number;
	error: string | null;
	response: Record<string, unknown> | null;
}

export interface CreateWebhookParams {
	name: string;
	description?: string;
}

export interface UpdateWebhookParams {
	name?: string;
	description?: string;
}

export interface CreateWebhookDestinationParams {
	type: string;
	config: Record<string, unknown>;
}

export interface WebhookListResult {
	webhooks: Webhook[];
	total: number;
}

export interface WebhookGetResult {
	webhook: Webhook;
	destinations: WebhookDestination[];
}

export interface WebhookCreateResult {
	webhook: Webhook;
}

export interface WebhookReceiptListResult {
	receipts: WebhookReceipt[];
}

export interface WebhookDeliveryListResult {
	deliveries: WebhookDelivery[];
}

export class WebhookService {
	#adapter: FetchAdapter;
	#baseUrl: string;

	constructor(baseUrl: string, adapter: FetchAdapter) {
		this.#adapter = adapter;
		this.#baseUrl = baseUrl;
	}

	/**
	 * Ion webhook handlers wrap responses in { success: true, data: ... }.
	 * The adapter's fromResponse returns the full JSON body, so we need
	 * to unwrap the `data` field to get the actual payload.
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	#unwrap<T>(raw: any): T {
		if (raw && typeof raw === 'object' && 'data' in raw) {
			return raw.data as T;
		}
		return raw as T;
	}

	async create(params: CreateWebhookParams): Promise<WebhookCreateResult> {
		const url = buildUrl(this.#baseUrl, '/webhook/2026-02-24/create');
		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke<WebhookCreateResult>(url, {
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
			const webhook = this.#unwrap<Webhook>(res.data);
			return { webhook };
		}

		throw await toServiceException('POST', url, res.response);
	}

	async list(params?: { limit?: number; offset?: number }): Promise<WebhookListResult> {
		const qs = new URLSearchParams();
		if (params?.limit !== undefined) {
			qs.set('limit', String(params.limit));
		}
		if (params?.offset !== undefined) {
			qs.set('offset', String(params.offset));
		}

		const path = qs.toString()
			? `/webhook/2026-02-24/list?${qs.toString()}`
			: '/webhook/2026-02-24/list';
		const url = buildUrl(this.#baseUrl, path);
		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke<WebhookListResult>(url, {
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
			// Ion returns { success: true, data: [webhooks] } — unwrap the array
			const webhooks = this.#unwrap<Webhook[]>(res.data);
			const arr = Array.isArray(webhooks) ? webhooks : [];
			return { webhooks: arr, total: arr.length };
		}

		throw await toServiceException('GET', url, res.response);
	}

	async get(webhookId: string): Promise<WebhookGetResult> {
		const url = buildUrl(
			this.#baseUrl,
			`/webhook/2026-02-24/get/${encodeURIComponent(webhookId)}`
		);
		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke<WebhookGetResult>(url, {
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
			// Ion returns just the webhook object (no destinations)
			const webhook = this.#unwrap<Webhook>(res.data);
			// Fetch destinations separately to match the expected interface
			const { destinations } = await this.listDestinations(webhookId);
			return { webhook, destinations };
		}

		if (res.response.status === 404) {
			throw await toServiceException('GET', url, res.response);
		}

		throw await toServiceException('GET', url, res.response);
	}

	async update(webhookId: string, params: UpdateWebhookParams): Promise<{ webhook: Webhook }> {
		const url = buildUrl(
			this.#baseUrl,
			`/webhook/2026-02-24/update/${encodeURIComponent(webhookId)}`
		);
		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke<{ webhook: Webhook }>(url, {
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
			const webhook = this.#unwrap<Webhook>(res.data);
			return { webhook };
		}

		throw await toServiceException('PUT', url, res.response);
	}

	async delete(webhookId: string): Promise<void> {
		const url = buildUrl(
			this.#baseUrl,
			`/webhook/2026-02-24/delete/${encodeURIComponent(webhookId)}`
		);
		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke<void>(url, {
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
			return;
		}

		throw await toServiceException('DELETE', url, res.response);
	}

	async createDestination(
		webhookId: string,
		params: CreateWebhookDestinationParams
	): Promise<{ destination: WebhookDestination }> {
		const url = buildUrl(
			this.#baseUrl,
			`/webhook/2026-02-24/destination-create/${encodeURIComponent(webhookId)}`
		);
		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke<{ destination: WebhookDestination }>(url, {
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
			const destination = this.#unwrap<WebhookDestination>(res.data);
			return { destination };
		}

		throw await toServiceException('POST', url, res.response);
	}

	async listDestinations(webhookId: string): Promise<{ destinations: WebhookDestination[] }> {
		const url = buildUrl(
			this.#baseUrl,
			`/webhook/2026-02-24/destination-list/${encodeURIComponent(webhookId)}`
		);
		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke<{ destinations: WebhookDestination[] }>(url, {
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
			const destinations = this.#unwrap<WebhookDestination[]>(res.data);
			return { destinations: Array.isArray(destinations) ? destinations : [] };
		}

		throw await toServiceException('GET', url, res.response);
	}

	async deleteDestination(webhookId: string, destinationId: string): Promise<void> {
		const url = buildUrl(
			this.#baseUrl,
			`/webhook/2026-02-24/destination-delete/${encodeURIComponent(webhookId)}/${encodeURIComponent(destinationId)}`
		);
		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke<void>(url, {
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
			return;
		}

		throw await toServiceException('DELETE', url, res.response);
	}

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

		const basePath = `/webhook/2026-02-24/receipt-list/${encodeURIComponent(webhookId)}`;
		const path = qs.toString() ? `${basePath}?${qs.toString()}` : basePath;
		const url = buildUrl(this.#baseUrl, path);
		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke<WebhookReceiptListResult>(url, {
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
			const receipts = this.#unwrap<WebhookReceipt[]>(res.data);
			return { receipts: Array.isArray(receipts) ? receipts : [] };
		}

		if (res.response.status === 404) {
			throw await toServiceException('GET', url, res.response);
		}

		throw await toServiceException('GET', url, res.response);
	}

	async getReceipt(webhookId: string, receiptId: string): Promise<WebhookReceipt> {
		const url = buildUrl(
			this.#baseUrl,
			`/webhook/2026-02-24/receipt-get/${encodeURIComponent(webhookId)}/${encodeURIComponent(receiptId)}`
		);
		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke<WebhookReceipt>(url, {
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
			return this.#unwrap<WebhookReceipt>(res.data);
		}

		if (res.response.status === 404) {
			throw await toServiceException('GET', url, res.response);
		}

		throw await toServiceException('GET', url, res.response);
	}

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

		const basePath = `/webhook/2026-02-24/delivery-list/${encodeURIComponent(webhookId)}`;
		const path = qs.toString() ? `${basePath}?${qs.toString()}` : basePath;
		const url = buildUrl(this.#baseUrl, path);
		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke<WebhookDeliveryListResult>(url, {
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
			const deliveries = this.#unwrap<WebhookDelivery[]>(res.data);
			return { deliveries: Array.isArray(deliveries) ? deliveries : [] };
		}

		if (res.response.status === 404) {
			throw await toServiceException('GET', url, res.response);
		}

		throw await toServiceException('GET', url, res.response);
	}

	async retryDelivery(webhookId: string, deliveryId: string): Promise<void> {
		const url = buildUrl(
			this.#baseUrl,
			`/webhook/2026-02-24/delivery-retry/${encodeURIComponent(webhookId)}/${encodeURIComponent(deliveryId)}`
		);
		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke<void>(url, {
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
			return;
		}

		throw await toServiceException('POST', url, res.response);
	}

	async replayDelivery(webhookId: string, deliveryId: string): Promise<void> {
		const url = buildUrl(
			this.#baseUrl,
			`/webhook/2026-02-24/delivery-replay/${encodeURIComponent(webhookId)}/${encodeURIComponent(deliveryId)}`
		);
		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke<void>(url, {
			method: 'POST',
			signal,
			telemetry: {
				name: 'agentuity.webhook.replayDelivery',
				attributes: {
					webhookId,
					deliveryId,
				},
			},
		});

		if (res.ok) {
			return;
		}

		throw await toServiceException('POST', url, res.response);
	}
}
