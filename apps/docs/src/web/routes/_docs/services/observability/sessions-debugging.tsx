import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page.tsx';

export const Route = createFileRoute('/_docs/services/observability/sessions-debugging')({
	component: () => <MDXPage route="services/observability/sessions-debugging" />,
	staticData: { crumb: 'Sessions & Debugging' },
});
