import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/api/regions')({
	component: () => <MDXPage route="reference/api/regions" />,
	staticData: { crumb: 'Regions' },
});
