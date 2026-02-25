import type {
	EmailService,
	EmailAddress,
	EmailDestination,
	EmailInbound,
	EmailOutbound,
	EmailSendParams,
} from '@agentuity/core';

const ERROR_MESSAGE =
	'Email service is not available in local development mode. Deploy to Agentuity Cloud to use email.';

/**
 * Local development stub for the email service.
 * All methods throw a descriptive error directing users to deploy to Agentuity Cloud.
 */
export class LocalEmailStorage implements EmailService {
	async createAddress(_localPart: string): Promise<EmailAddress> {
		throw new Error(ERROR_MESSAGE);
	}

	async listAddresses(): Promise<EmailAddress[]> {
		throw new Error(ERROR_MESSAGE);
	}

	async getAddress(_id: string): Promise<EmailAddress | null> {
		throw new Error(ERROR_MESSAGE);
	}

	async deleteAddress(_id: string): Promise<void> {
		throw new Error(ERROR_MESSAGE);
	}

	async createDestination(
		_addressId: string,
		_type: string,
		_config: Record<string, unknown>
	): Promise<EmailDestination> {
		throw new Error(ERROR_MESSAGE);
	}

	async listDestinations(_addressId: string): Promise<EmailDestination[]> {
		throw new Error(ERROR_MESSAGE);
	}

	async deleteDestination(_addressId: string, _destinationId: string): Promise<void> {
		throw new Error(ERROR_MESSAGE);
	}

	async send(_params: EmailSendParams): Promise<EmailOutbound> {
		throw new Error(ERROR_MESSAGE);
	}

	async listInbound(_addressId?: string): Promise<EmailInbound[]> {
		throw new Error(ERROR_MESSAGE);
	}

	async getInbound(_id: string): Promise<EmailInbound | null> {
		throw new Error(ERROR_MESSAGE);
	}

	async listOutbound(_addressId?: string): Promise<EmailOutbound[]> {
		throw new Error(ERROR_MESSAGE);
	}

	async getOutbound(_id: string): Promise<EmailOutbound | null> {
		throw new Error(ERROR_MESSAGE);
	}
}
