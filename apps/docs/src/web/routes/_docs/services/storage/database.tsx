import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/services/storage/database')({
	component: () => <MDXPage route="services/storage/database" />,
	staticData: { crumb: 'Database' },
});
