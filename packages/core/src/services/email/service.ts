import type { FetchAdapter } from '../adapter.ts';
import { buildUrl, toServiceException } from '../_util.ts';
import { safeStringify } from '../../json.ts';
import { z } from 'zod';

/**
 * An email address registered with the Agentuity email service.
 *
 * Email addresses are created under the `@agentuity.email` domain and can receive
 * inbound emails (forwarded to configured destinations) and send outbound emails.
 */
export const EmailAddressSchema = z.object({
	/**
	 * Unique identifier for the email address.
	 *
	 * @remarks Prefixed with `eaddr_`.
	 */
	id: z.string().describe('Unique identifier for the email address.'),

	/**
	 * The full email address (e.g., `support@agentuity.email`).
	 */
	email: z.string().describe('The full email address (e.g., `support@agentuity.email`).'),

	/**
	 * Provider-specific configuration (e.g., inbound routing config).
	 *
	 * @remarks Opaque to callers — the structure is managed by the platform.
	 */
	config: z
		.record(z.string(), z.unknown())
		.optional()
		.describe('Provider-specific configuration (e.g., inbound routing config).'),

	/**
	 * ID of the user who registered this address.
	 */
	created_by: z.string().optional().describe('ID of the user who registered this address.'),

	/**
	 * ISO 8601 timestamp when the address was created.
	 */
	created_at: z.string().describe('ISO 8601 timestamp when the address was created.'),

	/**
	 * ISO 8601 timestamp when the address was last updated.
	 */
	updated_at: z
		.string()
		.optional()
		.describe('ISO 8601 timestamp when the address was last updated.'),

	/**
	 * Total number of inbound emails received at this address.
	 */
	inbound_count: z
		.number()
		.optional()
		.describe('Total number of inbound emails received at this address.'),

	/**
	 * Total number of outbound emails sent from this address.
	 */
	outbound_count: z
		.number()
		.optional()
		.describe('Total number of outbound emails sent from this address.'),

	/**
	 * ISO 8601 timestamp of the most recent inbound or outbound email activity.
	 */
	last_activity: z
		.string()
		.optional()
		.describe('ISO 8601 timestamp of the most recent inbound or outbound email activity.'),
});

export type EmailAddress = z.infer<typeof EmailAddressSchema>;

/**
 * A destination configuration for an email address.
 *
 * When an inbound email is received at the parent address, the platform forwards
 * it to each configured destination via an HTTP request.
 */
export const EmailDestinationSchema = z.object({
	/**
	 * Unique identifier for the destination.
	 *
	 * @remarks Prefixed with `edst_`.
	 */
	id: z.string().describe('Unique identifier for the destination.'),

	/**
	 * The destination type. Currently only `'url'` is supported.
	 */
	type: z.string().describe("The destination type. Currently only `'url'` is supported."),

	/**
	 * Destination-specific configuration.
	 *
	 * @remarks
	 * For `'url'` type the shape is:
	 * ```typescript
	 * {
	 *   url: string;             // Must use http or https; must not point to private/loopback addresses
	 *   headers?: Record<string, string>;
	 *   method?: 'POST' | 'PUT' | 'PATCH';
	 * }
	 * ```
	 */
	config: z
		.record(z.string(), z.unknown())
		.optional()
		.describe('Destination-specific configuration.'),

	/**
	 * ISO 8601 timestamp when the destination was created.
	 */
	created_at: z.string().describe('ISO 8601 timestamp when the destination was created.'),

	/**
	 * ISO 8601 timestamp when the destination was last updated.
	 */
	updated_at: z
		.string()
		.optional()
		.describe('ISO 8601 timestamp when the destination was last updated.'),
});

export type EmailDestination = z.infer<typeof EmailDestinationSchema>;

/**
 * Connection settings for an email protocol (IMAP or POP3).
 *
 * Used to configure a mail client for accessing an Agentuity email address
 * via standard mail protocols.
 */
