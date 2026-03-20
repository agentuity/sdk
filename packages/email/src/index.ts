export {
	EmailStorageService,
	EmailService,
	type EmailAddress,
	type EmailDestination,
	type EmailConnectionConfig,
	type EmailInbound,
	type EmailOutbound,
	type EmailAttachment,
	type EmailStoredAttachment,
	type EmailSendParams,
	type EmailActivityParams,
	type EmailActivityResult,
	type EmailActivityDataPoint,
	EmailAddressSchema,
	EmailDestinationSchema,
	EmailConnectionConfigSchema,
	EmailInboundSchema,
	EmailOutboundSchema,
	EmailAttachmentSchema,
	EmailStoredAttachmentSchema,
	EmailSendParamsSchema,
	EmailActivityParamsSchema,
	EmailActivityResultSchema,
	EmailActivityDataPointSchema,
} from '@agentuity/core/email';

import {
	EmailStorageService,
	type EmailSendParams,
	type EmailOutbound,
	type EmailAddress,
	type EmailDestination,
	type EmailConnectionConfig,
	type EmailInbound,
	type EmailActivityResult,
	type EmailActivityParams,
} from '@agentuity/core/email';
import { createServerFetchAdapter, buildClientHeaders, type Logger } from '@agentuity/server';
import { createMinimalLogger } from '@agentuity/core';
import { getEnv } from '@agentuity/core';
import { getServiceUrls } from '@agentuity/core/config';
import { z } from 'zod';

const isLogger = (val: unknown): val is Logger =>
	typeof val === 'object' &&
	val !== null &&
	['info', 'warn', 'error', 'debug', 'trace'].every(
		(m) => typeof (val as Record<string, unknown>)[m] === 'function'
	);

export const EmailClientOptionsSchema = z.object({
	apiKey: z.string().optional().describe('API key for authentication'),
	url: z.string().optional().describe('Base URL for the Email API'),
	orgId: z.string().optional().describe('Organization ID for multi-tenant operations'),
	logger: z.custom<Logger>(isLogger).optional().describe('Custom logger instance'),
});
export type EmailClientOptions = z.infer<typeof EmailClientOptionsSchema>;

export class EmailClient {
	readonly #service: EmailStorageService;

	constructor(options: EmailClientOptions = {}) {
		const validatedOptions = EmailClientOptionsSchema.parse(options);
		const apiKey =
			validatedOptions.apiKey || getEnv('AGENTUITY_SDK_KEY') || getEnv('AGENTUITY_CLI_KEY');
		const region = getEnv('AGENTUITY_REGION') ?? 'usc';
		const serviceUrls = getServiceUrls(region);

		const url = validatedOptions.url || getEnv('AGENTUITY_EMAIL_URL') || serviceUrls.email;

		const logger = validatedOptions.logger ?? createMinimalLogger();

		const headers = buildClientHeaders({
			apiKey,
			orgId: validatedOptions.orgId,
		});

		const adapter = createServerFetchAdapter({ headers }, logger);
		this.#service = new EmailStorageService(url, adapter);
	}

	async createAddress(localPart: string): Promise<EmailAddress> {
		return this.#service.createAddress(localPart);
	}

	async listAddresses(): Promise<EmailAddress[]> {
		return this.#service.listAddresses();
	}

	async getAddress(id: string): Promise<EmailAddress | null> {
		return this.#service.getAddress(id);
	}

	async getConnectionConfig(id: string): Promise<EmailConnectionConfig | null> {
		return this.#service.getConnectionConfig(id);
	}

	async deleteAddress(id: string): Promise<void> {
		return this.#service.deleteAddress(id);
	}

	async createDestination(
		addressId: string,
		type: string,
		config: Record<string, unknown>
	): Promise<EmailDestination> {
		return this.#service.createDestination(addressId, type, config);
	}

	async listDestinations(addressId: string): Promise<EmailDestination[]> {
		return this.#service.listDestinations(addressId);
	}

	async deleteDestination(addressId: string, destinationId: string): Promise<void> {
		return this.#service.deleteDestination(addressId, destinationId);
	}

	async send(params: EmailSendParams): Promise<EmailOutbound> {
		return this.#service.send(params);
	}

	async listInbound(addressId?: string): Promise<EmailInbound[]> {
		return this.#service.listInbound(addressId);
	}

	async getInbound(id: string): Promise<EmailInbound | null> {
		return this.#service.getInbound(id);
	}

	async deleteInbound(id: string): Promise<void> {
		return this.#service.deleteInbound(id);
	}

	async listOutbound(addressId?: string): Promise<EmailOutbound[]> {
		return this.#service.listOutbound(addressId);
	}

	async getOutbound(id: string): Promise<EmailOutbound | null> {
		return this.#service.getOutbound(id);
	}

	async deleteOutbound(id: string): Promise<void> {
		return this.#service.deleteOutbound(id);
	}

	async getActivity(params?: EmailActivityParams): Promise<EmailActivityResult> {
		return this.#service.getActivity(params);
	}
}
