import { createApp } from '@agentuity/runtime';
import { bootstrapRuntimeEnv } from '@agentuity/cli';

// Bootstrap runtime environment based on active profile
// This loads .env.{profile} and agentuity.{profile}.json
await bootstrapRuntimeEnv();

const app = await createApp();

// Log server configuration for debugging
console.log(`[CLOUD-DEPLOYMENT] Profile: ${process.env.AGENTUITY_PROFILE || 'default'}`);
console.log(`[CLOUD-DEPLOYMENT] Region: ${process.env.AGENTUITY_REGION || 'default'}`);

export default app;