export const EmailProtocolConfigSchema = z.object({
	/**
	 * The mail server hostname.
	 */
	host: z.string().describe('The mail server hostname.'),

	/**
	 * The mail server port number.
	 */
	port: z.number().describe('The mail server port number.'),

	/**
	 * TLS mode (e.g., `'starttls'`, `'ssl'`, `'none'`).
	 */
	tls: z.string().describe("TLS mode (e.g., `'starttls'`, `'ssl'`, `'none'`)."),

	/**
	 * The authentication username (typically the address ID).
	 */
	username: z.string().describe('The authentication username (typically the address ID).'),

	/**
	 * The authentication password.
	 */
	password: z.string().describe('The authentication password.'),
});

export type EmailProtocolConfig = z.infer<typeof EmailProtocolConfigSchema>;

/**
 * Full connection configuration for accessing an email address via IMAP and POP3 protocols.
 *
 * Returned by {@link EmailService.getConnectionConfig} to allow external mail clients
 * to connect to an Agentuity email address.
 */
export const EmailConnectionConfigSchema = z.object({
	/**
	 * The full email address these settings are for.
	 */
	email: z.string().describe('The full email address these settings are for.'),

	/**
	 * IMAP protocol connection settings.
	 */
	imap: EmailProtocolConfigSchema.describe('IMAP protocol connection settings.'),

	/**
	 * POP3 protocol connection settings.
	 */
	pop3: EmailProtocolConfigSchema.describe('POP3 protocol connection settings.'),
});

export type EmailConnectionConfig = z.infer<typeof EmailConnectionConfigSchema>;

/**
 * An inbound email message received at an Agentuity email address.
 */
export const EmailInboundSchema = z.object({
	/**
	 * Unique identifier for the inbound email.
	 *
	 * @remarks Prefixed with `einb_`.
	 */
	id: z.string().describe('Unique identifier for the inbound email.'),

	/**
	 * The sender's email address.
	 */
	from: z.string().describe("The sender's email address."),

	/**
	 * The recipient email address (comma-separated if multiple).
	 */
	to: z.string().describe('The recipient email address (comma-separated if multiple).'),

	/**
	 * The email subject line.
	 */
	subject: z.string().optional().describe('The email subject line.'),

	/**
	 * Plain text body of the email.
	 */
	text: z.string().optional().describe('Plain text body of the email.'),

	/**
	 * HTML body of the email.
	 */
	html: z.string().optional().describe('HTML body of the email.'),

	/**
	 * ISO 8601 timestamp when the email was received.
	 */
	received_at: z.string().optional().describe('ISO 8601 timestamp when the email was received.'),

	/**
	 * Raw email headers as key-value pairs.
	 */
	headers: z
		.record(z.string(), z.unknown())
		.optional()
		.describe('Raw email headers as key-value pairs.'),

	/**
	 * Array of stored attachment metadata with S3 locations.
	 */
	attachments: z
		.array(z.lazy(() => EmailStoredAttachmentSchema))
		.optional()
		.describe('Array of stored attachment metadata with S3 locations.'),
});

export type EmailInbound = z.infer<typeof EmailInboundSchema>;

/**
 * An outbound email message sent from an Agentuity email address.
 */
