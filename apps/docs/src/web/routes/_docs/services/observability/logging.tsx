import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page.tsx';

export const Route = createFileRoute('/_docs/services/observability/logging')({
	component: () => <MDXPage route="services/observability/logging" />,
	staticData: { crumb: 'Logging' },
});
