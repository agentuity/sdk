import { createRouter } from '@agentuity/runtime.ts';

const router = createRouter();

router.get('/custom', (c) => c.json({ source: 'foobar.ts', custom: true }));
router.post('/test', (c) => c.json({ created: true }));

export default router;
