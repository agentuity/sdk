import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/routes/middleware')({
	component: () => <MDXPage route="routes/middleware" />,
	staticData: { crumb: 'Middleware' },
});
