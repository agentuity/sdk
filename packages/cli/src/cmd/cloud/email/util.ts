import { z } from 'zod';
import { type FetchAdapter, type FetchRequest, type HttpMethod, toServiceException } from '@agentuity/core';
import { createServerFetchAdapter } from '@agentuity/server';
import type { AuthData, Config, GlobalOptions, ProjectConfig, Logger } from '../../../types';
import { getCatalystUrl } from '../../../catalyst';
import * as tui from '../../../tui';

export interface EmailAddress {
	id: string;
	email: string;
	project_id?: string;
	provider?: string;
	config?: Record<string, unknown>;
	created_at: string;
	updated_at?: string;
}

export interface EmailDestination {
	id: string;
	type: string;
	config?: Record<string, unknown>;
	created_at: string;
	updated_at?: string;
}

export interface EmailInbound {
	id: string;
	from: string;
	to: string;
	subject?: string;
	text?: string;
	status?: string;
	received_at?: string;
}

export interface EmailOutbound {
	id: string;
	from: string;
	to: string;
	subject?: string;
	text?: string;
	html?: string;
	status?: string;
	error?: string;
	sent_at?: string;
	created_at?: string;
	updated_at?: string;
}

export interface EmailAttachment {
	filename: string;
	content_type?: string;
	content_base64: string;
}

interface EmailContext {
	logger: Logger;
	auth: AuthData;
	region?: string;
	project?: ProjectConfig;
	config: Config | null;
	options: GlobalOptions;
}

export function resolveEmailOrgId(ctx: EmailContext, explicitOrgId?: string): string {
	const orgId =
		explicitOrgId ??
		ctx.project?.orgId ??
		ctx.options.orgId ??
		(process.env.AGENTUITY_CLOUD_ORG_ID || ctx.config?.preferences?.orgId);

	if (!orgId) {
		tui.fatal(
			'Organization ID is required. Either run from a project directory or use --org-id flag.'
		);
	}

	return orgId;
}

export function resolveEmailRegion(ctx: EmailContext): string {
	if (ctx.region) {
		return ctx.region;
	}
	if (process.env.AGENTUITY_REGION) {
		return process.env.AGENTUITY_REGION;
	}
	if (ctx.config?.name === 'local') {
		return 'local';
	}
	if (ctx.config?.preferences?.region) {
		return ctx.config.preferences.region;
	}
	return 'usc';
}

class EmailStorageService {
	#baseUrl: string;
	#adapter: FetchAdapter;

	constructor(baseUrl: string, adapter: FetchAdapter) {
		this.#baseUrl = baseUrl;
		this.#adapter = adapter;
	}

