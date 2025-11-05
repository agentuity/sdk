import { type ParsedMail, type Headers, simpleParser } from 'mailparser';

/**
 * A class representing an email with common information for processing.
 *
 * This class wraps the parsed email message and provides convenient accessor methods
 * for common email properties like subject, sender, recipient, body content, etc.
 */
export class Email {
	private readonly _message: ParsedMail;

	constructor(data: ParsedMail) {
		this._message = data;
	}

	toString(): string {
		return `[Email id=${this.messageId()},from=${this.fromEmail()},subject=${this.subject()}]`;
	}

	/**
	 * The date of the email.
	 */
	date(): Date | null {
		return this._message.date ?? null;
	}

	/**
	 * The message ID of the email.
	 */
	messageId(): string | null {
		return this._message.messageId ?? null;
	}

	/**
	 * The headers of the email.
	 */
	headers(): Headers {
		return this._message.headers;
	}

	/**
	 * The email address of the recipient or null if there is no recipient.
	 *
	 * If the email has multiple recipients, the email addresses are comma separated.
	 */
	to(): string | null {
		if (!this._message.to) {
			return null;
		}
		if (Array.isArray(this._message.to)) {
			return this._message.to
				.map((addr) => (addr.text ?? '').trim())
				.filter((text) => text.length > 0)
				.join(', ');
		}
		if (typeof this._message.to === 'object' && 'text' in this._message.to) {
			return this._message.to.text ? this._message.to.text.trim() : null;
		}
		return null;
	}

	/**
	 * The email address of the sender or null if there is no sender.
	 */
	fromEmail(): string | null {
		return this._message.from?.value[0]?.address ?? null;
	}

	/**
	 * The name of the sender or null if there is no name.
	 */
	fromName(): string | null {
		return this._message.from?.value[0]?.name ?? null;
	}

	/**
	 * The email address of the first recipient or null if there is no recipient.
	 */
	toEmail(): string | null {
		if (!this._message.to) {
			return null;
		}
		if (Array.isArray(this._message.to)) {
			return this._message.to[0]?.value[0]?.address ?? null;
		}
		if (typeof this._message.to === 'object' && 'value' in this._message.to) {
			return this._message.to.value[0]?.address ?? null;
		}
		return null;
	}

	/**
	 * The name of the first recipient or null if there is no name.
	 */
	toName(): string | null {
		if (!this._message.to) {
			return null;
		}
		if (Array.isArray(this._message.to)) {
			return this._message.to[0]?.value[0]?.name ?? null;
		}
		if (typeof this._message.to === 'object' && 'value' in this._message.to) {
			return this._message.to.value[0]?.name ?? null;
		}
		return null;
	}

	/**
	 * The subject of the email or null if there is no subject.
	 */
	subject(): string | null {
		return this._message.subject ?? null;
	}

	/**
	 * The plain text body of the email or null if there is no plain text body.
	 */
	text(): string | null {
		return this._message.text ?? null;
	}

	/**
	 * The HTML body of the email or null if there is no HTML body.
	 */
	html(): string | null {
		return this._message.html ? this._message.html : null;
	}

	/**
	 * The attachments of the email or an empty array if there are no attachments.
	 *
	 * Note: Attachment handling is minimal in this implementation.
	 * For full attachment support with SSRF protection, see the sdk-js implementation.
	 */
	attachments(): Array<{ filename: string; contentType: string }> {
		if (!this._message.attachments || this._message.attachments.length === 0) {
			return [];
		}
		return this._message.attachments.map((att) => ({
			filename: att.filename ?? 'unknown',
			contentType: att.contentType ?? 'application/octet-stream',
		}));
	}
}

/**
 * Parse an email from a buffer and return an Email object.
 *
 * @param data - The raw RFC822 email message as a Buffer
 * @returns A promise that resolves to an Email object
 * @throws Error if the email cannot be parsed or if the input is not a valid RFC822 message
 */
export async function parseEmail(data: Buffer): Promise<Email> {
	if (data.length === 0) {
		throw new Error('Failed to parse email: empty buffer');
	}

	const first16KB = data.slice(0, 16384).toString('utf-8', 0, Math.min(data.length, 16384));
	const hasHeaders = /(^|\r?\n)[!-9;-~]+:\s/.test(first16KB);

	if (!hasHeaders) {
		throw new Error('Failed to parse email: missing headers');
	}

	try {
		const message = await simpleParser(data);
		return new Email(message);
	} catch (error) {
		throw new Error(
			`Failed to parse email: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
}
