import { FetchAdapter } from './adapter.ts';
import { buildUrl, toServiceException } from './_util.ts';
import { safeStringify } from '../json.ts';

/**
 * An email address registered with the Agentuity email service
 */
export interface EmailAddress {
	id: string;
	email: string;
	project_id?: string;
	provider?: string;
	config?: Record<string, unknown>;
	created_by?: string;
	created_at: string;
	updated_at?: string;
}

/**
 * A destination configuration for an email address
 */
export interface EmailDestination {
	id: string;
	type: string;
	config?: Record<string, unknown>;
	created_at: string;
	updated_at?: string;
}

/**
 * An inbound email message
 */
export interface EmailInbound {
	id: string;
	from: string;
	to: string;
	subject?: string;
	text?: string;
	html?: string;
	received_at?: string;
	headers?: Record<string, unknown>;
	attachments?: unknown[];
}

/**
 * An outbound email message
 */
export interface EmailOutbound {
	id: string;
	from: string;
	to: string;
	subject?: string;
	text?: string;
	html?: string;
	status?: string;
	error?: string;
	created_at?: string;
	headers?: Record<string, unknown>;
	attachments?: unknown[];
}

/**
 * An email attachment
 */
export interface EmailAttachment {
	/**
	 * The filename for the attachment
	 */
	filename: string;

	/**
	 * The base64-encoded content of the attachment
	 */
	content: string;

	/**
	 * The MIME content type of the attachment
	 */
	contentType?: string;
}

/**
 * Parameters for sending an email
 */
export interface EmailSendParams {
	/**
	 * The sender email address (must be owned by the organization)
	 */
	from: string;

	/**
	 * The recipient email addresses
	 */
	to: string[];

	/**
	 * The email subject
	 */
	subject: string;

	/**
	 * Plain text email body
	 */
	text?: string;

	/**
	 * HTML email body
	 */
	html?: string;

	/**
	 * File attachments
	 */
	attachments?: EmailAttachment[];
}

/**
 * Email service for managing email addresses, destinations, and sending/receiving emails
 */
export interface EmailService {
	/**
	 * Create a new email address
	 *
	 * @param localPart - the local part of the email address (before the @)
	 * @returns the created email address
	 *
	 * @example
	 * ```typescript
	 * const address = await email.createAddress('support');
	 * console.log('Created:', address.email);
	 * ```
	 */
	createAddress(localPart: string): Promise<EmailAddress>;

	/**
	 * List all email addresses
	 *
	 * @returns array of email addresses
	 *
	 * @example
	 * ```typescript
	 * const addresses = await email.listAddresses();
	 * for (const addr of addresses) {
	 *   console.log(addr.email);
	 * }
	 * ```
	 */
	listAddresses(): Promise<EmailAddress[]>;

	/**
	 * Get an email address by ID
	 *
	 * @param id - the email address ID
	 * @returns the email address or null if not found
	 *
	 * @example
	 * ```typescript
	 * const address = await email.getAddress('addr_123');
	 * if (address) {
	 *   console.log('Found:', address.email);
	 * }
	 * ```
	 */
	getAddress(id: string): Promise<EmailAddress | null>;

	/**
	 * Delete an email address
	 *
	 * @param id - the email address ID
	 *
	 * @example
	 * ```typescript
	 * await email.deleteAddress('addr_123');
	 * ```
	 */
	deleteAddress(id: string): Promise<void>;

	/**
	 * Create a destination for an email address
	 *
	 * @param addressId - the email address ID
	 * @param type - the destination type (e.g., 'url', 'agent')
	 * @param config - the destination configuration
	 * @returns the created destination
	 *
	 * @example
	 * ```typescript
	 * const dest = await email.createDestination('addr_123', 'url', {
	 *   url: 'https://example.com/webhook',
	 * });
	 * console.log('Created destination:', dest.id);
	 * ```
	 */
	createDestination(
		addressId: string,
		type: string,
		config: Record<string, unknown>
	): Promise<EmailDestination>;

