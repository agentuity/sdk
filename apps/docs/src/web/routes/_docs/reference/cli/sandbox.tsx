import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/cli/sandbox')({
	component: () => <MDXPage route="reference/cli/sandbox" />,
	staticData: { crumb: 'Sandbox' },
});
