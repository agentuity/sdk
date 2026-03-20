# @agentuity/email

A standalone package for the Agentuity Email service.

## Installation

```bash
npm install @agentuity/email
```

## Quick Start

```typescript
import { EmailClient } from '@agentuity/email';

const client = new EmailClient();

// Create an email address
const addr = await client.createAddress('support');
console.log('Created:', addr.email); // support@agentuity.email

// Send an email
const result = await client.send({
  from: addr.email,
  to: ['user@example.com'],
  subject: 'Welcome!',
  text: 'Welcome to our platform.',
  html: '<h1>Welcome!</h1><p>Welcome to our platform.</p>'
});

// List inbound emails
const inbound = await client.listInbound(addr.id);
for (const msg of inbound) {
  console.log(`From: ${msg.from}, Subject: ${msg.subject}`);
}
```

## Configuration

```typescript
const client = new EmailClient({
  apiKey: 'your-api-key',
  url: 'https://api.agentuity.com',
});
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AGENTUITY_SDK_KEY` | API key for authentication | Required |
| `AGENTUITY_REGION` | Region for API endpoints | `usc` |
| `AGENTUITY_EMAIL_URL` | Override Email API URL | Auto-detected |

## License

Apache-2.0