	/**
	 * List destinations for an email address
	 *
	 * @param addressId - the email address ID
	 * @returns array of destinations
	 *
	 * @example
	 * ```typescript
	 * const destinations = await email.listDestinations('addr_123');
	 * for (const dest of destinations) {
	 *   console.log(`${dest.type}: ${dest.id}`);
	 * }
	 * ```
	 */
	listDestinations(addressId: string): Promise<EmailDestination[]>;

	/**
	 * Delete a destination from an email address
	 *
	 * @param addressId - the email address ID
	 * @param destinationId - the destination ID
	 *
	 * @example
	 * ```typescript
	 * await email.deleteDestination('addr_123', 'dest_456');
	 * ```
	 */
	deleteDestination(addressId: string, destinationId: string): Promise<void>;

	/**
	 * Send an email
	 *
	 * @param params - the send parameters
	 * @returns the outbound email record
	 *
	 * @example
	 * ```typescript
	 * const result = await email.send({
	 *   from: 'support@myapp.agentuity.email',
	 *   to: ['user@example.com'],
	 *   subject: 'Welcome!',
	 *   text: 'Welcome to our platform.',
	 *   html: '<h1>Welcome!</h1><p>Welcome to our platform.</p>',
	 * });
	 * console.log('Sent:', result.id, 'Status:', result.status);
	 * ```
	 */
	send(params: EmailSendParams): Promise<EmailOutbound>;

	/**
	 * List inbound emails
	 *
	 * @param addressId - optional email address ID to filter by
	 * @returns array of inbound emails
	 *
	 * @example
	 * ```typescript
	 * const inbound = await email.listInbound('addr_123');
	 * for (const msg of inbound) {
	 *   console.log(`From: ${msg.from}, Subject: ${msg.subject}`);
	 * }
	 * ```
	 */
	listInbound(addressId?: string): Promise<EmailInbound[]>;

	/**
	 * Get an inbound email by ID
	 *
	 * @param id - the inbound email ID
	 * @returns the inbound email or null if not found
	 *
	 * @example
	 * ```typescript
	 * const msg = await email.getInbound('inb_123');
	 * if (msg) {
	 *   console.log('Subject:', msg.subject);
	 * }
	 * ```
	 */
	getInbound(id: string): Promise<EmailInbound | null>;

	/**
	 * List outbound emails
	 *
	 * @param addressId - optional email address ID to filter by
	 * @returns array of outbound emails
	 *
	 * @example
	 * ```typescript
	 * const outbound = await email.listOutbound('addr_123');
	 * for (const msg of outbound) {
	 *   console.log(`To: ${msg.to}, Status: ${msg.status}`);
	 * }
	 * ```
	 */
	listOutbound(addressId?: string): Promise<EmailOutbound[]>;

	/**
	 * Get an outbound email by ID
	 *
	 * @param id - the outbound email ID
	 * @returns the outbound email or null if not found
	 *
	 * @example
	 * ```typescript
	 * const msg = await email.getOutbound('out_123');
	 * if (msg) {
	 *   console.log('Status:', msg.status);
	 * }
	 * ```
	 */
	getOutbound(id: string): Promise<EmailOutbound | null>;
}

/**
 * Unwrap a Catalyst API response payload.
 * Handles both `{ key: data }` and `{ data: { key: data } }` response formats.
 */
function unwrap<T>(payload: unknown, key: string): T {
	if (typeof payload === 'object' && payload !== null) {
		const obj = payload as Record<string, unknown>;
		if (key in obj) {
			return obj[key] as T;
		}
		if ('data' in obj && typeof obj.data === 'object' && obj.data !== null) {
			const data = obj.data as Record<string, unknown>;
			if (key in data) {
				return data[key] as T;
			}
			return data as T;
		}
	}
	return payload as T;
}

export class EmailStorageService implements EmailService {
	#adapter: FetchAdapter;
	#baseUrl: string;

	constructor(baseUrl: string, adapter: FetchAdapter) {
		this.#adapter = adapter;
		this.#baseUrl = baseUrl;
	}

