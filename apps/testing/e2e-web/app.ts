import { createApp } from '@agentuity/runtime';
import { bootstrapRuntimeEnv } from '@agentuity/runtime';

await bootstrapRuntimeEnv();

const app = await createApp();

export default app;
