import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/api/vector')({
	component: () => <MDXPage route="reference/api/vector" />,
	staticData: { crumb: 'Vector Search' },
});
