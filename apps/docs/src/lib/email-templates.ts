export const EMAIL_FROM = 'hello-explorer@agentuity.email';
export const EMAIL_TO = ['inbox-explorer@agentuity.email'];
export const EMAIL_NAME = 'Explorer';

export type EmailTemplateId = 'welcome' | 'order-confirmation' | 'weekly-digest';

export function generateEmailContent(
	template: EmailTemplateId,
	name: string
): { subject: string; html: string; text: string } {
	switch (template) {
		case 'welcome':
			return {
				subject: `Welcome to Agentuity, ${name}!`,
				text: `Welcome, ${name}!\n\nWe're glad you're here. Getting started:\n- Create your first agent with createAgent()\n- Connect storage with ctx.kv and ctx.vector\n- Use the AI Gateway for multi-provider access\n- Deploy with agentuity deploy\n\nSent from the Agentuity SDK Explorer`,
				html: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px; background: #fafafa; border-radius: 8px;">
  <div style="text-align: center; margin-bottom: 24px;">
    <h1 style="color: #111; font-size: 24px; margin: 0;">Welcome, ${name}!</h1>
    <p style="color: #666; font-size: 14px; margin-top: 8px;">We're glad you're here.</p>
  </div>
  <div style="background: #fff; border: 1px solid #e5e5e5; border-radius: 6px; padding: 24px;">
    <h2 style="color: #111; font-size: 16px; margin: 0 0 16px;">Getting Started</h2>
    <ul style="color: #444; font-size: 14px; line-height: 1.8; padding-left: 20px; margin: 0;">
      <li>Create your first agent with <code style="background: #f0f0f0; padding: 2px 6px; border-radius: 3px;">createAgent()</code></li>
      <li>Connect storage with <code style="background: #f0f0f0; padding: 2px 6px; border-radius: 3px;">ctx.kv</code> and <code style="background: #f0f0f0; padding: 2px 6px; border-radius: 3px;">ctx.vector</code></li>
      <li>Use the AI Gateway for multi-provider access</li>
      <li>Deploy with <code style="background: #f0f0f0; padding: 2px 6px; border-radius: 3px;">agentuity deploy</code></li>
    </ul>
  </div>
  <p style="color: #999; font-size: 12px; text-align: center; margin-top: 24px;">Sent from the Agentuity SDK Explorer</p>
</div>`.trim(),
			};

		case 'order-confirmation': {
			const orderId = 847293;
			return {
				subject: `Order Confirmed #${orderId}`,
				text: `Order Confirmed #${orderId}\n\nHi ${name}, your order has been confirmed.\n\nAgentuity Pro Plan: $49.00\nAI Gateway Add-on: $19.00\nVector Storage (10GB): $12.00\nTotal: $80.00\n\nSent from the Agentuity SDK Explorer`,
				html: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px; background: #fafafa; border-radius: 8px;">
  <div style="text-align: center; margin-bottom: 24px;">
    <h1 style="color: #111; font-size: 24px; margin: 0;">Order Confirmed</h1>
    <p style="color: #666; font-size: 14px; margin-top: 8px;">Order #${orderId}</p>
  </div>
  <div style="background: #fff; border: 1px solid #e5e5e5; border-radius: 6px; padding: 24px;">
    <p style="color: #444; font-size: 14px; margin: 0 0 16px;">Hi ${name}, your order has been confirmed.</p>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 8px 0; color: #444;">Agentuity Pro Plan</td>
        <td style="padding: 8px 0; color: #444; text-align: right;">$49.00</td>
      </tr>
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 8px 0; color: #444;">AI Gateway Add-on</td>
        <td style="padding: 8px 0; color: #444; text-align: right;">$19.00</td>
      </tr>
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 8px 0; color: #444;">Vector Storage (10GB)</td>
        <td style="padding: 8px 0; color: #444; text-align: right;">$12.00</td>
      </tr>
      <tr>
        <td style="padding: 12px 0; color: #111; font-weight: 600;">Total</td>
        <td style="padding: 12px 0; color: #111; font-weight: 600; text-align: right;">$80.00</td>
      </tr>
    </table>
  </div>
  <p style="color: #999; font-size: 12px; text-align: center; margin-top: 24px;">Sent from the Agentuity SDK Explorer</p>
</div>`.trim(),
			};
		}

		case 'weekly-digest':
			return {
				subject: `Your Weekly Digest, ${name}`,
				text: `Weekly Digest\n\nHi ${name}, here's your summary for this week.\n\nThis Week's Stats:\n- 1,247 Agent Invocations\n- 98.7% Success Rate\n- 142ms Avg Latency\n\nTop Agents:\n1. chat-assistant (523 calls)\n2. data-processor (312 calls)\n3. email-sender (198 calls)\n\nSent from the Agentuity SDK Explorer`,
				html: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px; background: #fafafa; border-radius: 8px;">
  <div style="text-align: center; margin-bottom: 24px;">
    <h1 style="color: #111; font-size: 24px; margin: 0;">Weekly Digest</h1>
    <p style="color: #666; font-size: 14px; margin-top: 8px;">Hi ${name}, here's your summary for this week.</p>
  </div>
  <div style="background: #fff; border: 1px solid #e5e5e5; border-radius: 6px; padding: 24px;">
    <h2 style="color: #111; font-size: 16px; margin: 0 0 16px;">This Week's Stats</h2>
    <div style="display: flex; gap: 16px; margin-bottom: 16px;">
      <div style="flex: 1; background: #f5f5f5; border-radius: 6px; padding: 16px; text-align: center;">
        <div style="color: #111; font-size: 24px; font-weight: 600;">1,247</div>
        <div style="color: #666; font-size: 12px; margin-top: 4px;">Agent Invocations</div>
      </div>
      <div style="flex: 1; background: #f5f5f5; border-radius: 6px; padding: 16px; text-align: center;">
        <div style="color: #111; font-size: 24px; font-weight: 600;">98.7%</div>
        <div style="color: #666; font-size: 12px; margin-top: 4px;">Success Rate</div>
      </div>
      <div style="flex: 1; background: #f5f5f5; border-radius: 6px; padding: 16px; text-align: center;">
        <div style="color: #111; font-size: 24px; font-weight: 600;">142ms</div>
        <div style="color: #666; font-size: 12px; margin-top: 4px;">Avg Latency</div>
      </div>
    </div>
    <h2 style="color: #111; font-size: 16px; margin: 16px 0 12px;">Top Agents</h2>
    <ol style="color: #444; font-size: 14px; line-height: 1.8; padding-left: 20px; margin: 0;">
      <li>chat-assistant (523 calls)</li>
      <li>data-processor (312 calls)</li>
      <li>email-sender (198 calls)</li>
    </ol>
  </div>
  <p style="color: #999; font-size: 12px; text-align: center; margin-top: 24px;">Sent from the Agentuity SDK Explorer</p>
</div>`.trim(),
			};

		default:
			return {
				subject: `Message from Agentuity, ${name}`,
				text: `Hello ${name}, this is a message from Agentuity.`,
				html: `<p>Hello ${name}, this is a message from Agentuity.</p>`,
			};
	}
}
