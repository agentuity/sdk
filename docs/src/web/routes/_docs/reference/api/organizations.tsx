import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/api/organizations')({
	component: () => <MDXPage route="reference/api/organizations" />,
	staticData: { crumb: 'Organizations' },
});
