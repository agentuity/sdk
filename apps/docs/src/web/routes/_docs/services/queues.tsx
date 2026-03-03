import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/services/queues')({
	component: () => <MDXPage route="services/queues" />,
	staticData: { crumb: 'Queues' },
});
