import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/api/workflows')({
	component: () => <MDXPage route="reference/api/workflows" />,
	staticData: { crumb: 'Workflows' },
});
