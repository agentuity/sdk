import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/services/storage/')({
	component: () => <MDXPage route="services/storage" />,
	staticData: { crumb: 'Storage' },
});
