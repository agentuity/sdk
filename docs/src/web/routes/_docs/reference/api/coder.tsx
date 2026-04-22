import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/api/coder')({
	component: () => <MDXPage route="reference/api/coder" />,
	staticData: { crumb: 'Coder' },
});
