import { s } from '@agentuity/schema';

export const EMAIL_ADDRESS_SCHEMA = s.string().email();

export const EMAIL_FROM = 'hello-explorer@agentuity.email';
export const EMAIL_TO = ['inbox-explorer@agentuity.email'];
export const EMAIL_SUBJECT = 'Hello from the Agentuity SDK Explorer';

export function isValidEmail(value: string): boolean {
	return EMAIL_ADDRESS_SCHEMA.safeParse(value).success;
}

export function generateEmailContent(): { subject: string; html: string; text: string } {
	return {
		subject: EMAIL_SUBJECT,
		text: "This is a demo email from Agentuity's SDK Explorer. It was sent through the Email service. Agentuity apps can also use queues, databases, webhooks, scheduled tasks, and more.",
		html: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
  <p style="font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
    This is a demo email from Agentuity's SDK Explorer.
  </p>
  <p style="font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
    It was sent through the Email service.
  </p>
  <p style="font-size: 15px; line-height: 1.6; margin: 0;">
    Agentuity apps can also use queues, databases, webhooks, scheduled tasks, and more.
  </p>
</div>`.trim(),
	};
}
