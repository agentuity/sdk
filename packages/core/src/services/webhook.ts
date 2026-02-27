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

interface WebhookSuccessResponse<T> {
	success: true;
	data: T;
}

interface WebhookErrorResponse {
	success: false;
	message: string;
}

type WebhookResponse<T> = WebhookSuccessResponse<T> | WebhookErrorResponse;

class WebhookResponseError extends Error {
	status: number;

	constructor({ status, message }: { status: number; message: string }) {
		super(message);
		this.name = 'WebhookResponseError';
		this.status = status;
	}
}

export class WebhookService {
	#adapter: FetchAdapter;
	#baseUrl: string;

	constructor(baseUrl: string, adapter: FetchAdapter) {
		this.#adapter = adapter;
		this.#baseUrl = baseUrl;
	}

	async create(params: CreateWebhookParams): Promise<WebhookCreateResult> {
		const url = buildUrl(this.#baseUrl, '/webhook/2026-02-24/create');
		const signal = AbortSignal.timeout(30_000);
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
				const arr = Array.isArray(res.data.data) ? res.data.data : [];
				return { webhooks: arr, total: arr.length };
			}
			throw new WebhookResponseError({ status: res.response.status, message: res.data.message });
		}

		throw await toServiceException('GET', url, res.response);
	}

	async get(webhookId: string): Promise<WebhookGetResult> {
		const url = buildUrl(
			this.#baseUrl,
			`/webhook/2026-02-24/get/${encodeURIComponent(webhookId)}`
		);
		const signal = AbortSignal.timeout(30_000);
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

	async update(webhookId: string, params: UpdateWebhookParams): Promise<{ webhook: Webhook }> {
		const url = buildUrl(
			this.#baseUrl,
			`/webhook/2026-02-24/update/${encodeURIComponent(webhookId)}`
		);
		const signal = AbortSignal.timeout(30_000);
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

	async delete(webhookId: string): Promise<void> {
		const url = buildUrl(
			this.#baseUrl,
			`/webhook/2026-02-24/delete/${encodeURIComponent(webhookId)}`
		);
		const signal = AbortSignal.timeout(30_000);
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

	async listDestinations(webhookId: string): Promise<{ destinations: WebhookDestination[] }> {
		const url = buildUrl(
			this.#baseUrl,
			`/webhook/2026-02-24/destination-list/${encodeURIComponent(webhookId)}`
		);
		const signal = AbortSignal.timeout(30_000);
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

	async deleteDestination(webhookId: string, destinationId: string): Promise<void> {
		const url = buildUrl(
			this.#baseUrl,
			`/webhook/2026-02-24/destination-delete/${encodeURIComponent(webhookId)}/${encodeURIComponent(destinationId)}`
		);
		const signal = AbortSignal.timeout(30_000);
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

	async getReceipt(webhookId: string, receiptId: string): Promise<WebhookReceipt> {
		const url = buildUrl(
			this.#baseUrl,
			`/webhook/2026-02-24/receipt-get/${encodeURIComponent(webhookId)}/${encodeURIComponent(receiptId)}`
		);
		const signal = AbortSignal.timeout(30_000);
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

	async retryDelivery(webhookId: string, deliveryId: string): Promise<void> {
		const url = buildUrl(
			this.#baseUrl,
			`/webhook/2026-02-24/delivery-retry/${encodeURIComponent(webhookId)}/${encodeURIComponent(deliveryId)}`
		);
		const signal = AbortSignal.timeout(30_000);
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
			return;
		}

		throw await toServiceException('POST', url, res.response);
	}
}
