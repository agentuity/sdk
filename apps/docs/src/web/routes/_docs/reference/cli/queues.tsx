import { createFileRoute } from '@tanstack/react-router';
import { MDXPage } from '../../../../components/docs/mdx-page';

export const Route = createFileRoute('/_docs/reference/cli/queues')({
	component: () => <MDXPage route="reference/cli/queues" />,
	staticData: { crumb: 'Queues' },
});