	async createAddress(localPart: string): Promise<EmailAddress> {
		const url = buildUrl(this.#baseUrl, '/email/2025-03-17/addresses');
		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke<unknown>(url, {
			method: 'POST',
			body: safeStringify({ local_part: localPart }),
			contentType: 'application/json',
			signal,
			telemetry: {
				name: 'agentuity.email.createAddress',
				attributes: {
					localPart,
				},
			},
		});
		if (res.ok) {
			return unwrap<EmailAddress>(res.data, 'address');
		}
		throw await toServiceException('POST', url, res.response);
	}

	async listAddresses(): Promise<EmailAddress[]> {
		const url = buildUrl(this.#baseUrl, '/email/2025-03-17/addresses');
		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke<unknown>(url, {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.email.listAddresses',
				attributes: {},
			},
		});
		if (res.response.status === 404) {
			return [];
		}
		if (res.ok) {
			const items = unwrap<unknown>(res.data, 'addresses');
			return Array.isArray(items) ? (items as EmailAddress[]) : [];
		}
		throw await toServiceException('GET', url, res.response);
	}

	async getAddress(id: string): Promise<EmailAddress | null> {
		const url = buildUrl(
			this.#baseUrl,
			`/email/2025-03-17/addresses/${encodeURIComponent(id)}`
		);
		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke<unknown>(url, {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.email.getAddress',
				attributes: {
					id,
				},
			},
		});
		if (res.response.status === 404) {
			return null;
		}
		if (res.ok) {
			return unwrap<EmailAddress>(res.data, 'address');
		}
		throw await toServiceException('GET', url, res.response);
	}

	async deleteAddress(id: string): Promise<void> {
		const url = buildUrl(
			this.#baseUrl,
			`/email/2025-03-17/addresses/${encodeURIComponent(id)}`
		);
		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke<unknown>(url, {
			method: 'DELETE',
			signal,
			telemetry: {
				name: 'agentuity.email.deleteAddress',
				attributes: {
					id,
				},
			},
		});
		if (res.ok || res.response.status === 404) {
			return;
		}
		throw await toServiceException('DELETE', url, res.response);
	}

	async createDestination(
		addressId: string,
		type: string,
		config: Record<string, unknown>
	): Promise<EmailDestination> {
		const url = buildUrl(
			this.#baseUrl,
			`/email/2025-03-17/addresses/${encodeURIComponent(addressId)}/destinations`
		);
		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke<unknown>(url, {
			method: 'POST',
			body: safeStringify({ type, config }),
			contentType: 'application/json',
			signal,
			telemetry: {
				name: 'agentuity.email.createDestination',
				attributes: {
					addressId,
					type,
				},
			},
		});
		if (res.ok) {
			return unwrap<EmailDestination>(res.data, 'destination');
		}
		throw await toServiceException('POST', url, res.response);
	}

