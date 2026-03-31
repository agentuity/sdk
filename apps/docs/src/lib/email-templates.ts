export const EMAIL_FROM = 'hello-explorer@agentuity.email';
export const EMAIL_TO = ['inbox-explorer@agentuity.email'];
export const EMAIL_NAME = 'Explorer';

export type EmailTemplateId = 'welcome';

export function generateEmailContent(
	template: EmailTemplateId,
	name: string
): { subject: string; html: string; text: string } {
	return {
		subject: 'Hello from the SDK Explorer',
		text: 'This email was sent by an Agentuity agent using ctx.email.send(). Agents can also handle queues, databases, webhooks, and scheduled tasks. Reply to this email to see what happens next.',
		html: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
  <p style="font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
    This email was sent by an Agentuity agent using <code style="font-size: 13px;">ctx.email.send()</code>.
  </p>
  <p style="font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
    Agents can also handle queues, databases, webhooks, and scheduled tasks.
  </p>
  <p style="font-size: 15px; line-height: 1.6; margin: 0;">
    Reply to this email to see what happens next.
  </p>
</div>`.trim(),
	};
}
