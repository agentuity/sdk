import { createApp } from '@agentuity/runtime';
import { bootstrapRuntimeEnv } from '@agentuity/cli';

await bootstrapRuntimeEnv();

const app = await createApp();

export default app;