	async listDestinations(addressId: string): Promise<EmailDestination[]> {
		const url = buildUrl(
			this.#baseUrl,
			`/email/2025-03-17/addresses/${encodeURIComponent(addressId)}/destinations`
		);
		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke<unknown>(url, {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.email.listDestinations',
				attributes: {
					addressId,
				},
			},
		});
		if (res.response.status === 404) {
			return [];
		}
		if (res.ok) {
			const items = unwrap<unknown>(res.data, 'destinations');
			return Array.isArray(items) ? (items as EmailDestination[]) : [];
		}
		throw await toServiceException('GET', url, res.response);
	}

	async deleteDestination(addressId: string, destinationId: string): Promise<void> {
		const url = buildUrl(
			this.#baseUrl,
			`/email/2025-03-17/addresses/${encodeURIComponent(addressId)}/destinations/${encodeURIComponent(destinationId)}`
		);
		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke<unknown>(url, {
			method: 'DELETE',
			signal,
			telemetry: {
				name: 'agentuity.email.deleteDestination',
				attributes: {
					addressId,
					destinationId,
				},
			},
		});
		if (res.ok || res.response.status === 404) {
			return;
		}
		throw await toServiceException('DELETE', url, res.response);
	}

	async send(params: EmailSendParams): Promise<EmailOutbound> {
		const url = buildUrl(this.#baseUrl, '/email/2025-03-17/outbound/send');
		const signal = AbortSignal.timeout(30_000);

		// Transform attachments to API format (snake_case)
		const body: Record<string, unknown> = {
			from: params.from,
			to: params.to,
			subject: params.subject,
		};
		if (params.text !== undefined) {
			body.text = params.text;
		}
		if (params.html !== undefined) {
			body.html = params.html;
		}
		if (params.attachments && params.attachments.length > 0) {
			body.attachments = params.attachments.map((a) => ({
				filename: a.filename,
				content: a.content,
				...(a.contentType && { content_type: a.contentType }),
			}));
		}

		const res = await this.#adapter.invoke<unknown>(url, {
			method: 'POST',
			body: safeStringify(body),
			contentType: 'application/json',
			signal,
			telemetry: {
				name: 'agentuity.email.send',
				attributes: {
					from: params.from,
					toCount: String(params.to.length),
				},
			},
		});
		if (res.ok) {
			return unwrap<EmailOutbound>(res.data, 'outbound');
		}
		throw await toServiceException('POST', url, res.response);
	}

	async listInbound(addressId?: string): Promise<EmailInbound[]> {
		const queryParams = new URLSearchParams();
		if (addressId) {
			queryParams.set('address_id', addressId);
		}
		const queryString = queryParams.toString();
		const url = buildUrl(
			this.#baseUrl,
			`/email/2025-03-17/inbound${queryString ? `?${queryString}` : ''}`
		);
		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke<unknown>(url, {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.email.listInbound',
				attributes: {
					...(addressId && { addressId }),
				},
			},
		});
		if (res.response.status === 404) {
			return [];
		}
		if (res.ok) {
			const items = unwrap<unknown>(res.data, 'inbound');
			return Array.isArray(items) ? (items as EmailInbound[]) : [];
		}
		throw await toServiceException('GET', url, res.response);
	}

	async getInbound(id: string): Promise<EmailInbound | null> {
		const url = buildUrl(
			this.#baseUrl,
			`/email/2025-03-17/inbound/${encodeURIComponent(id)}`
		);
		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke<unknown>(url, {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.email.getInbound',
				attributes: {
					id,
				},
			},
		});
		if (res.response.status === 404) {
			return null;
		}
		if (res.ok) {
			return unwrap<EmailInbound>(res.data, 'inbound');
		}
		throw await toServiceException('GET', url, res.response);
	}

	async listOutbound(addressId?: string): Promise<EmailOutbound[]> {
		const queryParams = new URLSearchParams();
		if (addressId) {
			queryParams.set('address_id', addressId);
		}
		const queryString = queryParams.toString();
		const url = buildUrl(
			this.#baseUrl,
			`/email/2025-03-17/outbound${queryString ? `?${queryString}` : ''}`
		);
		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke<unknown>(url, {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.email.listOutbound',
				attributes: {
					...(addressId && { addressId }),
				},
			},
		});
		if (res.response.status === 404) {
			return [];
		}
		if (res.ok) {
			const items = unwrap<unknown>(res.data, 'outbound');
			return Array.isArray(items) ? (items as EmailOutbound[]) : [];
		}
		throw await toServiceException('GET', url, res.response);
	}

	async getOutbound(id: string): Promise<EmailOutbound | null> {
		const url = buildUrl(
			this.#baseUrl,
			`/email/2025-03-17/outbound/${encodeURIComponent(id)}`
		);
		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke<unknown>(url, {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.email.getOutbound',
				attributes: {
					id,
				},
			},
		});
		if (res.response.status === 404) {
			return null;
		}
		if (res.ok) {
			return unwrap<EmailOutbound>(res.data, 'outbound');
		}
		throw await toServiceException('GET', url, res.response);
	}
}
