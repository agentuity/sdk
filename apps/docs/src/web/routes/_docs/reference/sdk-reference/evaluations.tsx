import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/sdk-reference/evaluations')({
	component: () => <MDXPage route="reference/sdk-reference/evaluations" />,
	staticData: { crumb: 'Evaluations' },
});
