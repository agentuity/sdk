import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/services/authentication')({
	component: () => <MDXPage route="services/authentication" />,
	staticData: { crumb: 'Authentication' },
});
