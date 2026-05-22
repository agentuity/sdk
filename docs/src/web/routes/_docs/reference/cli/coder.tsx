import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/cli/coder')({
	component: () => <MDXPage route="reference/cli/coder" />,
	staticData: { crumb: 'Coder' },
});
