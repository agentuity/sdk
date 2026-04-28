import { type RouteConfig, index, route } from '@react-router/dev/routes';

export default [
	index('routes/home.tsx'),
	route('api/translate', 'routes/api.translate.ts'),
] satisfies RouteConfig;
