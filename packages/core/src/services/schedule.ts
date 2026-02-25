import { FetchAdapter } from './adapter.ts';
import { buildUrl, toServiceException } from './_util.ts';

export interface Schedule {
	id: string;
	created_at: string;
	updated_at: string;
	created_by: string;
	name: string;
	description: string | null;
	expression: string;
	due_date: string;
}

export interface ScheduleDestination {
	id: string;
	schedule_id: string;
	created_at: string;
	updated_at: string;
	created_by: string;
	type: 'url' | 'sandbox';
	config: Record<string, unknown>;
}

export interface ScheduleDelivery {
	id: string;
	date: string;
	schedule_id: string;
	schedule_destination_id: string;
	status: 'pending' | 'success' | 'failed';
	retries: number;
	error: string | null;
	response: Record<string, unknown> | null;
}

export interface CreateScheduleParams {
	name: string;
	description?: string;
	expression: string;
	destinations?: CreateScheduleDestinationParams[];
}

export interface CreateScheduleDestinationParams {
	type: 'url' | 'sandbox';
	config: Record<string, unknown>;
}

export interface UpdateScheduleParams {
	name?: string;
	description?: string;
	expression?: string;
}

export interface ScheduleListResult {
	schedules: Schedule[];
	total: number;
}

export interface ScheduleGetResult {
	schedule: Schedule;
	destinations: ScheduleDestination[];
}

export interface ScheduleCreateResult {
	schedule: Schedule;
	destinations: ScheduleDestination[];
}

export interface ScheduleDeliveryListResult {
	deliveries: ScheduleDelivery[];
}

export class ScheduleService {
	#adapter: FetchAdapter;
	#baseUrl: string;

	constructor(baseUrl: string, adapter: FetchAdapter) {
		this.#adapter = adapter;
		this.#baseUrl = baseUrl;
	}

	async create(params: CreateScheduleParams): Promise<ScheduleCreateResult> {
		const url = buildUrl(this.#baseUrl, '/schedule/create/2026-02-24');
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

	async list(params?: { limit?: number; offset?: number }): Promise<ScheduleListResult> {
		const qs = new URLSearchParams();
		if (params?.limit !== undefined) {
			qs.set('limit', String(params.limit));
		}
		if (params?.offset !== undefined) {
			qs.set('offset', String(params.offset));
		}

		const path = qs.toString()
			? `/schedule/list/2026-02-24?${qs.toString()}`
			: '/schedule/list/2026-02-24';
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

	async get(scheduleId: string): Promise<ScheduleGetResult> {
		const url = buildUrl(
			this.#baseUrl,
			`/schedule/get/2026-02-24/${encodeURIComponent(scheduleId)}`
		);
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

	async update(scheduleId: string, params: UpdateScheduleParams): Promise<{ schedule: Schedule }> {
		const url = buildUrl(
			this.#baseUrl,
			`/schedule/update/2026-02-24/${encodeURIComponent(scheduleId)}`
		);
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

	async delete(scheduleId: string): Promise<void> {
		const url = buildUrl(
			this.#baseUrl,
			`/schedule/delete/2026-02-24/${encodeURIComponent(scheduleId)}`
		);
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

	async createDestination(
		scheduleId: string,
		params: CreateScheduleDestinationParams
	): Promise<{ destination: ScheduleDestination }> {
		const url = buildUrl(
			this.#baseUrl,
			`/schedule/destinations/create/2026-02-24/${encodeURIComponent(scheduleId)}`
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

	async deleteDestination(destinationId: string): Promise<void> {
		const url = buildUrl(
			this.#baseUrl,
			`/schedule/destinations/delete/2026-02-24/${encodeURIComponent(destinationId)}`
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

		const basePath = `/schedule/deliveries/2026-02-24/${encodeURIComponent(scheduleId)}`;
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

	async getDestination(scheduleId: string, destinationId: string): Promise<ScheduleDestination> {
		const result = await this.get(scheduleId);
		const destination = result.destinations.find((d) => d.id === destinationId);
		if (!destination) {
			throw new Error(`Destination not found: ${destinationId}`);
		}
		return destination;
	}

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
