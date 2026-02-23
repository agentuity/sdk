import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/cli/debugging')({
	component: () => <MDXPage route="reference/cli/debugging" />,
	staticData: { crumb: 'Debugging' },
});