export const EmailOutboundSchema = z.object({
	/**
	 * Unique identifier for the outbound email.
	 *
	 * @remarks Prefixed with `eout_`.
	 */
	id: z.string().describe('Unique identifier for the outbound email.'),

	/**
	 * The sender's email address (must be owned by the organization).
	 */
	from: z.string().describe("The sender's email address (must be owned by the organization)."),

	/**
	 * The recipient email addresses (comma-separated).
	 */
	to: z.string().describe('The recipient email addresses (comma-separated).'),

	/**
	 * The email subject line.
	 */
	subject: z.string().optional().describe('The email subject line.'),

	/**
	 * Plain text body of the email.
	 */
	text: z.string().optional().describe('Plain text body of the email.'),

	/**
	 * HTML body of the email.
	 */
	html: z.string().optional().describe('HTML body of the email.'),

	/**
	 * Delivery status: `'pending'`, `'success'`, or `'failed'`.
	 *
	 * @remarks Emails are sent asynchronously, so the initial status is always `'pending'`.
	 */
	status: z
		.string()
		.optional()
		.describe("Delivery status: `'pending'`, `'success'`, or `'failed'`."),

	/**
	 * Error message if the delivery failed.
	 */
	error: z.string().optional().describe('Error message if the delivery failed.'),

	/**
	 * ISO 8601 timestamp when the send was initiated.
	 */
	created_at: z.string().optional().describe('ISO 8601 timestamp when the send was initiated.'),

	/**
	 * Custom email headers that were included.
	 */
	headers: z
		.record(z.string(), z.unknown())
		.optional()
		.describe('Custom email headers that were included.'),

	/**
	 * Array of stored attachment metadata with S3 locations.
	 */
	attachments: z
		.array(z.lazy(() => EmailStoredAttachmentSchema))
		.optional()
		.describe('Array of stored attachment metadata with S3 locations.'),
});

export type EmailOutbound = z.infer<typeof EmailOutboundSchema>;

/**
 * An email attachment to include when sending an outbound email.
 */
export const EmailAttachmentSchema = z.object({
	/**
	 * The filename for the attachment
	 */
	filename: z.string().describe('The filename for the attachment'),

	/**
	 * The base64-encoded content of the attachment
	 */
	content: z.string().describe('The base64-encoded content of the attachment'),

	/**
	 * The MIME content type of the attachment
	 */
	contentType: z.string().optional().describe('The MIME content type of the attachment'),
});

export type EmailAttachment = z.infer<typeof EmailAttachmentSchema>;

/**
 * A stored email attachment with S3 location metadata.
 * Returned by inbound/outbound email queries — different from EmailAttachment used for sending.
 */
export const EmailStoredAttachmentSchema = z.object({
	/** The original filename */
	filename: z.string().describe('The original filename'),
	/** The MIME content type */
	content_type: z.string().optional().describe('The MIME content type'),
	/** File size in bytes */
	size: z.number().describe('File size in bytes'),
	/** The S3 bucket name where the attachment is stored */
	bucket: z.string().describe('The S3 bucket name where the attachment is stored'),
	/** The S3 object key */
	key: z.string().describe('The S3 object key'),
	/** Optional pre-signed download URL */
	url: z.string().optional().describe('Optional pre-signed download URL'),
});

export type EmailStoredAttachment = z.infer<typeof EmailStoredAttachmentSchema>;

/**
 * Parameters for sending an email
 */
export const EmailSendParamsSchema = z.object({
	/**
	 * The sender email address (must be owned by the organization)
	 */
	from: z.string().describe('The sender email address (must be owned by the organization)'),

	/**
	 * The recipient email addresses
	 */
	to: z.array(z.string()).describe('The recipient email addresses'),

	/**
	 * The email subject
	 */
	subject: z.string().describe('The email subject'),

	/**
	 * Plain text email body
	 */
	text: z.string().optional().describe('Plain text email body'),

	/**
	 * HTML email body
	 */
	html: z.string().optional().describe('HTML email body'),

	/**
	 * File attachments
	 */
	attachments: z.array(EmailAttachmentSchema).optional().describe('File attachments'),

	/**
	 * Custom email headers (e.g., In-Reply-To, References for threading)
	 */
	headers: z
		.record(z.string(), z.string())
		.optional()
		.describe('Custom email headers (e.g., In-Reply-To, References for threading)'),
});

export type EmailSendParams = z.infer<typeof EmailSendParamsSchema>;

/**
 * Parameters for querying email activity time-series data.
 */
