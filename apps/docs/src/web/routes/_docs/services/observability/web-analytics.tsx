import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/services/observability/web-analytics')({
	component: () => <MDXPage route="services/observability/web-analytics" />,
	staticData: { crumb: 'Web Analytics' },
});
