import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/services/observability/evals-and-testing')({
	component: () => <MDXPage route="services/observability/evals-and-testing" />,
	staticData: { crumb: 'Evals and testing' },
});
