import { createRouter } from '@agentuity/runtime';
import api from './index';
import agentIdsRouter from './agent-ids/route';
import authRouter from './auth/route';
import customNameRouter from './custom-name/foobar';
import middlewareTestRouter from './middleware-test/route';
import myServiceRouter from './my-service/index';
import usersProfileRouter from './users/profile/route';

const router = createRouter();

// Mount root API routes
router.route('/', api);

// Mount sub-routers at their paths
router.route('/agent-ids', agentIdsRouter);
router.route('/auth', authRouter);
router.route('/custom-name', customNameRouter);
router.route('/middleware-test', middlewareTestRouter);
router.route('/my-service', myServiceRouter);
router.route('/users/profile', usersProfileRouter);

export default router;
