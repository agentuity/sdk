import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/services/observability/')({
	component: () => <MDXPage route="services/observability" />,
	staticData: { crumb: 'Observability' },
});