	#build(path: string, query?: Record<string, string | undefined>) {
		const cleanBase = this.#baseUrl.replace(/\/$/, '');
		const cleanPath = path.startsWith('/') ? path : `/${path}`;
		const url = new URL(`${cleanBase}${cleanPath}`);
		if (query) {
			for (const [key, value] of Object.entries(query)) {
				if (value !== undefined && value !== '') {
					url.searchParams.set(key, value);
				}
			}
		}
		return url.toString();
	}

	#unwrap<T>(payload: unknown, key?: string): T {
		if (key && typeof payload === 'object' && payload !== null && key in payload) {
			return (payload as Record<string, unknown>)[key] as T;
		}
		if (
			typeof payload === 'object' &&
			payload !== null &&
			'data' in payload &&
			typeof (payload as Record<string, unknown>).data !== 'undefined'
		) {
			const data = (payload as Record<string, unknown>).data;
			if (key && typeof data === 'object' && data !== null && key in data) {
				return (data as Record<string, unknown>)[key] as T;
			}
			return data as T;
		}
		return payload as T;
	}

	async #request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
		const url = this.#build(path);
		const signal = AbortSignal.timeout(30_000);
		const request: FetchRequest = {
			method,
			headers: { Accept: 'application/json' },
			signal,
		};

		if (body !== undefined) {
			request.body = JSON.stringify(body);
			request.contentType = 'application/json';
		}

		const response = await this.#adapter.invoke<T>(url, request);
		if (!response.ok) {
			throw await toServiceException(method, url, response.response);
		}

		return response.data;
	}

	async createAddress(localPart: string): Promise<EmailAddress> {
		const payload = await this.#request<unknown>('POST', '/email/2025-03-17/addresses', {
			local_part: localPart,
		});
		return this.#unwrap<EmailAddress>(payload, 'address');
	}

	async listAddresses(): Promise<EmailAddress[]> {
		const payload = await this.#request<unknown>('GET', '/email/2025-03-17/addresses');
		const items = this.#unwrap<unknown>(payload, 'addresses');
		return Array.isArray(items) ? (items as EmailAddress[]) : [];
	}

	async getAddress(addressId: string): Promise<EmailAddress> {
		const payload = await this.#request<unknown>(
			'GET',
			`/email/2025-03-17/addresses/${encodeURIComponent(addressId)}`
		);
		return this.#unwrap<EmailAddress>(payload, 'address');
	}

	async deleteAddress(addressId: string): Promise<void> {
		await this.#request<unknown>(
			'DELETE',
			`/email/2025-03-17/addresses/${encodeURIComponent(addressId)}`
		);
	}

	async createDestination(
		addressId: string,
		type: 'url' | 'agent',
		config: Record<string, unknown>
	): Promise<EmailDestination> {
		const payload = await this.#request<unknown>(
			'POST',
			`/email/2025-03-17/addresses/${encodeURIComponent(addressId)}/destinations`,
			{ type, config }
		);
		return this.#unwrap<EmailDestination>(payload, 'destination');
	}

	async listDestinations(addressId: string): Promise<EmailDestination[]> {
		const payload = await this.#request<unknown>(
			'GET',
			`/email/2025-03-17/addresses/${encodeURIComponent(addressId)}/destinations`
		);
		const items = this.#unwrap<unknown>(payload, 'destinations');
		return Array.isArray(items) ? (items as EmailDestination[]) : [];
	}

	async deleteDestination(addressId: string, destinationId: string): Promise<void> {
		await this.#request<unknown>(
			'DELETE',
			`/email/2025-03-17/addresses/${encodeURIComponent(addressId)}/destinations/${encodeURIComponent(destinationId)}`
		);
	}

	async send(params: {
		to: string;
		from: string;
		subject: string;
		text?: string;
		html?: string;
		attachments?: EmailAttachment[];
	}): Promise<{ status: number; outbound: EmailOutbound }> {
		const url = this.#build('/email/2025-03-17/outbound/send');
		const response = await this.#adapter.invoke<unknown>(url, {
			method: 'POST',
			contentType: 'application/json',
			body: JSON.stringify(params),
			headers: { Accept: 'application/json' },
		});

		if (!response.ok) {
			throw await toServiceException('POST', url, response.response);
		}

		return {
			status: response.response.status,
			outbound: this.#unwrap<EmailOutbound>(response.data, 'outbound'),
		};
	}

	async listInbound(addressId?: string): Promise<EmailInbound[]> {
		const url = this.#build('/email/2025-03-17/inbound', {
			address_id: addressId,
		});
		const response = await this.#adapter.invoke<unknown>(url, {
			method: 'GET',
			headers: { Accept: 'application/json' },
		});

		if (!response.ok) {
			throw await toServiceException('GET', url, response.response);
		}

		const items = this.#unwrap<unknown>(response.data, 'inbound');
		return Array.isArray(items) ? (items as EmailInbound[]) : [];
	}

	async getInbound(id: string): Promise<EmailInbound> {
		const payload = await this.#request<unknown>(
			'GET',
			`/email/2025-03-17/inbound/${encodeURIComponent(id)}`
		);
		return this.#unwrap<EmailInbound>(payload, 'inbound');
	}

	async listOutbound(addressId?: string): Promise<EmailOutbound[]> {
		const url = this.#build('/email/2025-03-17/outbound', {
			address_id: addressId,
		});
		const response = await this.#adapter.invoke<unknown>(url, {
			method: 'GET',
			headers: { Accept: 'application/json' },
		});

		if (!response.ok) {
			throw await toServiceException('GET', url, response.response);
		}

		const items = this.#unwrap<unknown>(response.data, 'outbound');
		return Array.isArray(items) ? (items as EmailOutbound[]) : [];
	}

	async getOutbound(id: string): Promise<EmailOutbound> {
		const payload = await this.#request<unknown>(
			'GET',
			`/email/2025-03-17/outbound/${encodeURIComponent(id)}`
		);
		return this.#unwrap<EmailOutbound>(payload, 'outbound');
	}
}

export const EmailAddressSchema = z.object({
	id: z.string(),
	email: z.string(),
	project_id: z.string().optional(),
	provider: z.string().optional(),
	config: z.record(z.string(), z.unknown()).optional(),
	created_at: z.string(),
	updated_at: z.string().optional(),
});

export function truncate(value: string | undefined, length = 200): string {
	if (!value) {
		return '-';
	}
	return value.length > length ? `${value.slice(0, length - 3)}...` : value;
}

export function createEmailAdapter(ctx: EmailContext, explicitOrgId?: string) {
	const orgId = resolveEmailOrgId(ctx, explicitOrgId);
	const adapter = createServerFetchAdapter(
		{
			headers: {
				Authorization: `Bearer ${ctx.auth.apiKey}`,
				'x-agentuity-orgid': orgId,
			},
		},
		ctx.logger
	);

	const baseUrl = getCatalystUrl(resolveEmailRegion(ctx));
	return new EmailStorageService(baseUrl, adapter);
}
