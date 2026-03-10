import { createRouter } from '@agentuity/runtime';
import api from './index';
import echoRouter from './echo/route';
import eventsRouter from './events/route';

const router = createRouter();

// Mount the main API routes at root
router.route('/', api);

// Mount sub-routers at their file-based paths
router.route('/echo', echoRouter);
router.route('/events', eventsRouter);

export default router;