export const EmailActivityParamsSchema = z.object({
	/**
	 * Number of days of activity to retrieve.
	 *
	 * @remarks Values below 7 are clamped to 7; values above 365 are clamped to 365.
	 *
	 * @default 7
	 */
	days: z.number().min(7).max(365).default(7).describe('Number of days of activity to retrieve.'), // min 7, max 365, default 7
});

export type EmailActivityParams = z.infer<typeof EmailActivityParamsSchema>;

/**
 * A single data point in the email activity time-series.
 */
export const EmailActivityDataPointSchema = z.object({
	/**
	 * The date in `YYYY-MM-DD` format.
	 */
	date: z.string().describe('The date in `YYYY-MM-DD` format.'), // "2026-02-28"

	/**
	 * Number of inbound emails received on this date.
	 */
	inbound: z.number().describe('Number of inbound emails received on this date.'),

	/**
	 * Number of outbound emails sent on this date.
	 */
	outbound: z.number().describe('Number of outbound emails sent on this date.'),
});

export type EmailActivityDataPoint = z.infer<typeof EmailActivityDataPointSchema>;

/**
 * Result of an email activity query containing daily time-series data.
 */
export const EmailActivityResultSchema = z.object({
	/**
	 * Array of daily activity data points, ordered chronologically.
	 */
	activity: z
		.array(EmailActivityDataPointSchema)
		.describe('Array of daily activity data points, ordered chronologically.'),

	/**
	 * The number of days of data returned.
	 */
	days: z.number().describe('The number of days of data returned.'),
});

export type EmailActivityResult = z.infer<typeof EmailActivityResultSchema>;

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
	 * Get email connection settings (IMAP/POP3) for an address
	 *
	 * @param id - the email address ID
	 * @returns the connection configuration or null if not found
	 */
	getConnectionConfig(id: string): Promise<EmailConnectionConfig | null>;

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
	 * Delete an inbound email by ID
	 *
	 * @param id - the inbound email ID
	 *
	 * @example
	 * ```typescript
	 * await email.deleteInbound('inb_abc123');
	 * ```
	 */
	deleteInbound(id: string): Promise<void>;

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

	/**
	 * Delete an outbound email by ID
	 *
	 * @param id - the outbound email ID
	 *
	 * @example
	 * ```typescript
	 * await email.deleteOutbound('out_abc123');
	 * ```
	 */
	deleteOutbound(id: string): Promise<void>;

	/**
	 * Get email activity time-series data
	 *
	 * @param params - optional parameters (days defaults to 7)
	 * @returns activity data points and the number of days queried
	 *
	 * @example
	 * ```typescript
	 * const activity = await email.getActivity({ days: 30 });
	 * for (const point of activity.activity) {
	 *   console.log(`${point.date}: ${point.inbound} in, ${point.outbound} out`);
	 * }
	 * ```
	 */
	getActivity(params?: EmailActivityParams): Promise<EmailActivityResult>;
}

/**
 * Unwrap a Catalyst API response payload.
 *
 * The Catalyst API may return data in one of two envelope formats:
 * - `{ key: data }` — the key maps directly to the data
 * - `{ data: { key: data } }` — the data is nested inside a `data` wrapper
 *
 * This helper normalises both shapes so callers always receive the inner value.
 *
 * @param payload - The raw JSON-parsed response body from the API
 * @param key - The property name to extract from the payload (e.g., `'address'`, `'destinations'`)
 * @returns The extracted value cast to type `T`
 *
 * @remarks
 * If neither envelope format matches, the raw payload is returned as-is.
 * This function does not throw — it always returns a value.
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

/**
 * Client for the Agentuity Email service.
 *
 * Provides methods for managing email addresses, configuring inbound email
 * destinations, sending outbound emails, and querying email history.
 *
 * Email addresses are created under the `@agentuity.email` domain. Inbound emails
 * can be forwarded to URL destinations. Outbound emails are sent asynchronously
 * and support attachments up to 25 MB total.
 *
 * All methods are instrumented with OpenTelemetry spans for observability.
 *
 * @example
 * ```typescript
 * const email = new EmailStorageService(baseUrl, adapter);
 *
 * // Create an address
 * const addr = await email.createAddress('notifications');
 *
 * // Send an email
 * await email.send({
 *   from: addr.email,
 *   to: ['user@example.com'],
 *   subject: 'Hello',
 *   text: 'Hello from Agentuity!',
 * });
 * ```
 */
