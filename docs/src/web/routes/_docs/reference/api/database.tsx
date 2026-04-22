import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/api/database')({
	component: () => <MDXPage route="reference/api/database" />,
	staticData: { crumb: 'Databases' },
});
