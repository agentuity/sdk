import {
	StructuredError,
	type EmailService,
	type EmailAddress,
	type EmailDestination,
	type EmailConnectionConfig,
	type EmailInbound,
	type EmailOutbound,
	type EmailSendParams,
	type EmailActivityParams,
	type EmailActivityResult,
} from '@agentuity/core';

const ERROR_MESSAGE =
	'Email service is not available in local development mode. Deploy to Agentuity Cloud to use email.';

const LocalEmailNotAvailableError = StructuredError('LocalEmailNotAvailableError', ERROR_MESSAGE);

/**
 * Local development stub for the email service.
 * All methods throw a descriptive error directing users to deploy to Agentuity Cloud.
 */
export class LocalEmailStorage implements EmailService {
	async createAddress(_localPart: string): Promise<EmailAddress> {
		throw new LocalEmailNotAvailableError();
	}

	async listAddresses(): Promise<EmailAddress[]> {
		throw new LocalEmailNotAvailableError();
	}

	async getAddress(_id: string): Promise<EmailAddress | null> {
		throw new LocalEmailNotAvailableError();
	}

	async getConnectionConfig(_id: string): Promise<EmailConnectionConfig | null> {
		throw new LocalEmailNotAvailableError();
	}

	async deleteAddress(_id: string): Promise<void> {
		throw new LocalEmailNotAvailableError();
	}

	async createDestination(
		_addressId: string,
		_type: string,
		_config: Record<string, unknown>
	): Promise<EmailDestination> {
		throw new LocalEmailNotAvailableError();
	}

	async listDestinations(_addressId: string): Promise<EmailDestination[]> {
		throw new LocalEmailNotAvailableError();
	}

	async deleteDestination(_addressId: string, _destinationId: string): Promise<void> {
		throw new LocalEmailNotAvailableError();
	}

	async send(_params: EmailSendParams): Promise<EmailOutbound> {
		throw new LocalEmailNotAvailableError();
	}

	async listInbound(_addressId?: string): Promise<EmailInbound[]> {
		throw new LocalEmailNotAvailableError();
	}

	async getInbound(_id: string): Promise<EmailInbound | null> {
		throw new LocalEmailNotAvailableError();
	}

	async deleteInbound(_id: string): Promise<void> {
		throw new LocalEmailNotAvailableError();
	}

	async listOutbound(_addressId?: string): Promise<EmailOutbound[]> {
		throw new LocalEmailNotAvailableError();
	}

	async getOutbound(_id: string): Promise<EmailOutbound | null> {
		throw new LocalEmailNotAvailableError();
	}

	async deleteOutbound(_id: string): Promise<void> {
		throw new LocalEmailNotAvailableError();
	}

	async getActivity(_params?: EmailActivityParams): Promise<EmailActivityResult> {
		throw new LocalEmailNotAvailableError();
	}
}
