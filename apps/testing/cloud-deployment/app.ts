import { createApp } from '@agentuity/runtime';
import { bootstrapRuntimeEnv } from '@agentuity/cli';

// Bootstrap runtime environment based on active profile
// This loads .env.{profile} and agentuity.{profile}.json
await bootstrapRuntimeEnv();

const app = await createApp();

export default app;
