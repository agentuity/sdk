import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/api/queues')({
	component: () => <MDXPage route="reference/api/queues" />,
	staticData: { crumb: 'Message Queues' },
});
