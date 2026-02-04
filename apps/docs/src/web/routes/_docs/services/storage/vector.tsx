import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/services/storage/vector')({
	component: () => <MDXPage route="services/storage/vector" />,
	staticData: { crumb: 'Vector' },
});
