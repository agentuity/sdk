import { createRouter } from '@agentuity/runtime';

const router = createRouter();

router.get('/status', (c) => c.json({ status: 'online', file: 'index.ts' }));
router.get('/info', (c) => c.json({ name: 'my-service', version: '1.0.0' }));

export default router;
