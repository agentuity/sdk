import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/api/evaluations')({
	component: () => <MDXPage route="reference/api/evaluations" />,
	staticData: { crumb: 'Evaluations' },
});