export class EmailStorageService implements EmailService {
	#adapter: FetchAdapter;
	#baseUrl: string;

	/**
	 * Create a new EmailStorageService instance.
	 *
	 * @param baseUrl - The base URL for the Agentuity Email API (e.g., `https://api.agentuity.com`)
	 * @param adapter - The HTTP fetch adapter used for making API requests
	 */
	constructor(baseUrl: string, adapter: FetchAdapter) {
		this.#adapter = adapter;
		this.#baseUrl = baseUrl;
	}

	/**
	 * Create a new email address under the `@agentuity.email` domain.
	 *
	 * @param localPart - The local part of the email address (the part before the `@`).
	 *   For example, passing `'support'` creates `support@agentuity.email`.
	 * @returns The newly created email address record
	 * @throws ServiceException on API errors (e.g., duplicate address, invalid local part)
	 *
	 * @example
	 * ```typescript
	 * const addr = await email.createAddress('support');
	 * console.log('Created:', addr.email); // support@agentuity.email
	 * ```
	 */
	async createAddress(localPart: string): Promise<EmailAddress> {
		const url = buildUrl(this.#baseUrl, '/email/addresses');
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

	/**
	 * List all email addresses owned by the current organization.
	 *
	 * @returns An array of email address records. Returns an empty array if none exist.
	 * @throws ServiceException on API errors
	 *
	 * @example
	 * ```typescript
	 * const addresses = await email.listAddresses();
	 * for (const addr of addresses) {
	 *   console.log(`${addr.email} — ${addr.inbound_count ?? 0} received`);
	 * }
	 * ```
	 */
	async listAddresses(): Promise<EmailAddress[]> {
		const url = buildUrl(this.#baseUrl, '/email/addresses');
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

	/**
	 * Get an email address by its ID.
	 *
	 * @param id - The email address ID (prefixed with `eaddr_`)
	 * @returns The email address record, or `null` if no address with the given ID exists
	 * @throws ServiceException on API errors (other than 404)
	 *
	 * @example
	 * ```typescript
	 * const addr = await email.getAddress('eaddr_abc123');
	 * if (addr) {
	 *   console.log('Found:', addr.email);
	 * }
	 * ```
	 */
	async getAddress(id: string): Promise<EmailAddress | null> {
		const url = buildUrl(this.#baseUrl, `/email/addresses/${encodeURIComponent(id)}`);
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

	/**
	 * Get IMAP and POP3 connection settings for an email address.
	 *
	 * These settings can be used to configure an external mail client (e.g., Thunderbird, Outlook)
	 * to access the mailbox associated with the given address.
	 *
	 * @param id - The email address ID (prefixed with `eaddr_`)
	 * @returns The connection configuration with IMAP and POP3 settings, or `null` if the address is not found
	 * @throws ServiceException on API errors (other than 404)
	 *
	 * @example
	 * ```typescript
	 * const config = await email.getConnectionConfig('eaddr_abc123');
	 * if (config) {
	 *   console.log('IMAP host:', config.imap.host);
	 *   console.log('POP3 host:', config.pop3.host);
	 * }
	 * ```
	 */
	async getConnectionConfig(id: string): Promise<EmailConnectionConfig | null> {
		const url = buildUrl(this.#baseUrl, `/email/addresses/${encodeURIComponent(id)}/connection`);
		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke<unknown>(url, {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.email.getConnectionConfig',
				attributes: {
					id,
				},
			},
		});
		if (res.response.status === 404) {
			return null;
		}
		if (res.ok) {
			return unwrap<EmailConnectionConfig>(res.data, 'connection');
		}
		throw await toServiceException('GET', url, res.response);
	}

	/**
	 * Delete an email address and all associated destinations.
	 *
	 * @remarks This operation is idempotent — deleting a non-existent address does not throw.
	 *
	 * @param id - The email address ID (prefixed with `eaddr_`)
	 * @throws ServiceException on API errors (other than 404)
	 *
	 * @example
	 * ```typescript
	 * await email.deleteAddress('eaddr_abc123');
	 * ```
	 */
	async deleteAddress(id: string): Promise<void> {
		const url = buildUrl(this.#baseUrl, `/email/addresses/${encodeURIComponent(id)}`);
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

	/**
	 * Create a new destination for an email address.
	 *
	 * Destinations determine where inbound emails are forwarded when they arrive
	 * at the parent address.
	 *
	 * @param addressId - The email address ID (prefixed with `eaddr_`)
	 * @param type - The destination type (currently only `'url'` is supported)
	 * @param config - Type-specific destination configuration. For `'url'`:
	 *   `{ url: string, headers?: Record<string, string>, method?: 'POST' | 'PUT' | 'PATCH' }`
	 * @returns The newly created destination record
	 * @throws ServiceException on API errors (e.g., invalid URL, address not found)
	 *
	 * @example
	 * ```typescript
	 * const dest = await email.createDestination('eaddr_abc123', 'url', {
	 *   url: 'https://example.com/webhook',
	 *   headers: { 'X-Secret': 'my-token' },
	 * });
	 * console.log('Destination created:', dest.id);
	 * ```
	 */
	async createDestination(
		addressId: string,
		type: string,
		config: Record<string, unknown>
	): Promise<EmailDestination> {
		const url = buildUrl(
			this.#baseUrl,
			`/email/addresses/${encodeURIComponent(addressId)}/destinations`
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

	/**
	 * List all destinations configured for an email address.
	 *
	 * @param addressId - The email address ID (prefixed with `eaddr_`)
	 * @returns An array of destination records. Returns an empty array if none exist.
	 * @throws ServiceException on API errors
	 *
	 * @example
	 * ```typescript
	 * const destinations = await email.listDestinations('eaddr_abc123');
	 * for (const dest of destinations) {
	 *   console.log(`${dest.type}: ${dest.id}`);
	 * }
	 * ```
	 */
	async listDestinations(addressId: string): Promise<EmailDestination[]> {
		const url = buildUrl(
			this.#baseUrl,
			`/email/addresses/${encodeURIComponent(addressId)}/destinations`
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

	/**
	 * Delete a destination from an email address.
	 *
	 * @remarks This operation is idempotent — deleting a non-existent destination does not throw.
	 *
	 * @param addressId - The email address ID (prefixed with `eaddr_`)
	 * @param destinationId - The destination ID (prefixed with `edst_`)
	 * @throws ServiceException on API errors (other than 404)
	 *
	 * @example
	 * ```typescript
	 * await email.deleteDestination('eaddr_abc123', 'edst_xyz789');
	 * ```
	 */
	async deleteDestination(addressId: string, destinationId: string): Promise<void> {
		const url = buildUrl(
			this.#baseUrl,
			`/email/addresses/${encodeURIComponent(addressId)}/destinations/${encodeURIComponent(destinationId)}`
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

	/**
	 * Send an outbound email from an Agentuity email address.
	 *
	 * Emails are sent asynchronously — this method returns immediately with an outbound
	 * record whose status is `'pending'`. Use {@link getOutbound} to poll for delivery status.
	 *
	 * @remarks
	 * - The `from` address must be owned by the current organization.
	 * - Maximum 50 recipients per send.
	 * - Maximum 25 MB for the full RFC 822 body (including attachments).
	 *
	 * @param params - The email send parameters including from, to, subject, and body
	 * @returns The outbound email record with initial status `'pending'`
	 * @throws ServiceException on API errors (e.g., invalid sender, too many recipients)
	 *
	 * @example
	 * ```typescript
	 * const result = await email.send({
	 *   from: 'notifications@agentuity.email',
	 *   to: ['user@example.com'],
	 *   subject: 'Welcome!',
	 *   text: 'Welcome to our platform.',
	 *   html: '<h1>Welcome!</h1>',
	 *   attachments: [{
	 *     filename: 'guide.pdf',
	 *     content: base64EncodedPdf,
	 *     contentType: 'application/pdf',
	 *   }],
	 * });
	 * console.log('Email queued:', result.id);
	 * ```
	 */
	async send(params: EmailSendParams): Promise<EmailOutbound> {
		const url = buildUrl(this.#baseUrl, '/email/outbound/send');
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
		if (params.headers && Object.keys(params.headers).length > 0) {
			body.headers = params.headers;
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

	/**
	 * List inbound emails, optionally filtered by email address.
	 *
	 * @param addressId - Optional email address ID (prefixed with `eaddr_`) to filter results.
	 *   When omitted, returns inbound emails across all addresses in the organization.
	 * @returns An array of inbound email records. Returns an empty array if none exist.
	 * @throws ServiceException on API errors
	 *
	 * @example
	 * ```typescript
	 * // List all inbound emails
	 * const all = await email.listInbound();
	 *
	 * // List inbound for a specific address
	 * const filtered = await email.listInbound('eaddr_abc123');
	 * for (const msg of filtered) {
	 *   console.log(`From: ${msg.from}, Subject: ${msg.subject}`);
	 * }
	 * ```
	 */
	async listInbound(addressId?: string): Promise<EmailInbound[]> {
		const queryParams = new URLSearchParams();
		if (addressId) {
			queryParams.set('address_id', addressId);
		}
		const queryString = queryParams.toString();
		const url = buildUrl(this.#baseUrl, `/email/inbound${queryString ? `?${queryString}` : ''}`);
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

	/**
	 * Get an inbound email by its ID.
	 *
	 * @param id - The inbound email ID (prefixed with `einb_`)
	 * @returns The inbound email record, or `null` if not found
	 * @throws ServiceException on API errors (other than 404)
	 *
	 * @example
	 * ```typescript
	 * const msg = await email.getInbound('einb_abc123');
	 * if (msg) {
	 *   console.log('Subject:', msg.subject);
	 *   console.log('Attachments:', msg.attachments?.length ?? 0);
	 * }
	 * ```
	 */
	async getInbound(id: string): Promise<EmailInbound | null> {
		const url = buildUrl(this.#baseUrl, `/email/inbound/${encodeURIComponent(id)}`);
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

	/**
	 * Delete an inbound email by its ID.
	 *
	 * @remarks This operation is idempotent — deleting a non-existent email does not throw.
	 *
	 * @param id - The inbound email ID (prefixed with `einb_`)
	 * @throws ServiceException on API errors (other than 404)
	 *
	 * @example
	 * ```typescript
	 * await email.deleteInbound('einb_abc123');
	 * ```
	 */
	async deleteInbound(id: string): Promise<void> {
		const url = buildUrl(this.#baseUrl, `/email/inbound/${encodeURIComponent(id)}`);
		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke<unknown>(url, {
			method: 'DELETE',
			signal,
			telemetry: {
				name: 'agentuity.email.deleteInbound',
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

	/**
	 * List outbound emails, optionally filtered by email address.
	 *
	 * @param addressId - Optional email address ID (prefixed with `eaddr_`) to filter results.
	 *   When omitted, returns outbound emails across all addresses in the organization.
	 * @returns An array of outbound email records. Returns an empty array if none exist.
	 * @throws ServiceException on API errors
	 *
	 * @example
	 * ```typescript
	 * // List all outbound emails
	 * const all = await email.listOutbound();
	 *
	 * // List outbound for a specific address
	 * const filtered = await email.listOutbound('eaddr_abc123');
	 * for (const msg of filtered) {
	 *   console.log(`To: ${msg.to}, Status: ${msg.status}`);
	 * }
	 * ```
	 */
	async listOutbound(addressId?: string): Promise<EmailOutbound[]> {
		const queryParams = new URLSearchParams();
		if (addressId) {
			queryParams.set('address_id', addressId);
		}
		const queryString = queryParams.toString();
		const url = buildUrl(this.#baseUrl, `/email/outbound${queryString ? `?${queryString}` : ''}`);
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

	/**
	 * Get an outbound email by its ID.
	 *
	 * @param id - The outbound email ID (prefixed with `eout_`)
	 * @returns The outbound email record, or `null` if not found
	 * @throws ServiceException on API errors (other than 404)
	 *
	 * @example
	 * ```typescript
	 * const msg = await email.getOutbound('eout_abc123');
	 * if (msg) {
	 *   console.log('Status:', msg.status);
	 *   if (msg.error) {
	 *     console.error('Delivery failed:', msg.error);
	 *   }
	 * }
	 * ```
	 */
	async getOutbound(id: string): Promise<EmailOutbound | null> {
		const url = buildUrl(this.#baseUrl, `/email/outbound/${encodeURIComponent(id)}`);
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

	/**
	 * Delete an outbound email by its ID.
	 *
	 * @remarks This operation is idempotent — deleting a non-existent email does not throw.
	 *
	 * @param id - The outbound email ID (prefixed with `eout_`)
	 * @throws ServiceException on API errors (other than 404)
	 *
	 * @example
	 * ```typescript
	 * await email.deleteOutbound('eout_abc123');
	 * ```
	 */
	async deleteOutbound(id: string): Promise<void> {
		const url = buildUrl(this.#baseUrl, `/email/outbound/${encodeURIComponent(id)}`);
		const signal = AbortSignal.timeout(30_000);
		const res = await this.#adapter.invoke<unknown>(url, {
			method: 'DELETE',
			signal,
			telemetry: {
				name: 'agentuity.email.deleteOutbound',
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

	/**
	 * Get email activity time-series data showing inbound and outbound counts per day.
	 *
	 * @param params - Optional query parameters. `days` controls the lookback window
	 *   (minimum 7, maximum 365, server default 7).
	 * @returns An {@link EmailActivityResult} with daily data points ordered chronologically
	 *   and the total number of days returned
	 * @throws ServiceException on API errors
	 *
	 * @example
	 * ```typescript
	 * // Get last 30 days of activity
	 * const result = await email.getActivity({ days: 30 });
	 * console.log(`Activity over ${result.days} days:`);
	 * for (const point of result.activity) {
	 *   console.log(`  ${point.date}: ${point.inbound} in, ${point.outbound} out`);
	 * }
	 * ```
	 */
	async getActivity(params?: EmailActivityParams): Promise<EmailActivityResult> {
		const queryParams = new URLSearchParams();
		if (params?.days !== undefined) {
			const raw = Number(params.days);
			if (Number.isFinite(raw)) {
				const clamped = Math.max(7, Math.min(365, Math.trunc(raw)));
				queryParams.set('days', String(clamped));
			}
		}

		const queryString = queryParams.toString();
		const url = buildUrl(this.#baseUrl, `/email/activity${queryString ? `?${queryString}` : ''}`);
		const signal = AbortSignal.timeout(30_000);

		const days = queryParams.get('days');
		const res = await this.#adapter.invoke<EmailActivityResult>(url, {
			method: 'GET',
			signal,
			telemetry: {
				name: 'agentuity.email.activity',
				attributes: {
					...(days ? { days } : {}),
				},
			},
		});

		if (res.ok) {
			// Email endpoints return data directly (no success wrapper)
			return res.data as EmailActivityResult;
		}
		throw await toServiceException('GET', url, res.response);
	}
}
