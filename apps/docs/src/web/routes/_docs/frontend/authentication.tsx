import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/frontend/authentication')({
	component: () => <MDXPage route="frontend/authentication" />,
	staticData: { crumb: 'Authentication' },
});
